import { describe, expect, it } from "vitest";
import { parseEpubChapter } from "./epub-dom.js";

describe("EPUB footnotes", () => {
  it("separates note text from the readable paragraph", () => {
    const chapter = parseEpubChapter(
      `<html xmlns="http://www.w3.org/1999/xhtml"><body>
        <p>正文开始<a id="zw1" href="chapter.xhtml#zhu1"><sup>[1]</sup></a>正文继续。</p>
        <div class="fnote"><p><a id="zhu1" href="chapter.xhtml#zw1">[1]</a> 这是脚注内容。</p></div>
      </body></html>`,
      "chapter-1",
      "text/chapter.xhtml",
      1,
      "测试章节"
    );

    expect(chapter.text).toBe("正文开始正文继续。");
    expect(chapter.footnotes).toEqual([
      expect.objectContaining({ label: "[1]", text: "这是脚注内容。" })
    ]);
    expect(chapter.blocks?.[0]).toMatchObject({
      type: "paragraph",
      footnoteRefs: [expect.objectContaining({ label: "[1]", offset: 4 })]
    });
  });
});
