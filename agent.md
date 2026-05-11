# Agent instructions (Cursor)

Cursor-facing companion to [`CLAUDE.md`](claude.md). The architecture / commands sections there apply here too — this file only carries the Cursor-specific guidance and the test rules that ESLint enforces.

## Test-driven development

1. For **pure logic** (helpers under `src/lib`, store rules, Zod shapes, message sanitization, normalization in `src/lib/tools/*.ts`): **write or update a failing test first** under [`tests/`](tests/) (mirror `src/lib/…`), then implement until `npm test` is green.
2. Run **`npm test`** before pushing. CI runs `npm run lint` and **`npm test`** (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) with **no API keys** and **no LLM**.
3. **LLM / full-agent behavior** is validated manually with **`npm run test:chat`** or **`npm run test:scenario`** (requires a running app and real models). Use the [agent-testing skill](.cursor/skills/agent-testing/SKILL.md) when iterating on scenarios.

## Automated tests must stay free of LLMs

- **Do not** import `@ai-sdk/openai`, `openai`, or other model SDKs in `*.test.ts` / `*.spec.ts` — ESLint enforces this via the `no-restricted-imports` rule in [`eslint.config.mjs`](eslint.config.mjs).
- **Do not** wire Vitest to API routes that stream models or call providers.
- Prefer **pure functions**, **fixtures**, and **mocks** for I/O.

## Quick commands

| Command | Purpose |
|---|---|
| `npm test` | Vitest, hermetic, safe for CI |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report (v8) |
| `npm run lint` | ESLint (same as CI) |
| `npm run test:chat` | Live agent smoke (local only, not CI) |
| `npm run test:scenario -- scripts/scenarios/<file>.json` | Single end-to-end scenario |
| `npm run verify-keys` | Probe each external API key in `.env.local` |

## Pointers

- Trip planner system prompt: [`src/lib/agent.ts`](src/lib/agent.ts).
- Trip planner streaming handler + trip-specific tools: [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts).
- Concierge system prompt: [`src/lib/concierge-agent.ts`](src/lib/concierge-agent.ts).
- Shared research tools (flights, hotels, places, web search, etc.): [`src/lib/research-tools.ts`](src/lib/research-tools.ts) + clients in [`src/lib/tools/`](src/lib/tools/).
- Persistence + the chat-history shrink guard: [`src/lib/trips-store.ts`](src/lib/trips-store.ts), [`src/lib/chat-history-save-guard.ts`](src/lib/chat-history-save-guard.ts).
- Request-time context compression: [`src/lib/chat-context.ts`](src/lib/chat-context.ts).
