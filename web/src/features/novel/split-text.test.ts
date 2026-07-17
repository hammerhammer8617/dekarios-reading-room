import { afterEach, describe, expect, it } from "vitest";
import { splitNovelText } from "./split-text.js";
import {
  clearActiveImportedBook,
  setActiveImportedBook
} from "../book-import/active-imported-book.js";

afterEach(() => clearActiveImportedBook());

describe("splitNovelText", () => {
  it("merges short TXT or Markdown paragraphs and removes empty chunks", () => {
    expect(splitNovelText(" 第一段。 \n\n\n## 第二段\n内容。 ")).toEqual([
      "第一段。\n\n## 第二段\n内容。"
    ]);
  });

  it("keeps image-only EPUB chapters and records inline image positions", () => {
    const sourceText = "第一章\n\n第二章";
    setActiveImportedBook({
      format: "epub",
      fileName: "illustrated.epub",
      title: "图书",
      authors: [],
      sourceText,
      chapters: [
        {
          id: "cover",
          title: "封面",
          text: "",
          blocks: [
            { id: "cover-image", type: "image", resourcePath: "images/cover.jpg", alt: "封面" }
          ]
        },
        {
          id: "chapter-1",
          title: "第一章",
          text: "第一章",
          blocks: [
            { id: "chapter-heading", type: "heading", level: 1, text: "第一章" },
            { id: "chapter-image", type: "image", resourcePath: "images/map.png", alt: "地图" }
          ]
        },
        { id: "chapter-2", title: "第二章", text: "第二章" }
      ]
    });

    expect(splitNovelText(sourceText)).toEqual([
      "【图片：封面】",
      "第一章\n\n【图片：地图】",
      "第二章"
    ]);
  });
});
