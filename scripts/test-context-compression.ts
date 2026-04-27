#!/usr/bin/env tsx
/**
 * Standalone verification for chat context compression.
 *
 * Builds synthetic UIMessage arrays of varying sizes and asserts that
 * sanitizeMessagesForStatelessRequest:
 *   1. Caps individual oversized tool results.
 *   2. Triggers sliding-window summarization once total bytes cross 800KB.
 *   3. Leaves small sessions alone (no compression below threshold).
 *
 * Usage: npx tsx scripts/test-context-compression.mts
 */

import { sanitizeMessagesForStatelessRequest } from "../src/lib/chat-context";
import type { UIMessage } from "ai";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("✗", msg);
    failed += 1;
  } else {
    console.log("✓", msg);
  }
}

function userMsg(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] } as UIMessage;
}

function assistantToolMsg(id: string, toolName: string, output: unknown): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: `tool-${toolName}`,
        toolCallId: `call_${id}`,
        state: "output-available",
        input: {},
        output,
      },
    ],
  } as unknown as UIMessage;
}

function makeBigPlace(i: number) {
  return {
    name: `Place ${i}`,
    rating: 4.5,
    address: `${i} Test Street, City`,
    photoUrl: `https://example.com/photo-${i}.jpg`,
    blurb: "x".repeat(400),
  };
}

function totalBytes(msgs: UIMessage[]): number {
  return JSON.stringify(msgs).length;
}

// Scenario A: small session (<800KB) — only photo strip + per-result cap should apply
{
  const msgs: UIMessage[] = [
    userMsg("u1", "find restaurants"),
    assistantToolMsg("a1", "search_places", {
      items: Array.from({ length: 10 }, (_, i) => makeBigPlace(i)),
    }),
    userMsg("u2", "what about hotels"),
    assistantToolMsg("a2", "search_hotels", {
      items: Array.from({ length: 10 }, (_, i) => makeBigPlace(i)),
    }),
  ];
  console.log(`\n[Scenario A] small session, ${totalBytes(msgs)} bytes`);
  const out = sanitizeMessagesForStatelessRequest(msgs);
  const a1Output = (out[1].parts[0] as { output: { items: unknown[] } }).output;
  assert(!("_compressed" in (a1Output ?? {})), "small session: tool output not compressed");
  const photoStripped = JSON.stringify(out).includes('"[photo]"');
  const photoUrlGone = !JSON.stringify(out).includes("photo-0.jpg");
  assert(photoStripped, "photo URLs replaced with [photo] sentinel");
  assert(photoUrlGone, "original photo URL strings removed from history");
}

// Scenario B: oversized single tool result (>50KB) — should be truncated to 25 items
{
  const fatItems = Array.from({ length: 200 }, (_, i) => ({
    ...makeBigPlace(i),
    extra: "y".repeat(800),
  }));
  const msgs: UIMessage[] = [
    userMsg("u1", "find lots of places"),
    assistantToolMsg("a1", "search_places", { items: fatItems }),
  ];
  console.log(`\n[Scenario B] oversized single result, ${totalBytes(msgs)} bytes`);
  const out = sanitizeMessagesForStatelessRequest(msgs);
  const items = (out[1].parts[0] as { output: { items: unknown[] } }).output.items;
  assert(items.length <= 26, `oversized result truncated (got ${items.length}, expected ≤26)`);
  const last = items[items.length - 1] as { _truncated?: boolean };
  assert(last._truncated === true, "truncated result has _truncated marker");
}

// Scenario C: large session (>800KB) — sliding-window kicks in for old turns.
// Use modest-size results that pass through the per-result cap, but with enough
// turns that total bytes cross the 800KB compression trigger.
{
  function smallPlace(i: number) {
    return {
      name: `Place ${i}`,
      rating: 4.5,
      address: `${i} Test Street`,
      photoUrl: `https://example.com/p-${i}.jpg`,
    };
  }
  const msgs: UIMessage[] = [];
  // 25 items + ~40KB note pad ≈ 43KB per assistant — under the 50KB per-result cap.
  // 25 turns × ~45KB each (with user padding) ≈ 1.1MB total → sliding window engages.
  for (let t = 0; t < 25; t += 1) {
    msgs.push(userMsg(`u${t}`, `turn ${t} ${"x".repeat(3000)}`));
    const items = Array.from({ length: 25 }, (_, i) => smallPlace(t * 1000 + i));
    const padded = { items, notes: "z".repeat(40_000) };
    msgs.push(assistantToolMsg(`a${t}`, "search_hotels", padded));
  }
  const beforeBytes = totalBytes(msgs);
  console.log(`\n[Scenario C] large session, ${beforeBytes} bytes pre-sanitize`);
  const out = sanitizeMessagesForStatelessRequest(msgs);
  const afterBytes = totalBytes(out);
  console.log(`[Scenario C] post-sanitize ${afterBytes} bytes`);
  assert(beforeBytes >= 800_000, "fixture is large enough to trigger sliding window");
  assert(afterBytes < beforeBytes, "sliding window reduced total bytes");

  // 25 user turns total, last 4 retained → user indices 42, 44, 46, 48 are kept;
  // their assistant follow-ups (43, 45, 47, 49) keep full output.
  const lastAssistant = out[49].parts[0] as { output: { items: unknown[] } };
  assert(
    Array.isArray(lastAssistant.output?.items) && lastAssistant.output.items.length > 1,
    "last 4 user turns retained (most recent assistant tool result not summarized)",
  );

  // First assistant message (index 1) is well before the cutoff — should be compressed.
  const earlyAssistant = out[1].parts[0] as { output: { _compressed?: boolean; summary?: string } };
  assert(earlyAssistant.output?._compressed === true, "old assistant tool result compressed");
  assert(
    typeof earlyAssistant.output?.summary === "string" && earlyAssistant.output.summary.length > 0,
    "compressed result includes a human-readable summary",
  );
}

// Scenario D: empty / non-array input
{
  console.log("\n[Scenario D] edge cases");
  assert(sanitizeMessagesForStatelessRequest([]).length === 0, "empty input returns empty");
  assert(sanitizeMessagesForStatelessRequest(null as unknown as unknown[]).length === 0, "null input returns empty");
}

console.log(`\n${failed === 0 ? "✅ all scenarios passed" : `❌ ${failed} assertion(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
