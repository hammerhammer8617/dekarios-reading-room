import { describe, expect, it } from "vitest";
import {
  createTextSelectionAnchor,
  resolveTextSelectionAnchor
} from "./selection-anchor.js";

const originalBlocks = [
  { id: "p-1", text: "第一段先说一点别的。" },
  { id: "p-2", text: "这一句值得划线给盖尔看。" },
  { id: "p-3", text: "第三段继续讨论。" }
];

describe("text selection anchors", () => {
  it("resolves directly when stable block ids still match", () => {
    const anchor = createTextSelectionAnchor({
      chapterId: "chapter-1",
      blocks: originalBlocks,
      startBlockId: "p-2",
      startOffset: 0,
      endBlockId: "p-2",
      endOffset: 12
    });

    expect(resolveTextSelectionAnchor(anchor, originalBlocks)).toEqual({
      startBlockId: "p-2",
      startOffset: 0,
      endBlockId: "p-2",
      endOffset: 12,
      exact: "这一句值得划线给盖尔看。"
    });
  });

  it("finds the same quote after block ids change", () => {
    const anchor = createTextSelectionAnchor({
      chapterId: "chapter-1",
      blocks: originalBlocks,
      startBlockId: "p-2",
      startOffset: 0,
      endBlockId: "p-2",
      endOffset: 12
    });
    const reparsedBlocks = originalBlocks.map((block, index) => ({
      id: `new-${index + 1}`,
      text: block.text
    }));

    expect(resolveTextSelectionAnchor(anchor, reparsedBlocks)).toMatchObject({
      startBlockId: "new-2",
      startOffset: 0,
      endBlockId: "new-2",
      endOffset: 12
    });
  });
});
