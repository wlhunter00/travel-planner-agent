# Agent instructions (Cursor)

## Test-driven development

1. For **pure logic** (helpers under `src/lib`, stores’ deterministic rules, Zod shapes, message sanitization): **write or update a failing test first** under [`tests/`](tests/) (mirror `src/lib/…`), then implement until `npm test` is green.
2. Run **`npm test`** before pushing. CI runs `npm run lint` and **`npm test`** (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) with **no API keys** and **no LLM**.
3. **LLM / full-agent behavior** is validated manually with **`npm run test:chat`** or **`npm run test:scenario`** (requires a running app and real models). Use the [agent-testing skill](.cursor/skills/agent-testing/SKILL.md) when iterating on scenarios.

## Automated tests must stay free of LLMs

- **Do not** import `@ai-sdk/openai`, `openai`, or other model SDKs in `*.test.ts` / `*.spec.ts` (ESLint enforces this).
- **Do not** wire Vitest to API routes that stream models or call providers.
- Prefer **pure functions**, **fixtures**, and **mocks** for I/O.

## Quick commands

| Command | Purpose |
|--------|---------|
| `npm test` | Vitest, hermetic, safe for CI |
| `npm run test:coverage` | Coverage report |
| `npm run test:chat` | Live agent smoke (local only, not CI) |
