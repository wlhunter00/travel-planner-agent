# Agent Test Scenarios — Progress

## Scenarios

- [x] 01 `01-weekend-miami.json` — Weekend Miami (simple 2-turn, flights + hotels)
- [x] 02 `02-portugal-birthday.json` — Portugal Birthday (proven original, open-jaw flights)
- [x] 03 `03-multi-country-europe.json` — Multi-Country Europe (complex routing, 3 turns)
- [x] 04 `04-family-japan.json` — Family Japan (kids, pacing, cultural timing, 3 turns)
- [ ] 05 `05-budget-backpacker-sea.json` — Budget Backpacker SEA (tight $50/day constraint)
- [ ] 06 `06-luxury-honeymoon.json` — Luxury Honeymoon (high-end, multi-destination, 3 turns)
- [ ] 07 `07-user-changes-mind.json` — User Changes Mind (corrections, phase backtracking)
- [ ] 08 `08-vague-warm-destination.json` — Vague Warm Destination (agent must probe, deep_research)
- [ ] 09 `09-accessibility-dietary.json` — Accessibility + Dietary (wheelchair, severe allergies)
- [ ] 10 `10-business-plus-leisure.json` — Business Plus Leisure (bleisure, mixed cabin classes)
- [ ] 11 `11-holiday-peak-nyc.json` — Holiday Peak NYC (peak season, family of 6, 3 turns)
- [ ] 12 `12-california-road-trip.json` — California Road Trip (no flights, compute_routes heavy)
- [x] 13 `13-impossible-logistics.json` — Impossible Logistics (agent should push back)
- [x] 14 `14-deep-research-colombia.json` — Deep Research Colombia (discovery, off-beaten-path, 3 turns)
- [x] 15 `15-full-pipeline-rome.json` — Full Pipeline Rome (all 7 phases, 5 turns)
- [ ] 16 `16-group-bachelor-vegas.json` — Bachelor Party Vegas (group logistics, nightlife)
- [ ] 17 `17-solo-digital-nomad.json` — Solo Digital Nomad (long stay, Airbnb focus)
- [ ] 18 `18-last-minute-emergency.json` — Last Minute Emergency (urgent, emotional context)
- [ ] 19 `19-revisit-improve-trip.json` — Revisit/Improve Trip (skip phases, resume planning)
- [ ] 20 `20-multi-city-open-jaw-asia.json` — Multi-City Open-Jaw Asia (open-jaw, cross-country transit)
- [ ] 21 `21-full-deep-portugal.json` — Full Deep Portugal (all 7 phases in depth, 8 turns, anniversary trip)
- [ ] 22 `22-contrarian-user.json` — Contrarian User (rejects recommendations, pushes back, forces pivots, 6 turns)
- [x] 23 `23-group-greek-islands.json` — Group Greek Islands Reunion (explicit flight skip, 10-person multi-gen group, mid-plan pivots, pushback, dietary/accessibility, 7 turns)
- [ ] 24 `24-friend-recommendations.json` — Friend Recommendations (pre-seeded recs via setup block, agent references friend suggestions, get_recommendations tool, 3 turns)
- [ ] 25 `25-multimodal-url-sharing.json` — Multimodal URL Sharing (user shares URL in chat, agent uses fetch_url tool, 3 turns)

## Run Log

### 01 — Weekend Miami
- **Status**: PASS
- **Date**: 2026-03-20
- **Turns**: 2/2 completed
- **Total time**: ~158s
- **Tools used**: web_search, update_trip, update_preferences, search_flights (JFK→MIA, JFK→FLL), update_trip (phase + flight snapshot)
- **Bugs found**: none
- **Fixes applied**: none
- **Quality notes**: Proactive spring-break context from web search; clear neighborhood tradeoffs; turn 2 used live flight data and compared MIA vs FLL with a reasoned airport pick; updated preferences and trip state appropriately.
- **Cost note**: 2 turns, ~2.5 min wall time — low vs longer multi-phase scenarios

### 02 — Portugal Birthday
- **Status**: PASS with fixes
- **Date**: 2026-03-20
- **Turns**: 2/2 completed
- **Total time**: ~204s (first attempt failed at ~178s; passed on retry)
- **Tools used**: web_search (x2), update_preferences, update_trip (x3), search_multi_city_flights (x4: JFK→LIS/OPO→JFK, JFK→OPO/LIS→JFK, EWR→LIS/OPO→EWR, EWR→OPO/LIS→EWR), search_flights (x4: return legs OPO→EWR, LIS→EWR, OPO→JFK, LIS→JFK)
- **Bugs found**: `maxDuration = 120` in route.ts caused ETIMEDOUT on turn 2 — the multi-city flight search + reasoning exceeded 120s
- **Fixes applied**: `src/app/api/chat/route.ts` — bumped `maxDuration` from 120 to 300
- **Quality notes**: Excellent open-jaw coverage (searched both directions × both NY airports = 4 combos). Agent also ran separate return-leg searches for concrete departure times. Turn 1 proactively flagged Lisbon's Iminente Festival and Douro harvest season. Preferences carried forward minor state pollution from scenario 01 (beach/nightlife still in preferences).
- **Cost note**: 2 turns, ~3.4 min wall time — moderate due to heavy flight search

### 03 — Multi-Country Europe
- **Status**: PASS with fixes
- **Date**: 2026-03-20
- **Turns**: 3/3 completed (second attempt; first attempt STREAM ERROR on turn 2 ~10 min)
- **Total time**: ~559s successful run (~747s failed run aborted)
- **Tools used**: Turn 1 — deep_research, update_trip (x2). Turn 2 — update_preferences, update_trip. Turn 3 — web_search (x4 parallel), update_trip. No `search_flights` / `compute_route` on successful run.
- **Bugs found**: First run: long idle reasoning on turn 2 → server `ECONNRESET` / client stream `terminated` (~10.4 min render).
- **Fixes applied**: `src/app/api/chat/route.ts` — OpenAI `reasoningEffort` `high` → `medium` to shorten idle periods and avoid long-stream socket drops.
- **Quality notes**: Strong big-picture routing (Rome → Amalfi → Dubrovnik → Santorini → Athens), peak-season and ferry warnings. Turn 3 used targeted web research for trains/flights/ferries. Gap: turn 2 did **not** run live ORD↔open-jaw flight search despite Chicago origin (may defer to later phase). Prefs reset at harness start worked.
- **Cost note**: 3 turns, ~9.3 min wall time successful — high

### 04 — Family Japan
- **Status**: PASS
- **Date**: 2026-03-20 (re-run same day after Peek `search_experiences` wrap + prompt)
- **Turns**: 3/3 completed
- **Total time**: ~286s (first log); **~342s** re-run — no `output-error`; Turn 3 did **not** call Peek (agent used deep_research / search_places / search_tours only), so wrap not exercised on that sample
- **Tools used**: *Pre-fix run — Turn 3:* Peek `search_regions`, search_tours, deep_research (x2), `search_experiences` (6× output-error), search_places (many), get_place_details (many), update_preferences, update_trip. *Re-run — Turn 3:* deep_research (x2), search_places (many), search_tours (x4), get_place_details (x6), update_preferences, update_trip — **no Peek calls**; other turns same pattern as before (Turn 1 update_trip only in re-run; Turn 2 flight tools)
- **Bugs found**: Peek `search_experiences` often HTTP 500s when given invalid `regionId` (city name vs `search_regions` ID), or bogus `tagId`/`categoryId` — MCP client threw → AI SDK `output-error`
- **Fixes applied**: `src/lib/tools/peek.ts` — wrap `search_experiences` to catch MCP errors and return `isError` text with recovery steps; pass through real `close()`; optional `PEEK_MCP_ENDPOINT`. `src/lib/agent.ts` — Peek region ID / query / tag rules in system prompt
- **Quality notes**: Strong family focus (trains, teamLab, anime stops); picky-eater restaurant picks. Re-run Turn 3: 6 steps, no step-limit pressure; pre-fix run had heavier tool batch (Peek + Places).
- **Cost note**: 3 turns — ~4.8 min pre-fix; ~5.7 min re-run

### 14 — Deep Research Colombia
- **Status**: PASS with fixes
- **Date**: 2026-03-20
- **Turns**: 3/3 completed
- **Total time**: ~339s
- **Tools used**: Turn 1 — update_trip, update_preferences, deep_research, search_tours, web_search. Turn 2 — deep_research, search_tours, web_search, update_trip. Turn 3 — update_trip, search_multi_city_flights, search_flights (multiple segments)
- **Bugs found**: none on successful run (an earlier re-run after code changes hit STREAM ERROR / `terminated` on turn 1 — likely transient; full run completed on retry)
- **Improvements found**: (1) Turn 3 still did not run hotel/rental search despite a concrete 10-day plan ask. (2) Agent leaned on MIA↔MDE pricing as a hub while user had Medellín in `avoids` as already visited — clarify in prompt or logic that hub flights can still be valid vs. “spend time in city.”
- **Fixes applied**: `src/lib/tools/kiwi.ts` — reject past/malformed flight dates before SerpAPI; `src/lib/agent.ts` — early `update_preferences` / `update_trip`, per-person flight price labeling for party > 1, `search_tours` when discussing bookable activities
- **Quality notes**: Turn 1 immediately saved prefs (off-beaten-path, avoids Cartagena/Medellín) and trip stub; used tours + research. Turn 3 stated per-person prices and totals for 2; used future sample window (no wasted steps on past-date HTTP 400). Turn 3 completed in 5 steps vs. 10 on pre-fix baseline.
- **Cost note**: 3 turns, ~5.6 min wall time

### 14 — Deep Research Colombia (re-run: hybrid lodging)
- **Status**: PASS
- **Date**: 2026-03-20
- **Turns**: 3/3 completed
- **Total time**: ~425s
- **Tools used**: Turn 1 — update_preferences, update_trip, deep_research, search_tours, web_search. Turn 2 — deep_research, web_search, update_trip. Turn 3 — update_preferences, update_trip, search_multi_city_flights, search_flights (×2), **search_hotels** (×2: first empty on bad date window; second returned Filandia-area options), web_search
- **Bugs found**: none
- **Fixes applied**: `src/lib/agent.ts` — **Hybrid lodging** section; `src/app/api/chat/route.ts` — hotel/rental tool descriptions for anchor search
- **Quality notes**: Turn 3 batched flights with `search_hotels`; second hotel call returned concrete properties (~$30–49/night). Proactive Semana Santa framing; per-person + total for 2 on flights. Still one past-date correction cycle before valid data; Turn 3 used **9/10** steps.
- **Cost note**: ~7.1 min wall time

### 13 — Impossible Logistics
- **Status**: PASS
- **Date**: 2026-03-20
- **Turns**: 2/2 completed
- **Total time**: ~73s
- **Tools used**: Turn 1 — `update_trip`. Turn 2 — `update_preferences`, `update_trip`
- **Bugs found**: none
- **Improvements found**: (1) Turn 2 opens with “Yes,” which can read as walking back Turn 1’s “don’t try”; clearer framing would separate “visit meaningfully” vs. “airport stunt / physical presence.” (2) No sample flight times or sanity-check search — acceptable to avoid wasted API calls, but a one-line “I’m not pulling live schedules; this is illustrative” would harden trust. (3) `update_trip` still encodes three long-haul cities in 3 days as the primary trip shape; could add structured note `infeasible_as_stated` or similar for downstream UI.
- **Fixes applied**: none
- **Quality notes**: Turn 1 was appropriately blunt (not workable to meaningfully visit), with flight-time and jet-lag rationale and options A/B/C including “touch all 3” stunt explicitly not recommended. Turn 2 answered red-eyes with heavy caveats (sleep loss, delay risk, carry-on, hidden dependency on starting before Mon / ending after Wed). Pacing fast (~26s + ~46s). No redundant flight-tool spam.
- **Cost note**: 2 turns, ~1.2 min wall time — low

### 15 — Full Pipeline Rome
- **Status**: PASS with fixes (post-implementation re-run)
- **Date**: 2026-03-20
- **Turns**: 5/5 completed
- **Total time**: ~426s (prior baseline ~558s)
- **Tools used**: `update_trip`, `update_preferences`, `search_flights`, `search_hotels`, `search_vacation_rentals`, `search_tours`, `search_places`, `search_regions` (Peek; graceful `isError` wrap), `compute_routes` (batch; 1× turn 3, 1× turn 4), `get_place_details`, `web_search`
- **Bugs found**: none on this run
- **Improvements found**: (1) Turn 3 still paired `search_hotels` + `search_vacation_rentals` despite one-tool light-anchor rule — tighten prompt or phase-4 wording if this recurs. (2) Peek `search_regions` failed (`closed client`) but wrap returned recovery text instead of `output-error` crash.
- **Fixes applied**: `serpapi-hotels.ts` + `vacation-rentals.ts` (empty-result `note`); `peek.ts` (`search_regions` error wrap); `google-maps.ts` + `src/app/api/chat/route.ts` (`compute_routes` batch, removed `compute_route`); `tool-meta.ts`; `agent.ts` (batch routing guidance); `test-tools.mts`
- **Quality notes**: Turn 1 fast (~42s, 2 steps, no lodging APIs). Turn 2 flights-only batch aligned with hybrid gate. Lodging `note` fields consumed; agent pivoted to named hotels via Places. Batch routing reduced tool churn vs. many `compute_route` calls. Full pipeline completed with opinionated picks.
- **Cost note**: 5 turns, ~7.1 min wall time

### 23 — Group Greek Islands Reunion
- **Status**: PASS with notes
- **Date**: 2026-04-13
- **Turns**: 7/7 completed
- **Total time**: ~1011s (~16.8 min)
- **Tools used**: update_trip (x many), update_preferences (x5), web_search (x many), search_vacation_rentals (x3), search_hotels (x3), search_airbnb (x2), deep_research (x2), search_tours (x7), search_places (x many), get_place_details (x many), compute_routes (x4), push_to_wanderlog (x2 — both failed)
- **Bugs found**: `push_to_wanderlog` returned `{"success":false,"error":"No trip loaded"}` both times in Turn 7. The tool was called correctly but no trip was loaded in the export context. Not a crash but the user's explicit Wanderlog request went unfulfilled.
- **Improvements found**:
  1. **Wanderlog export broken**: `push_to_wanderlog` failed twice with "No trip loaded". The agent acknowledged the failure in its response text but did not attempt `save_trip_summary` as a fallback. The tool or its integration needs investigation.
  2. **Turn 4 day plans were too packed despite user asking for 2 free days**: The user had to push back in Turn 5 to get genuinely free days. The agent should respect "free day" requests on the first attempt. System prompt could reinforce: "when user requests N free days, mark those days as BLANK in the plan with zero activities."
  3. **Turn 1 searched `search_vacation_rentals` prematurely**: The user hadn't asked about accommodation yet. This was a wasted tool call in the big-picture phase. The agent should wait for the hotels phase.
  4. **Phase labeling inconsistency**: Turn 3 labels itself "Phase 4 — Hotels" but it's actually the 3rd turn. Phase numbers should match the agent's internal phase system, not turn count.
  5. **No `save_trip_summary` called at any point**: Even without Wanderlog, the agent should call `save_trip_summary` during review phase for persistence.
  6. **Turn 6 `search_places` returned NYC restaurant "estiatorio Milos"**: A search for Milos restaurants returned the famous NYC restaurant. The agent correctly ignored it in its response, but this suggests the search query could be more specific (e.g., include "Greece" or coordinates).
  7. **Turn 5 had 0ch reasoning**: After pushback, the agent jumped straight to tool calls without visible reasoning. This is fine functionally but suggests the model may not be reflecting deeply on the criticism.
- **Fixes applied**: none (first run)
- **Quality notes**: Excellent overall. The agent respected the "no flights" instruction perfectly across all 7 turns — zero flight searches. Accessibility awareness was consistent (Lycabettus funicular, Adamas base over Plaka, drive-up Santorini). The Crete-to-Milos swap and 14-to-12-day adjustment were handled cleanly. Restaurant recommendations were strong with real ratings, hours, and walking distances. The anniversary dinner pick (Astakas in Klima) was well-reasoned. The agent was genuinely opinionated ("I'd pick this because...") rather than listing options generically. Turn pacing was acceptable (72s–172s range). The pushback recovery in Turn 5 was fast and correct. Ferry/logistics research in Turn 7 was thorough with real 2026 sources.
- **Cost note**: 7 turns, ~16.8 min wall time — moderate-to-high for complexity

### 23 — Group Greek Islands Reunion (re-run after fixes)
- **Status**: PASS with notes
- **Date**: 2026-04-13
- **Turns**: 7/7 completed
- **Total time**: ~886s (~14.8 min)
- **Tools used**: update_trip (x many), update_preferences (x many), web_search (x many), search_vacation_rentals, search_hotels, search_airbnb, deep_research (x2), search_tours, search_places (x many — all returned empty), compute_routes, save_trip_summary (x1 — SUCCESS), push_to_wanderlog (x1 — failed)
- **Bugs found**: `push_to_wanderlog` still fails with "No trip loaded" (pre-existing, not in scope). `search_places` returned empty results for all calls — the `locationRestriction` change (from `locationBias`) may be too strict or geocoding is returning off-center coordinates. Agent fell back to `web_search` successfully.
- **Improvements verified (from prior run)**:
  1. **No phase announcements** — FIXED. No phase names/numbers in user-facing text across all 7 turns. Internal `update_trip` still uses phase correctly.
  2. **No flight searches** — Still PASS. Zero flight tool calls across all 7 turns.
  3. **Free days in Turn 4** — IMPROVED. Agent included "2 true blank beach days" in text and encoded `"plan":"BLANK"` for Oct 18 and Oct 20 in the structured data. The scripted Turn 5 pushback still fires (static message), but the agent did attempt to honor the request on first pass.
  4. **Pushback reasoning (Turn 5)** — FIXED. Response opens with "You're right on all three points" followed by a detailed "I got this wrong because" section with 3 bullet points, THEN delivers corrected plan. Major improvement over prior run's 0ch reasoning.
  5. **save_trip_summary** — FIXED. Called in Turn 7, returned `{"success":true}`.
  6. **search_places Milos/NYC** — FIXED (no NYC false matches) but regressed (all search_places calls returned empty). The `locationRestriction` prevents cross-continent results but may be too strict. Agent compensated via `web_search`.
  7. **Photo URL stripping** — Code deployed; cannot verify from terminal output but implementation is correct.
- **Remaining issues**:
  1. **search_places returning empty for all calls**: Needs investigation — either `locationRestriction` radius (20km) is too tight, or geocoding is failing for these queries. Consider fallback: try `locationRestriction` first, if empty retry with `locationBias`.
  2. **Pushback text emitted after tool calls in stream**: The AI SDK streams tool invocations before text output. The model planned the acknowledgment correctly but the stream order shows tools first, then text. This is a SDK behavior, not a prompt issue.
  3. **push_to_wanderlog still broken**: Pre-existing issue, needs separate investigation.
- **Fixes applied**: `src/lib/agent.ts` (5 system prompt changes), `src/app/api/chat/route.ts` (photo URL stripping, enhanced summarizeTrip, search_places descriptions), `src/lib/tools/google-places.ts` (locationBias → locationRestriction)
- **Quality notes**: Strong improvement over first run. The agent is now genuinely opinionated, transitions naturally between topics without announcing phases, acknowledges pushback before fixing, and calls save_trip_summary in review. Turn pacing improved slightly (~886s vs ~1011s). Restaurant/anniversary dinner recommendations remain strong. Logistics coverage in Turn 7 (ferries, cars, SIM cards, insurance) was thorough.
- **Cost note**: 7 turns, ~14.8 min wall time — improved from ~16.8 min on first run

<!-- After each scenario run, append an entry below using this format:

### XX — Scenario Name
- **Status**: PASS / FAIL / PASS with fixes
- **Date**: YYYY-MM-DD
- **Turns**: X/Y completed
- **Total time**: Xs
- **Tools used**: tool1, tool2, ...
- **Bugs found**: description or "none"
- **Fixes applied**: files changed or "none"
- **Quality notes**: brief assessment of recommendation quality, tool usage, state management
- **Cost note**: approximate (based on turn count and timing)

-->
