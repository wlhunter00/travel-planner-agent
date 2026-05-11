# Agent instructions (Claude / subagents)

## Test-driven development

1. When changing **deterministic behavior** (library code, guards, sanitization, types): add a **failing test first** in [`tests/`](tests/) (layout mirrors `src/`, e.g. `tests/lib/...`), then implement; finish with **`npm test`** passing locally.
2. **Do not** add LLM or provider SDK imports to Vitest files. CI runs **`npm test`** without secrets; it must never call a model.
3. Use **`npm run test:chat`** / **`npm run test:scenario`** only for **end-to-end agent checks** with a running stack—not as a substitute for unit tests.

## What belongs in `npm test`

- Pure helpers, extracted guards (e.g. [`src/lib/chat-history-save-guard.ts`](src/lib/chat-history-save-guard.ts)), `src/lib/chat-context`, exported normalization in `src/lib/tools/kiwi.ts`, error types, etc.
- **Not** streaming chat handlers, **not** `generateText` / `streamText`, **not** live HTTP to SerpAPI in unit tests.

## Commands

| Command | Use |
|--------|-----|
| `npm test` | Required regression suite |
| `npm run lint` | Same as CI |
| `npm run test:chat` | Manual LLM validation (optional) |
