// @vitest-environment node
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assertEpubFits, MAX_EPUB_OUTPUT_BYTES, packageEpub } from "./epub.js";
import { BinderyError, type BinderyBook } from "./types.js";

const book: BinderyBook = {
  title: "测试书",
  authors: ["塔芙"],
  language: "zh-CN",
  chapters: [{ title: "第一章", html: "<p>这是正文。</p>" }],
  assets: [],
  warnings: []
};

describe("EPUB packaging", () => {
  it("creates the required EPUB files with an uncompressed mimetype payload", () => {
    const bytes = packageEpub(book, []);
    const archive = unzipSync(bytes);
    expect(strFromU8(archive.mimetype!)).toBe("application/epub+zip");
    expect(strFromU8(archive["META-INF/container.xml"]!)).toContain("OEBPS/content.opf");
    expect(strFromU8(archive["OEBPS/content.opf"]!)).toContain("测试书");
    expect(strFromU8(archive["OEBPS/text/chapter-1.xhtml"]!)).toContain("这是正文");
  });

  it("enforces a strict less-than-40-MiB download gate", () => {
    expect(() => assertEpubFits({ byteLength: MAX_EPUB_OUTPUT_BYTES - 1 })).not.toThrow();
    expect(() => assertEpubFits({ byteLength: MAX_EPUB_OUTPUT_BYTES })).toThrow(BinderyError);
  });
});
