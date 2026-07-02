import { describe, expect, it } from "vitest";
import { extractEpubBlocks } from "./epub-blocks.js";

function parseBody(markup: string): Element {
  const document = new DOMParser().parseFromString(`<body>${markup}</body>`, "text/html");
  return document.body;
}

describe("extractEpubBlocks", () => {
  it("extracts image resources relative to the chapter path", () => {
    const blocks = extractEpubBlocks(
      parseBody('<p>正文</p><img src="../images/cover.png" alt="封面" title="Cover" />'),
      "chapter-1",
      "OPS/text/chapter.xhtml"
    );

    expect(blocks).toContainEqual({
      id: "chapter-1-block-2",
      type: "image",
      resourcePath: "OPS/images/cover.png",
      alt: "封面",
      title: "Cover"
    });
  });
});
