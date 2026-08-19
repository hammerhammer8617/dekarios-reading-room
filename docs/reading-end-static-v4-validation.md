# Reading-end v4 static stop-loss candidate

> Candidate resource: `ui://ss-reading-nest/reading-end-v4.html`
>
> Candidate tool: `render_reading_end_card_v4`
>
> Status: Gate 1–3 candidate; not deployed

## Why v4 exists

The real ChatGPT acceptance test for v3 still rendered only the host's near-zero-height line. That falsified the remaining assumption that an early `window.openai.notifyIntrinsicHeight` fallback was sufficient.

v4 is deliberately a stop-loss experiment. It removes every nonessential variable from the reading-end resource:

- no React mount;
- no `@modelcontextprotocol/ext-apps` runtime bundle;
- no card background images;
- no network permission in the resource CSP;
- no dependence on the `ui/initialize` response before the first size report.

The six approved card backgrounds remain in the repository for a later restoration, but none is shipped in this candidate artifact.

## Resource behavior

The HTML contains a pre-rendered card with a `320px` minimum intrinsic height. If JavaScript never executes, the card still says that the plain-HTML shell loaded.

The tiny vanilla bridge then:

1. sends a synchronous `ui/notifications/size-changed` notification before `ui/initialize`;
2. performs the standard `ui/initialize` handshake without blocking the visible shell;
3. resends the same size after initialization is acknowledged, because a host may ignore the eager notification;
4. accepts standard `ui/notifications/tool-result` snapshots;
5. accepts capability-detected `window.openai.toolOutput` / `openai:set_globals` snapshots;
6. reports later content-height changes and suppresses unchanged duplicates;
7. keeps the static shell visible with an explicit error when output validation fails.

This uses the raw JSON-RPC `postMessage` shape documented in the [official OpenAI UI guide](https://developers.openai.com/plugins/build/chatgpt-ui), while preserving the existing authoritative snapshot-only render contract.

## Gate 1 — data

The v4 tool still accepts only `snapshotId`; no summary text moved back into render-time arguments. The shared schema and reading-room service remain unchanged. Focused data/MCP verification passed:

- shared schema and migration: `45/45`;
- service, tool registration and resource metadata: `9/9`;
- missing or incomplete client snapshot: explicit diagnostic, never an empty card.

## Gate 2 — visual structure

The pre-rendered shell and populated snapshot state are both covered by the isolated DOM fixture. The source audit proves:

- `390px` viewport → `382px` card after outer padding;
- `768px` viewport → capped `620px` card;
- `320px` minimum shell height;
- no `100vh`/`100dvh` family rule;
- no internal `overflow: auto` or `overflow: scroll`;
- optional Tav, Gale and open-question sections appear only when supplied.

This candidate intentionally omits illustration styling. Its visual question is only whether ChatGPT can show ordinary, readable HTML instead of a line.

## Gate 3 — host and artifact

The isolated reading-end suite passes `20/20`, including eight v4-specific tests for pre-handshake sizing, post-handshake repeat sizing, standard tool results, compatibility output, dynamic height, de-duplication, invalid output and the 390/768 shell contract.

Production build audit:

```text
web/dist-reading-end/reading-end.html  9.63 kB
gzip                                 3.79 kB
embedded WebP                        0
forbidden legacy tokens              0
```

The previous v3 artifact was roughly `2.13 MB` (`1.34 MB` gzip). The v4 candidate is therefore small enough to distinguish a host/resource failure from a heavy-bundle failure.

## Explicitly unchanged

No bookshelf, book detail, casebook, legacy reader, import, R2, D1, Notion write or reading-record business logic was redesigned. No deployment trigger was changed, and no production deployment was performed.

## Gate 4 protocol

Only after clean GitHub CI succeeds:

1. deploy the new versioned tool/resource;
2. refresh the plugin connection once;
3. open one new chat;
4. run one real reading-end render;
5. distinguish the result:
   - full snapshot card: host and data bridge both work;
   - static diagnostic card: plain HTML works, tool-result delivery does not;
   - line: the failure is above the resource implementation layer.
