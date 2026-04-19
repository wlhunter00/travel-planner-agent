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

// ── plan reconstruction & validation ─────────────────────────────────────────

const PHASE_ORDER = [
  "big_picture", "flights", "cities", "hotels", "day_plans", "restaurants", "review",
] as const;

type Phase = (typeof PHASE_ORDER)[number];

interface ReconstructedPlan {
  destination: string;
  startDate: string;
  endDate: string;
  name: string;
  phase: Phase;
  state: Record<string, unknown>;
  updateCount: number;
}

interface PlanExpectations {
  destination?: string | true;
  datesSet?: boolean;
  phaseAtLeast?: Phase;
  minFlights?: number;
  minCities?: number;
  minHotels?: number;
  minDays?: number;
  updateTripCalled?: boolean;
}

function extractUpdateTripCalls(history: UIMessage[]): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  for (const msg of history) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (!isToolUIPart(part)) continue;
      if (getToolName(part) !== "update_trip") continue;
      const state = "state" in part ? (part as { state: string }).state : "";
      if (state !== "result") continue;
      const output = "output" in part ? (part as { output: unknown }).output : undefined;
      if (output && typeof output === "object") {
        calls.push(output as Record<string, unknown>);
      }
    }
  }
  return calls;
}

function reconstructPlan(history: UIMessage[]): ReconstructedPlan {
  const calls = extractUpdateTripCalls(history);
  let destination = "";
  let startDate = "";
  let endDate = "";
  let name = "";
  let phase: Phase = "big_picture";
  let state: Record<string, unknown> = {
    destination: "", startDate: "", endDate: "",
    travelers: 1, style: "", budget: "",
    flights: [], cities: [], hotels: [], days: [],
  };

  for (const args of calls) {
    if (typeof args.destination === "string" && args.destination) destination = args.destination;
    if (typeof args.startDate === "string" && args.startDate) startDate = args.startDate;
    if (typeof args.endDate === "string" && args.endDate) endDate = args.endDate;
    if (typeof args.name === "string" && args.name) name = args.name;
    if (typeof args.phase === "string" && PHASE_ORDER.includes(args.phase as Phase)) {
      phase = args.phase as Phase;
    }
    if (args.tripState) {
      try {
        const parsed = typeof args.tripState === "string"
          ? JSON.parse(args.tripState)
          : args.tripState;
        if (typeof parsed === "object" && parsed !== null) {
          state = { ...state, ...parsed };
        }
      } catch { /* ignore malformed tripState */ }
    }
  }

  return { destination, startDate, endDate, name, phase, state, updateCount: calls.length };
}

interface ValidationResult {
  label: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
}

function validatePlan(plan: ReconstructedPlan, expect?: PlanExpectations): ValidationResult[] {
  const results: ValidationResult[] = [];
  const e = expect ?? {};

  if (plan.updateCount === 0) {
    results.push({
      label: "update_trip called",
      status: e.updateTripCalled === false ? "PASS" : "WARN",
      detail: "Agent never called update_trip — no plan was built",
    });
    return results;
  }

  results.push({
    label: "update_trip called",
    status: "PASS",
    detail: `${plan.updateCount} call(s)`,
  });

  // Destination
  if (plan.destination || (plan.state.destination && typeof plan.state.destination === "string" && plan.state.destination)) {
    const dest = plan.destination || (plan.state.destination as string);
    if (typeof e.destination === "string") {
      const match = dest.toLowerCase().includes(e.destination.toLowerCase());
      results.push({
        label: "Destination matches expected",
        status: match ? "PASS" : "FAIL",
        detail: match ? dest : `Expected "${e.destination}", got "${dest}"`,
      });
    } else {
      results.push({ label: "Destination set", status: "PASS", detail: dest });
    }
  } else {
    results.push({
      label: "Destination set",
      status: e.destination ? "FAIL" : "WARN",
      detail: "Destination is empty",
    });
  }

  // Dates
  const hasStart = !!(plan.startDate || plan.state.startDate);
  const hasEnd = !!(plan.endDate || plan.state.endDate);
  if (hasStart && hasEnd) {
    results.push({
      label: "Dates set",
      status: "PASS",
      detail: `${plan.startDate || plan.state.startDate} → ${plan.endDate || plan.state.endDate}`,
    });
  } else if (hasStart || hasEnd) {
    results.push({
      label: "Dates set",
      status: "WARN",
      detail: `Only ${hasStart ? "start" : "end"} date set`,
    });
  } else {
    results.push({
      label: "Dates set",
      status: e.datesSet ? "FAIL" : "WARN",
      detail: "No dates set",
    });
  }

  // Phase progression
  const phaseIdx = PHASE_ORDER.indexOf(plan.phase);
  if (e.phaseAtLeast) {
    const expectedIdx = PHASE_ORDER.indexOf(e.phaseAtLeast);
    results.push({
      label: "Phase progression",
      status: phaseIdx >= expectedIdx ? "PASS" : "FAIL",
      detail: `Phase: ${plan.phase} (expected at least ${e.phaseAtLeast})`,
    });
  } else {
    results.push({
      label: "Phase progression",
      status: phaseIdx > 0 ? "PASS" : "WARN",
      detail: `Phase: ${plan.phase}`,
    });
  }

  // Array fields
  const arrayChecks: { key: string; label: string; minKey: keyof PlanExpectations }[] = [
    { key: "flights", label: "Flights", minKey: "minFlights" },
    { key: "cities", label: "Cities", minKey: "minCities" },
    { key: "hotels", label: "Hotels", minKey: "minHotels" },
    { key: "days", label: "Day plans", minKey: "minDays" },
  ];

  for (const { key, label, minKey } of arrayChecks) {
    const arr = plan.state[key];
    const count = Array.isArray(arr) ? arr.length : 0;
    const minExpected = e[minKey] as number | undefined;
    if (minExpected !== undefined) {
      results.push({
        label,
        status: count >= minExpected ? "PASS" : "FAIL",
        detail: `${count} (expected >= ${minExpected})`,
      });
    } else if (count > 0) {
      results.push({ label, status: "PASS", detail: `${count}` });
    }
  }

  // Trip name
  if (plan.name) {
    results.push({ label: "Trip name", status: "PASS", detail: plan.name });
  }

  return results;
}

function printPlanValidation(plan: ReconstructedPlan, results: ValidationResult[]) {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  PLAN VALIDATION                                       ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const icons: Record<string, string> = { PASS: "✅", WARN: "⚠️ ", FAIL: "❌" };
  for (const r of results) {
    console.log(`  ${icons[r.status]} ${r.label}: ${r.detail}`);
  }

  const fails = results.filter((r) => r.status === "FAIL").length;
  const warns = results.filter((r) => r.status === "WARN").length;
  const passes = results.filter((r) => r.status === "PASS").length;
  console.log(`\n  Summary: ${passes} pass, ${warns} warn, ${fails} fail`);

  if (VERBOSE && plan.updateCount > 0) {
    console.log("\n  ── Reconstructed plan state ──");
    const stateStr = JSON.stringify(plan.state, null, 2);
    console.log(indent(stateStr, "  ", 60));
    console.log("  ── end plan state ──");
  }
  console.log("");
}

// ── input parsing ────────────────────────────────────────────────────────────

function loadUserTurnsFromFile(filePath: string): { turns: string[]; expect?: PlanExpectations } {
  const raw: unknown = JSON.parse(readFileSync(resolve(filePath), "utf-8"));

  // Plain string array: ["msg1", "msg2"]
  if (Array.isArray(raw)) {
    return { turns: raw.map((x) => String(x)).filter(Boolean) };
  }

  if (typeof raw !== "object" || raw === null || !("messages" in raw)) {
    throw new Error("JSON must be string[] or { messages: [...], expect?: {...} }");
  }

  const msgs = (raw as { messages: unknown }).messages;
  if (!Array.isArray(msgs)) throw new Error("Invalid JSON: messages must be an array");
  const expect = "expect" in raw ? (raw as { expect: PlanExpectations }).expect : undefined;

  // Simple string array inside object: { messages: ["msg1", "msg2"], expect: {...} }
  if (msgs.length > 0 && typeof msgs[0] === "string") {
    return { turns: msgs.map((x) => String(x)).filter(Boolean), expect };
  }

  // UIMessage export format: { messages: [{ role: "user", parts: [...] }] }
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
  return { turns: texts, expect };
}

function parseCli(): { turns: string[]; expect?: PlanExpectations } {
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
  if (positional.length > 0) return { turns: positional };
  return { turns: ["hello"] };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { turns: userTurns, expect: planExpect } = parseCli();
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

  // ── plan validation ──────────────────────────────────────────────────────
  const plan = reconstructPlan(history);
  const validationResults = validatePlan(plan, planExpect);
  printPlanValidation(plan, validationResults);

  const planFails = validationResults.filter((r) => r.status === "FAIL").length;

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  ALL TURNS OK                                          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  if (planFails > 0) {
    console.log(`  ⚠️  ${planFails} plan validation failure(s) — see PLAN VALIDATION above\n`);
  }
}

main().catch((err) => {
  console.error("\n  FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
