/**
 * Multi-turn chat E2E: same client stack as the browser (DefaultChatTransport + readUIMessageStream).
 *
 * Requires: `npm run dev` (or BASE_URL pointing at a running app).
 *
 * Usage:
 *   npx tsx scripts/test-chat.mts "first user message" "second user message"
 *   npx tsx scripts/test-chat.mts --file ./chat-debug.json
 *
 * Env:
 *   BASE_URL  (default http://localhost:3000)
 *   TRIP_ID   (optional, default random UUID)
 *   VERBOSE   set to "1" for full reasoning + tool-result dumps
 *   SKIP_RESET_PREFERENCES  set to "1" to keep .travel-planner/preferences.json between runs
 */

import { config } from "dotenv";
import { readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import {
  DefaultChatTransport,
  readUIMessageStream,
  getToolName,
  isToolUIPart,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const tripId = process.env.TRIP_ID ?? crypto.randomUUID();
const VERBOSE = process.env.VERBOSE === "1";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeUserMessage(text: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function extractTextFromMessage(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function toolNamesFromParts(parts: UIMessage["parts"]): string[] {
  const names: string[] = [];
  for (const p of parts) {
    if (isToolUIPart(p)) names.push(getToolName(p));
  }
  return [...new Set(names)];
}

function ts(t0: number): string {
  return ((Date.now() - t0) / 1000).toFixed(1) + "s";
}

/** Mirrors `emptyPreferences()` in src/lib/preferences-store — keeps scenarios isolated without ESM path issues from scripts/. */
async function resetPreferencesIfNeeded(): Promise<void> {
  if (process.env.SKIP_RESET_PREFERENCES === "1") return;
  const dir = join(process.cwd(), ".travel-planner");
  const file = join(dir, "preferences.json");
  await mkdir(dir, { recursive: true });
  const empty = {
    travelStyle: [] as string[],
    accommodationStyle: [] as string[],
    cuisinePreferences: [] as string[],
    dietaryRestrictions: [] as string[],
    activityInterests: [] as string[],
    transportPreference: [] as string[],
    avoids: [] as string[],
    airlinePreferences: [] as string[],
    budgetRange: "",
    splurgeCategories: [] as string[],
    saveCategories: [] as string[],
    pastTrips: [] as unknown[],
    lastUpdated: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(empty, null, 2), "utf-8");
}

function indent(text: string, prefix: string, maxLines = 30): string {
  const lines = text.split("\n");
  const shown = lines.slice(0, maxLines).map((l) => prefix + l);
  if (lines.length > maxLines) shown.push(prefix + `… (${lines.length - maxLines} more lines)`);
  return shown.join("\n");
}

/** Dump all parts of a UIMessage for debugging */
function dumpParts(msg: UIMessage, t0: number) {
  console.log(`\n  ── Parts breakdown (${msg.parts.length} parts) ──`);
  for (let i = 0; i < msg.parts.length; i++) {
    const p = msg.parts[i]!;
    const tag = `  [${i}] ${p.type}`;
    switch (p.type) {
      case "step-start":
        console.log(`${tag}`);
        break;
      case "reasoning": {
        const rp = p as { type: "reasoning"; text: string };
        if (rp.text) {
          console.log(`${tag} (${rp.text.length} chars):`);
          console.log(indent(rp.text, "      ", 15));
        } else {
          console.log(`${tag} (empty — encrypted/hidden)`);
        }
        break;
      }
      case "text": {
        const tp = p as { type: "text"; text: string };
        console.log(`${tag} (${tp.text.length} chars)`);
        if (VERBOSE) console.log(indent(tp.text, "      ", 25));
        break;
      }
      default: {
        if (isToolUIPart(p)) {
          const name = getToolName(p);
          const state = "state" in p ? (p as { state: string }).state : "?";
          console.log(`${tag} tool=${name} state=${state}`);
          if (VERBOSE) {
            const output = "output" in p ? (p as { output: unknown }).output : undefined;
            if (output !== undefined) {
              const out = JSON.stringify(output);
              console.log(indent(out.slice(0, 2000), "      ", 20));
            }
          }
        } else {
          console.log(`${tag}`);
        }
        break;
      }
    }
  }
  console.log("  ── end parts ──\n");
}

// ── input parsing ────────────────────────────────────────────────────────────

function loadUserTurnsFromFile(filePath: string): string[] {
  const raw: unknown = JSON.parse(readFileSync(resolve(filePath), "utf-8"));
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).filter(Boolean);
  }
  if (typeof raw === "object" && raw !== null && "messages" in raw) {
    const msgs = (raw as { messages: unknown }).messages;
    if (!Array.isArray(msgs)) throw new Error("Invalid JSON: messages must be an array");
    const texts: string[] = [];
    for (const m of msgs) {
      if (typeof m !== "object" || m === null) continue;
      const role = (m as { role?: string }).role;
      const parts = (m as { parts?: unknown }).parts;
      if (role !== "user" || !Array.isArray(parts)) continue;
      const text = parts
        .filter(
          (p): p is { type: string; text: string } =>
            typeof p === "object" && p !== null && "type" in p &&
            (p as { type: string }).type === "text" && "text" in p
        )
        .map((p) => p.text)
        .join("");
      if (text) texts.push(text);
    }
    if (texts.length === 0) throw new Error("No user text parts found in messages[]");
    return texts;
  }
  throw new Error("JSON must be string[] or { messages: [...] } (e.g. exported chat debug)");
}

function parseCli(): string[] {
  const argv = process.argv.slice(2);
  let filePath: string | null = null;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file" || a === "-f") {
      filePath = argv[++i] ?? "";
      if (!filePath) throw new Error("--file requires a path");
    } else {
      positional.push(a!);
    }
  }

  if (filePath) return loadUserTurnsFromFile(filePath);
  if (positional.length > 0) return positional;
  return ["hello"];
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const userTurns = parseCli();
  await resetPreferencesIfNeeded();

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  Chat API test                                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Endpoint: ${BASE}/api/chat`);
  console.log(`  tripId:   ${tripId}`);
  console.log(`  Turns:    ${userTurns.length} user message(s)`);
  console.log(`  Verbose:  ${VERBOSE ? "ON" : "OFF (set VERBOSE=1 for full dumps)"}`);
  console.log(
    `  Prefs:    ${process.env.SKIP_RESET_PREFERENCES === "1" ? "kept (SKIP_RESET_PREFERENCES=1)" : "reset to empty for this run"}\n`
  );

  const transport = new DefaultChatTransport<UIMessage>({
    api: `${BASE}/api/chat`,
    body: { tripId },
  });

  let history: UIMessage[] = [];

  for (let turn = 0; turn < userTurns.length; turn++) {
    const text = userTurns[turn]!;
    history = [...history, makeUserMessage(text)];

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  TURN ${turn + 1}/${userTurns.length} — USER`);
    console.log("=".repeat(60));
    console.log(text.length > 400 ? `${text.slice(0, 400)}…` : text);

    const t0 = Date.now();
    let stream: ReadableStream<UIMessageChunk>;
    try {
      stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: tripId,
        messageId: undefined,
        messages: history,
        abortSignal: undefined,
      });
    } catch (err) {
      console.error(`\n  REQUEST FAILED (${ts(t0)}):`, err instanceof Error ? err.message : err);
      process.exit(1);
    }

    console.log(`  → Request sent (${ts(t0)}), reading stream…\n`);

    let finalAssistant: UIMessage | undefined;
    let streamError: Error | undefined;
    let textChars = 0;
    const seenTools: string[] = [];
    let lastLogTime = t0;
    let stepCount = 0;
    let reasoningChars = 0;

    const ticker = setInterval(() => {
      const toolStr = seenTools.length ? ` | tools: ${seenTools.join(", ")}` : "";
      const reasonStr = reasoningChars > 0 ? ` | reasoning: ${reasoningChars}ch` : "";
      console.log(`  ⏳ ${ts(t0)} | ${textChars}ch text | ${stepCount} steps${toolStr}${reasonStr}`);
    }, 5000);

    try {
      for await (const msg of readUIMessageStream({
        stream,
        onError: (err) => {
          streamError = err instanceof Error ? err : new Error(String(err));
        },
      })) {
        finalAssistant = msg;

        const nowText = extractTextFromMessage(msg);
        const nowTools = toolNamesFromParts(msg.parts);
        const nowSteps = msg.parts.filter((p) => p.type === "step-start").length;
        const nowReasoning = msg.parts
          .filter((p) => p.type === "reasoning")
          .reduce((acc, p) => acc + ((p as { text: string }).text?.length ?? 0), 0);

        // Log reasoning as it appears
        if (nowReasoning > reasoningChars) {
          const delta = nowReasoning - reasoningChars;
          console.log(`  🧠 ${ts(t0)} — reasoning +${delta}ch (${nowReasoning}ch total)`);
          // Show the actual reasoning text
          const reasoningParts = msg.parts.filter((p) => p.type === "reasoning");
          for (const rp of reasoningParts) {
            const rpText = (rp as { text: string }).text;
            if (rpText && rpText.length > reasoningChars) {
              const newText = rpText.slice(Math.max(0, reasoningChars));
              if (newText.trim()) {
                console.log(indent(newText.trim(), "      │ ", 8));
              }
            }
          }
          reasoningChars = nowReasoning;
          lastLogTime = Date.now();
        }

        // Log new step boundaries
        if (nowSteps > stepCount) {
          stepCount = nowSteps;
          console.log(`  ▶ ${ts(t0)} — step ${stepCount}`);
          lastLogTime = Date.now();
        }

        // Log new tool calls as they appear
        for (const t of nowTools) {
          if (!seenTools.includes(t)) {
            seenTools.push(t);
            console.log(`  🔧 ${ts(t0)} — tool call: ${t}`);

            if (VERBOSE) {
              for (const p of msg.parts) {
                if (isToolUIPart(p) && getToolName(p) === t) {
                  const state = "state" in p ? (p as { state: string }).state : "?";
                  const output = "output" in p ? (p as { output: unknown }).output : undefined;
                  if (output !== undefined) {
                    const out = JSON.stringify(output);
                    console.log(indent(out.slice(0, 1000), "      ", 10));
                  } else {
                    console.log(`      (state: ${state})`);
                  }
                }
              }
            }
            lastLogTime = Date.now();
          }
        }

        // Log text progress periodically
        if (nowText.length > textChars && Date.now() - lastLogTime > 8000) {
          console.log(`  📝 ${ts(t0)} — ${nowText.length}ch streamed`);
          lastLogTime = Date.now();
        }

        textChars = nowText.length;
      }
    } catch (err) {
      clearInterval(ticker);
      console.error(`\n  STREAM READ FAILED (${ts(t0)}):`, err instanceof Error ? err.message : err);
      if (err instanceof Error && err.stack) {
        console.error("\n  Stack trace:");
        console.error(err.stack);
      }
      if (finalAssistant) {
        console.error("\n  Last message state before crash:");
        dumpParts(finalAssistant, t0);
      }
      process.exit(1);
    }

    clearInterval(ticker);
    const elapsed = Date.now() - t0;

    if (streamError) {
      console.error(`\n  STREAM ERROR (${(elapsed / 1000).toFixed(1)}s): ${streamError.message}`);
      process.exit(1);
    }

    if (!finalAssistant || finalAssistant.role !== "assistant") {
      console.error("\n  No assistant message completed");
      process.exit(1);
    }

    history = [...history, finalAssistant];

    const assistantText = extractTextFromMessage(finalAssistant);
    const tools = toolNamesFromParts(finalAssistant.parts);

    console.log(`\n${"─".repeat(60)}`);
    console.log(`  TURN ${turn + 1} — ASSISTANT — ${(elapsed / 1000).toFixed(1)}s`);
    console.log("─".repeat(60));
    console.log(`  Text: ${assistantText.length}ch | Steps: ${stepCount} | Tools: ${tools.length ? tools.join(", ") : "none"} | Reasoning: ${reasoningChars}ch`);

    // Show the assistant's full text response
    const previewLines = assistantText.split("\n").slice(0, 40);
    console.log("  ┌─────────────────────────────────────");
    for (const line of previewLines) console.log(`  │ ${line}`);
    if (assistantText.split("\n").length > 40) console.log(`  │ … (${assistantText.split("\n").length - 40} more lines)`);
    console.log("  └─────────────────────────────────────");

    // Always dump parts breakdown so we see the agent's full chain of thought
    dumpParts(finalAssistant, t0);

    if (assistantText.length === 0 && tools.length === 0) {
      console.error("\n  FAIL: Empty assistant output (no text, no tools)");
      process.exit(1);
    }
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  ALL TURNS OK                                          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\n  FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
