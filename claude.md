# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Command | Use |
|---|---|
| `npm run dev` | Next.js dev server on http://localhost:3000 |
| `npm run build` | Production build (Next.js) |
| `npm test` | Vitest regression suite (hermetic — no LLM, no network). **Required to pass before pushing.** |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report (v8) |
| `npm run lint` | ESLint (same config CI runs) |
| `npm run verify-keys` | Probe each external API (OpenAI, Google, SerpAPI, Exa) with the keys in `.env.local` |
| `npm run test:chat` | Manual end-to-end agent run against a live dev server (needs API keys, **not** part of CI) |
| `npm run test:scenario -- scripts/scenarios/<file>.json` | Same harness, runs a specific scenario file |
| `npm run migrate:data` | One-off Prisma data migration script |
| `npx vitest run tests/lib/chat-context.test.ts` | Run a single test file |
| `npx vitest run -t "name fragment"` | Run a single test by name fragment |

CI (`.github/workflows/ci.yml`) runs `npm run lint` then `npm test` on Node 20 with **no secrets**. Anything that needs a real model or live HTTP must stay out of those two commands.

## Test-driven development

1. When changing **deterministic behavior** (library code, guards, sanitization, types): add a **failing test first** under [`tests/`](tests/) (layout mirrors `src/`, e.g. `tests/lib/...`), then implement; finish with **`npm test`** passing locally.
2. **Do not** add LLM or provider SDK imports to Vitest files. ESLint (see [`eslint.config.mjs`](eslint.config.mjs)) blocks `@ai-sdk/openai` and `openai` in `*.test.ts` / `*.spec.ts`. CI runs `npm test` without secrets; it must never call a model.
3. Use **`npm run test:chat`** / **`npm run test:scenario`** only for **end-to-end agent checks** with a running stack — not as a substitute for unit tests.

### What belongs in `npm test`

- Pure helpers, extracted guards (e.g. [`src/lib/chat-history-save-guard.ts`](src/lib/chat-history-save-guard.ts)), `src/lib/chat-context`, exported normalization in [`src/lib/tools/kiwi.ts`](src/lib/tools/kiwi.ts), error types, etc.
- **Not** streaming chat handlers, **not** `generateText` / `streamText`, **not** live HTTP to SerpAPI in unit tests.

## Architecture

This is a Next.js 16 App Router app (React 19, Tailwind v4, Vercel AI SDK v6) that pairs a guided 7-phase travel-planning agent with a freeform "concierge" chat. Trips, chat history, and user preferences are persisted in Postgres via Prisma; auth is Auth.js (NextAuth v5).

### The two agent surfaces

Both surfaces stream from OpenAI via `@ai-sdk/openai` + `ai`'s `streamText`, and share the same research toolbelt — but they have **different system prompts**, **different tools**, and **different state**:

- **Trip planner** — `POST /api/chat` ([src/app/api/chat/route.ts](src/app/api/chat/route.ts))
  - System prompt: [`buildSystemPrompt`](src/lib/agent.ts) — drives the 7-phase workflow (`big_picture` → `flights` → `cities` → `hotels` → `day_plans` → `restaurants` → `review`).
  - Trip-specific tools registered inline in `route.ts`: `update_trip`, `save_trip_summary`, `push_to_wanderlog`, `get_recommendations`.
  - Operates on a single `Trip` row keyed by `tripId` + the authenticated user.
- **Concierge** — `POST /api/conversations/[id]/chat`
  - System prompt: [`buildConciergeSystemPrompt`](src/lib/concierge-agent.ts) — freeform Q&A, document discussion, no `update_trip`.
  - Operates on a `Conversation` row (chat history only — no trip state).

The shared **research tools** (flights, hotels, places, routing, web search, deep research, tours, preferences) come from [`buildResearchTools`](src/lib/research-tools.ts), which wires together the per-provider clients in [`src/lib/tools/`](src/lib/tools/). Each tool defines its `inputSchema` with Zod and its description is part of the prompt the model sees — **tool descriptions are prompt engineering**, not just docs.

### Trip state model

`Trip` (see [`prisma/schema.prisma`](prisma/schema.prisma)) stores `state`, `chatHistory`, `recommendations`, and `recommenderPriorities` as JSON. The runtime shape lives in [`src/lib/types.ts`](src/lib/types.ts) (`Trip`, `TripState`, `Phase`, `Flight`, `CityStop`, `Hotel`, `Recommendation`, etc.). Mutations flow through [`src/lib/trips-store.ts`](src/lib/trips-store.ts) — never write `prisma.trip.*` directly from API routes.

`saveTrip` is guarded by [`isShrinkingChatSnapshot`](src/lib/chat-history-save-guard.ts): if an incoming snapshot has fewer messages than what's already persisted, the write is refused with `StaleSaveError`. This prevents a slow client from clobbering a faster save (the bug fixed in [.cursor/plans/chat-save-race-fix_7db7db7e.plan.md](.cursor/plans/)). Same pattern applies to conversations.

Client-side trip state is a Zustand store ([`src/lib/store.ts`](src/lib/store.ts)) that mirrors what the server persists. Reading code that touches trip mutations should pass through these stores so the optimistic UI and the database stay in sync.

### Chat context compression

Long planning sessions produce huge tool-result payloads (especially `search_places` and `search_hotels`). Before each request to OpenAI, [`sanitizeMessagesForStatelessRequest`](src/lib/chat-context.ts) strips photo URLs, caps individual tool outputs at ~50 KB, and compresses the whole history when total bytes cross ~800 KB while keeping the last few user turns intact. `topNLargestToolResults` powers the request-time telemetry that logs which tool calls are bloating context. When adding a new tool, check that its output passes through this pipeline cleanly — return JSON, not nested giant strings.

### Recommendation aggregation + consensus

[`aggregateRecommendations`](src/app/api/chat/route.ts) in the chat route collapses friend-supplied items (same normalized name + category) into a single row that lists every recommender. The system prompt then uses **CONSENSUS** / **STRONG CONSENSUS** tags, plus per-recommender priority levels (`ignore` → `top`), to bias the model toward multi-friend picks and away from `ignore`d ones. If you touch this code, also reread the "Friend Recommendations" and "Consensus signals" sections of [`src/lib/agent.ts`](src/lib/agent.ts) — the prompt and the aggregator have to stay in sync.

### Auth + API routes

- [`src/auth.ts`](src/auth.ts) configures NextAuth v5 with the Prisma adapter; [`src/middleware.ts`](src/middleware.ts) gates routes.
- Every API route under `src/app/api/` that touches user data calls [`requireAuth`](src/lib/api-auth.ts) first and uses the returned `userId` for all DB queries. New routes must do the same.

### External integrations

| Service | Used by | Notes |
|---|---|---|
| OpenAI (gpt-4o family) | Chat routes | Configured via `@ai-sdk/openai`; model selected in route handlers |
| Google Places API | [`google-places.ts`](src/lib/tools/google-places.ts) | Places search, photos, reviews — also exposed via `/api/places` |
| Google Directions API | [`google-maps.ts`](src/lib/tools/google-maps.ts) | `computeRoutesBatch` for multi-leg routing |
| SerpAPI | [`serpapi-hotels.ts`](src/lib/tools/serpapi-hotels.ts), [`kiwi.ts`](src/lib/tools/kiwi.ts) | Google Hotels + Google Flights |
| Exa | [`exa.ts`](src/lib/tools/exa.ts), [`exa-tours.ts`](src/lib/tools/exa-tours.ts) | Web search + tour discovery |
| Peek.com MCP | [`peek.ts`](src/lib/tools/peek.ts) | Tours/activities — no API key; client built via `createPeekClient()`. `search_experiences` requires a `regionId` returned from `search_regions` — never guess one |
| Wanderlog | [`wanderlog/push-to-wanderlog.ts`](src/lib/tools/wanderlog/) | Browser-automation push of the finalized itinerary |

Run `npm run verify-keys` after editing `.env.local` to confirm each key is live.

### Today's date

The chat route injects `todayUtc` into the system prompt so the agent never picks a past date for flight/hotel searches. Anything that constructs search dates server-side should do the same — don't trust the model's idea of "today".

## Where to look first

- Tool descriptions or model misbehavior → [`src/lib/agent.ts`](src/lib/agent.ts) and the inline tool definitions in [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts).
- New external API → add a client under [`src/lib/tools/`](src/lib/tools/), register the tool in [`src/lib/research-tools.ts`](src/lib/research-tools.ts) (shared) or directly in `route.ts` (trip-only).
- Data shape or DB change → [`src/lib/types.ts`](src/lib/types.ts) + [`prisma/schema.prisma`](prisma/schema.prisma) + a migration.
- Persistence race / state bug → [`src/lib/trips-store.ts`](src/lib/trips-store.ts), [`src/lib/chat-history-save-guard.ts`](src/lib/chat-history-save-guard.ts), [`src/lib/stale-save-error.ts`](src/lib/stale-save-error.ts).
- End-to-end scenario harness → [`scripts/test-chat.mts`](scripts/test-chat.mts) and [`scripts/scenarios/`](scripts/scenarios/); the [agent-testing skill](.cursor/skills/agent-testing/SKILL.md) documents the full workflow.
