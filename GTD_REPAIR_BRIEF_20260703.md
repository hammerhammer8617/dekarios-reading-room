# GTD reading room repair brief — 2026-07-03

Real-device EPUB acceptance results:

- Two benchmark EPUB files parse successfully.
- Metadata, ordered reading units, images, cache restore, and inline footnotes work.
- EPUB reader page counts (280 / 395 pages) do not match the smoke lab's 40 / 28 count because the smoke lab is counting internal EPUB reading units, not reflowed pages.
- Large images can overflow the reading card.
- The smoke lab has no highlighting or companion-reading loop.

Required next pass on `feat/gtd-reading-room` only:

1. Keep the current EPUB parser/cache/footnote behavior intact.
2. Change misleading UI copy from “章节” to “阅读单元” where the count represents internal EPUB spine/reading units. Add a concise explanation that reading units are not the same as reader pagination.
3. Constrain EPUB images/figures/media to the content width on desktop and mobile.
4. Complete the formal shared-reading loop in `NovelReader` for structured EPUB:
   - selecting text captures a stable anchor using the existing selection-anchor utilities;
   - “给盖尔看这句” sends the selected text through the existing `onLook` path;
   - “划线并收藏” saves the normal quote and persists a visible local highlight;
   - highlights survive reopening the same reading session;
   - footnote triggers remain functional and highlights render correctly around footnotes.
5. The smoke lab should remain an acceptance lab, but clearly point users to the formal reading room for companion reading. Update previous/next labels to reading-unit wording.
6. Review and either complete or refactor the partial source commits already on the branch:
   - `701a9f804278d3b8de49252490f6371bf4859421`
   - `f39996f6e7a52f2d0c899fbdd4dc0a6675c1cd19`
   - `61e2f3218a7146875edfe587b88553e7716fe3ec`
7. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
8. Commit the regenerated production Pages output (`docs/index.html` and any required assets) so the branch-published GitHub Pages site actually contains the fixes.
9. Do not modify or merge `main`.

This file is a durable implementation brief for the Codex task and may remain in the draft PR until the repair pass is complete.
