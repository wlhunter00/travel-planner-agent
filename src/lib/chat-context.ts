import type { UIMessage } from "ai";

const TOOL_RESULT_MAX_BYTES = 50_000;
const COMPRESSION_TRIGGER_BYTES = 800_000;
const KEEP_LAST_USER_TURNS = 4;

export function stripPhotoUrls(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripPhotoUrls);
  if (typeof obj === "object" && obj !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = k === "photoUrl" && typeof v === "string" ? "[photo]" : stripPhotoUrls(v);
    }
    return out;
  }
  return obj;
}

export function isToolPart(part: { type?: unknown }): boolean {
  return typeof part.type === "string" && (part.type.startsWith("tool-") || part.type === "dynamic-tool");
}

export function getToolPartName(part: Record<string, unknown>): string {
  if (part.type === "dynamic-tool" && typeof part.toolName === "string") return part.toolName;
  if (typeof part.type === "string" && part.type.startsWith("tool-")) return part.type.slice(5);
  return "unknown";
}

export function readToolOutput(
  part: Record<string, unknown>,
): { value: unknown; key: "output" | "result" | null } {
  if (part.output !== undefined) return { value: part.output, key: "output" };
  if (part.result !== undefined) return { value: part.result, key: "result" };
  return { value: undefined, key: null };
}

/**
 * Returns the N largest tool results across all assistant messages, sorted
 * descending by serialized size. Used by request-time telemetry. Handles both
 * v6 (`tool-${name}` + `output`) and legacy v5 (`tool-invocation` + `result`)
 * shapes via the shared helpers above.
 */
export function topNLargestToolResults(
  messages: UIMessage[],
  n: number,
): { toolName: string; sizeKB: number; msgIndex: number }[] {
  const sized: { toolName: string; sizeKB: number; msgIndex: number }[] = [];
  messages.forEach((m, msgIndex) => {
    if (m.role !== "assistant") return;
    for (const part of m.parts) {
      const p = part as Record<string, unknown>;
      if (!isToolPart(p)) continue;
      const { value } = readToolOutput(p);
      if (value === undefined) continue;
      const sizeKB = Math.round(JSON.stringify(value).length / 1024);
      sized.push({ toolName: getToolPartName(p), sizeKB, msgIndex });
    }
  });
  return sized.sort((a, b) => b.sizeKB - a.sizeKB).slice(0, n);
}

export function capToolResult(result: unknown, maxBytes: number): unknown {
  let serialized: string;
  try {
    serialized = JSON.stringify(result);
  } catch {
    return result;
  }
  if (serialized.length <= maxBytes) return result;
  if (Array.isArray(result)) {
    if (result.length <= 25) return result;
    return [...result.slice(0, 25), { _truncated: true, droppedItems: result.length - 25 }];
  }
  if (typeof result === "object" && result !== null) {
    const out: Record<string, unknown> = {};
    let didTruncate = false;
    for (const [k, v] of Object.entries(result)) {
      if (Array.isArray(v) && v.length > 25) {
        out[k] = [...v.slice(0, 25), { _truncated: true, droppedItems: v.length - 25 }];
        didTruncate = true;
      } else {
        out[k] = v;
      }
    }
    if (didTruncate) return out;
  }
  return { _truncated: true, summary: `<oversized result, ${serialized.length} bytes elided>` };
}

function extractTopNames(output: unknown, limit: number): string[] {
  const names: string[] = [];
  const visit = (obj: unknown, depth: number) => {
    if (names.length >= limit || depth > 4) return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (names.length >= limit) return;
        visit(item, depth + 1);
      }
    } else if (typeof obj === "object" && obj !== null) {
      const o = obj as Record<string, unknown>;
      const candidate = o.name ?? o.title ?? o.id;
      if (typeof candidate === "string" && candidate.length > 0 && candidate.length < 80) {
        names.push(candidate);
      } else {
        for (const v of Object.values(o)) {
          if (names.length >= limit) return;
          if (typeof v === "object") visit(v, depth + 1);
        }
      }
    }
  };
  visit(output, 0);
  return names;
}

function summarizeToolOutput(toolName: string, output: unknown): { summary: string; _compressed: true } {
  let count = 1;
  if (Array.isArray(output)) count = output.length;
  else if (typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    if (Array.isArray(o.items)) count = o.items.length;
    else if (Array.isArray(o.results)) count = o.results.length;
    else count = Object.keys(o).length;
  }
  const top = extractTopNames(output, 3);
  const tail = top.length > 0 ? `, e.g. ${top.join("; ")}` : "";
  return { summary: `<${toolName}: ${count} item${count === 1 ? "" : "s"}${tail}>`, _compressed: true };
}

function applySlidingWindowCompression(messages: UIMessage[]): UIMessage[] {
  const userTurnIndices: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === "user") userTurnIndices.push(i);
  });
  if (userTurnIndices.length <= KEEP_LAST_USER_TURNS) return messages;
  const cutoffIndex = userTurnIndices[userTurnIndices.length - KEEP_LAST_USER_TURNS];

  return messages.map((m, i) => {
    if (i >= cutoffIndex || m.role !== "assistant") return m;
    const newParts = m.parts.map((part) => {
      const p = part as Record<string, unknown>;
      if (!isToolPart(p)) return part;
      const { value: output, key } = readToolOutput(p);
      if (output === undefined || key === null) return part;
      if ((output as { _compressed?: boolean })?._compressed) return part;
      const toolName = getToolPartName(p);
      const next = { ...p };
      next[key] = summarizeToolOutput(toolName, output);
      return next as typeof part;
    });
    return { ...m, parts: newParts };
  });
}

/**
 * Each chat POST is stateless. Assistant UI parts retain OpenAI Responses `itemId`s
 * from the prior stream; with default store:true the provider turns those into
 * `item_reference` instead of text, which is invalid on a new HTTP request.
 * Strip ephemeral provider ids and reasoning scaffolding so history round-trips as plain content.
 *
 * Also caps oversized tool results and, when total context exceeds the
 * COMPRESSION_TRIGGER_BYTES threshold, summarizes tool outputs older than the
 * last KEEP_LAST_USER_TURNS user turns to stay below GPT-5.4's 272K cost cliff.
 */
export function sanitizeMessagesForStatelessRequest(raw: unknown[]): UIMessage[] {
  const sanitized = (Array.isArray(raw) ? raw : []).map((msg) => {
    if (
      typeof msg !== "object" ||
      msg === null ||
      !("role" in msg) ||
      !("parts" in msg) ||
      !Array.isArray((msg as { parts: unknown }).parts)
    ) {
      return msg as UIMessage;
    }
    const m = msg as UIMessage;
    if (m.role !== "assistant") return m;

    const parts = m.parts
      .filter((p) => p.type !== "reasoning" && p.type !== "step-start")
      .map((part) => {
        const next = { ...part } as Record<string, unknown>;
        delete next.providerMetadata;
        delete next.callProviderMetadata;
        if (isToolPart(next)) {
          const { value: output, key } = readToolOutput(next);
          if (output !== undefined && key !== null) {
            const stripped = stripPhotoUrls(output);
            next[key] = capToolResult(stripped, TOOL_RESULT_MAX_BYTES);
          }
        }
        return next as (typeof m.parts)[number];
      });

    return { ...m, parts };
  });

  const totalBytes = JSON.stringify(sanitized).length;
  if (totalBytes < COMPRESSION_TRIGGER_BYTES) return sanitized;
  console.log("[chat-telemetry] sliding-window compression engaged", {
    totalBytes,
    keepLastUserTurns: KEEP_LAST_USER_TURNS,
  });
  return applySlidingWindowCompression(sanitized);
}
