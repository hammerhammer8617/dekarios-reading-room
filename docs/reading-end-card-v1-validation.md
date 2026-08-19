# Reading-end v1 local validation

> Candidate resource: `ui://ss-reading-nest/reading-end-v1.html`
>
> Status: Gates 1–3 passed locally; **not deployed**
>
> Baseline: `feat/gtd-reading-room` / production UI `app-v35`

This note records the acceptance evidence for the isolated “今天读到这里” vertical slice. Gate 4 (deployment, reconnect, and a real ChatGPT acceptance run) remains deliberately untouched.

## Data and compatibility

- `record_reading_turn` accepts the bounded snapshot source fields in the same operation that records progress and thoughts.
- The service persists one authoritative `ReadingEndSnapshot` for each `bookId + operationId` pair and returns the existing payload on an idempotent retry.
- `render_reading_end_card` accepts only `snapshotId`; its exact output schema and UI fixture use the same shared schema.
- A missing or incomplete snapshot raises an explicit tool error. A bare position such as `第 91 页` is rejected as `progressSummary`.
- Existing v7 data remains readable. `readingEndSnapshots` is an additive collection and is normalized to an empty array when absent, so this change does not require rewriting existing books, sessions, thoughts, or casebooks.
- Notion status starts as `pending` when syncable thoughts exist and moves to `synced` only after the existing sync-confirmation operation succeeds.

## Isolated resource

The new `reading-end-v1` Vite entry imports only its component, host adapter, scoped stylesheet, shared snapshot contract, and the six approved card backgrounds. It does not import `ReadingRoomEntry`, `app.css`, the legacy reader shell, bookshelf/detail/casebook components, or viewport-height layout.

The production worker/server registers the isolated resource alongside `app-v35`; no existing surface URI or route was replaced.

## Gate 1 — data: passed

Focused schema, migration, service, tool-registration, and resource-registration suites cover:

- required and bounded snapshot fields;
- meaningful progress validation;
- `bookId + operationId` idempotency and exact reread identity;
- optional Tav/Gale/open-question sections;
- missing and corrupt snapshot failures;
- exact render input/output schemas;
- pending-to-synced Notion status;
- additive database normalization and isolated resource registration.

Result: **54 focused tests passed** (45 shared + 9 server).

## Gate 2 — visual: passed

The deterministic Chinese fixture includes 《打怪》, 第 19 页, the required progress summary, reading summary, Tav thought, Gale thought, open question, and pending sync status.

- [390 px fixture](fixtures/reading-end-card-390.png)
- [768 px fixture](fixtures/reading-end-card-768.png)

Both fixtures were visually checked for full field visibility, readable image crop, and bottom completion. The component/CSS suite also asserts absent sections are not rendered and rejects internal scrolling or `100vh`/`100dvh`. The PNG audit confirms positive intrinsic height at exactly 390 px and 768 px widths.

Result: **3 component tests passed**, with fixtures at `390 × 830` and `768 × 705`.

## Gate 3 — host: passed

The standards-first adapter now:

1. listens for tool results before connecting the MCP Apps bridge;
2. sends an explicit size-changed notification after stable mount and on resize;
3. falls back after a failed standard connection only when `window.openai.notifyIntrinsicHeight` is capability-detected;
4. reports a visible diagnostic when neither path can report height;
5. deduplicates unchanged measurements; and
6. disconnects observers and cancels frames across StrictMode effect cleanup.

An additional regression test confirms that an incomplete one-shot snapshot remains visibly diagnosable even when it arrives before the standard bridge finishes connecting.

Result: **7 host-path tests passed**. Together with the 3 component tests, the isolated web suite passed **10/10**.

## Build audit: passed

Both the legacy app and the isolated resource build successfully. The isolated single-file artifact contains all six embedded WebP backgrounds and none of the audited legacy tokens: `100dvh`, `open_reading_nest`, bookshelf/detail/casebook copy, or the `app-v35` route switch.

Artifact audit result: `2,130,734 bytes`, `6` embedded WebP assets, `0` forbidden legacy tokens.

## Commands used

```bash
(cd shared && node node_modules/vitest/vitest.mjs run \
  src/tool-schemas.test.ts src/database-migration.test.ts)

(cd server && node node_modules/vitest/vitest.mjs run \
  src/services/reading-room-service.test.ts \
  src/mcp/register-reading-room-tools.test.ts \
  src/mcp/register-resource.test.ts)

(cd web && node node_modules/vitest/vitest.mjs run \
  --config vitest.reading-end.config.ts src/reading-end)

node node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/bin/tsc \
  -p shared/tsconfig.json --noEmit
node node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/bin/tsc \
  -p server/tsconfig.json --noEmit
node node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/bin/tsc \
  -p web/tsconfig.reading-end.json --noEmit

(cd web && node node_modules/vite/bin/vite.js build)
(cd web && node node_modules/vite/bin/vite.js build \
  --config vite.reading-end.config.ts)
node web/scripts/audit-reading-end-build.mjs
node web/scripts/audit-reading-end-fixtures.mjs
```

## Explicitly unchanged

No bookshelf, book-detail, casebook, legacy reader, EPUB/comic import, R2 content sync, or Notion page-write flow was redesigned. No production deployment, plugin refresh, or Gate 4 ChatGPT test was performed.
