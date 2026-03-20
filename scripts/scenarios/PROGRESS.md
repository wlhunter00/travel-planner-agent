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
