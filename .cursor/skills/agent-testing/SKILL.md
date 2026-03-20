---
name: agent-testing
description: Run and debug travel planner agent test scenarios. Use when the user says "test the agent", "run the next scenario", "run scenario X", or wants to stress-test, debug, or improve the agent's behavior. Automatically picks the next untested scenario from PROGRESS.md.
---

# Agent Testing Skill

Run a test scenario against the travel planner agent, analyze the output for **both bugs and quality improvements**, fix issues, and record results. Finding bugs is table stakes — the real value is surfacing ways to make the agent's recommendations, tool usage, and behavior better.

## Step 1: Pick the scenario

Read `scripts/scenarios/PROGRESS.md`. Find the first line matching `- [ ]` — that's the next untested scenario.

Extract the filename from the backtick-wrapped span (e.g., `` `03-multi-country-europe.json` ``).

**Override**: If the user said a specific number or name (e.g., "run scenario 14", "run the Colombia one"), use that instead.

Read the scenario JSON file at `scripts/scenarios/<filename>` to understand what's being tested and how many turns to expect.

Tell the user which scenario you're running and what it tests.

## Step 2: Ensure the dev server is running

Check the terminals folder for a running `npm run dev` process on port 3000. If not found:

```bash
npm run dev
```

Background it and wait for "Ready" or "compiled" in the output before proceeding.

## Step 3: Run the scenario

Execute the test **in the background** (e.g. shell with immediate return) so you can **actively monitor** it. Do **not** block the chat on one long foreground run without reading output in between.

```bash
VERBOSE=1 npx tsx scripts/test-chat.mts --file scripts/scenarios/<filename>
```

This uses the same `DefaultChatTransport` + `readUIMessageStream` stack as the browser. Each user message in the JSON becomes one turn.

### Monitor actively (critical)

- **Never** say you are doing a fixed “10-minute wait,” **never** run `sleep 600` (or any long idle sleep), and **never** disappear without checking output. Those wall-clock numbers below are **rough total scenario estimates**, not instructions to pause or go silent.
- **Do** start the command in the background, then **read the terminal log file repeatedly** (about every 15–30 seconds at first). After each read, **tell the user** what you see: current turn, latest step/tool, elapsed time, or any error — even one short sentence is enough.
- If output has not moved for ~2–3 minutes on a multi-tool turn, say that explicitly and keep polling; do not assume the run is stuck until you see an error or the process exits.
- **Completion**: keep polling until the process exits and you see `ALL TURNS OK` or a fatal error / non-zero exit in the log.

### Typical wall-clock (estimates only — not a sleep)

Each turn often takes **~30–120+ seconds** (reasoning + tools). Very roughly: **2 turns** ~2–5 min, **3 turns** ~3–8 min, **5 turns** ~8–15 min, **8+ turns** ~15–25+ min. These are **not** timeouts to set — they only set user expectations while **you** keep monitoring.

**What to watch while polling:**
- `▶ step X` — the agent is thinking/acting
- `🔧 tool call: X` — a tool was invoked
- `🧠 reasoning` — the agent is reasoning (may be encrypted/hidden)
- `STREAM ERROR` or `REQUEST FAILED` — a crash
- `ALL TURNS OK` — success

## Step 4: Analyze the output

Once the run completes (look for `ALL TURNS OK` or an error/exit), read the **full terminal output** and perform **two separate analyses**: one for bugs, one for quality. Both are mandatory — even if exit code is 0 and nothing crashed.

### 4a. Bug check (pass/fail)

- Did all turns get assistant responses? Exit code 0?
- If something failed, classify it:
  - **Agent crash** (stream error, request failed): Trace to source. Common culprits: `route.ts`, `src/lib/tools/*.ts`.
  - **Tool returned empty/error**: Check if input was reasonable. If so, might be API flakiness — retry once before blaming agent code. If input was bad (wrong IATA codes, malformed dates), that's an agent issue.
  - **Agent made bad tool calls**: Fix tool `description` in `route.ts` or add input validation in tool code.
  - **Timeout/hung**: Check if a tool is hanging or the agent is in a reasoning loop.

### 4b. Quality review (always do this, even on a clean pass)

**This is not optional.** A passing test with bad output is worse than a crash — crashes get caught, bad recommendations ship. Read the assistant's actual text responses and tool call patterns, then evaluate:

**Tool usage** — Did the agent use the right tools? Any wasted/redundant calls? Did it call `update_trip` at the right moments? Did it call `update_preferences` when the user expressed preferences? For multi-city: did it use `search_multi_city_flights`?

**Recommendation quality** — Was the agent opinionated ("I recommend X because...") or just listing options? Did it present 2-4 options with clear tradeoffs? Did it include real data (prices, times, ratings)? Did later turns build on earlier decisions?

**State management** — Did `update_trip` save confirmed decisions? Were phase transitions correct? Did the agent summarize progress when moving phases? Were dates/destination set early (not left blank)?

**Proactive intelligence** — Did the agent volunteer useful info the user didn't ask about? (visa, booking lead times, seasonal crowds, jet lag, meal timing, transit tips, scams) For scenario 13: did it push back? For scenario 09: did it proactively address accessibility? For scenario 18: did it prioritize speed?

**Pacing** — Turn times under 90s good, 90-150s acceptable, over 150s slow. Steps per turn: 3-6 typical, over 8 suggests overthinking.

**Response quality** — Is the text well-structured? Does it read like a knowledgeable human travel advisor, or a generic AI list? Are booking links and concrete details included?

### 4c. Write up improvement suggestions

After the quality review, **always produce a numbered list of specific improvement suggestions**, even if the run was technically successful. Think: "If a real user saw this output, what would make it better?" Examples of what to look for:

- Agent didn't search for something the user clearly wanted (e.g. user said "hotels" but no hotel search ran)
- Agent set wrong/empty fields in `update_trip` (blank dates, wrong destination)
- Preferences were polluted or not captured when they should have been
- Agent was too verbose or too terse
- Agent listed options without picking a favorite
- Agent didn't flag an obvious concern (peak season, visa, jet lag after long flight)
- Tool calls were redundant (searched the same route twice)
- Agent could have used a better tool for the job (e.g. `deep_research` instead of multiple `web_search`)

**If genuinely nothing can be improved, say so explicitly and explain why** — but that should be rare. Most runs will have at least 1-2 things worth improving.

## Step 5: Fix bugs and implement improvements

**Bugs** (crashes, errors, broken tool calls): Fix immediately, re-run to verify.

**Quality improvements**: Present them to the user with a brief explanation of what you'd change and where. Wait for the user to say which ones to implement — or implement them all if the user says so. Common fix locations:

- `src/app/api/chat/route.ts` — tool descriptions, tool registration, provider options
- `src/lib/agent.ts` — system prompt (recommendation style, proactive warnings, pacing rules)
- `src/lib/tools/*.ts` — tool input validation, output formatting, error messages

After implementing improvements, **re-run the scenario** to verify the changes helped. Compare before/after in your report.

## Step 6: Update PROGRESS.md

In `scripts/scenarios/PROGRESS.md`:

1. Replace the scenario's `- [ ]` with `- [x]`
2. Append a log entry under `## Run Log`:

```
### XX — Scenario Name
- **Status**: PASS / FAIL / PASS with fixes
- **Date**: YYYY-MM-DD
- **Turns**: X/Y completed
- **Total time**: Xs
- **Tools used**: tool1, tool2, ...
- **Bugs found**: description or "none"
- **Improvements found**: numbered list of quality issues identified
- **Fixes applied**: files changed or "none"
- **Quality notes**: brief assessment of recommendation quality and agent behavior
```

## Step 7: Report to user

Always present **three sections** in your report:

1. **Result**: Which scenario, pass/fail, timing, tools used
2. **Bugs**: What broke and what you fixed (or "none")
3. **Improvements**: Numbered list of quality suggestions with what you'd change and where — this is the most valuable part of the report. Don't skip it. Don't bury it. Lead with it if there are no bugs.

Then mention which scenario is next.

## Key files reference

- Scenarios: `scripts/scenarios/*.json`
- Progress: `scripts/scenarios/PROGRESS.md`
- Test runner: `scripts/test-chat.mts`
- API route + tools: `src/app/api/chat/route.ts`
- System prompt: `src/lib/agent.ts`
- Types: `src/lib/types.ts`
- Tool implementations: `src/lib/tools/*.ts`
