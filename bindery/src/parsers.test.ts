import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSourceBook } from "./parsers.js";

describe("source book parsers", () => {
  it("extracts real DOCX XML into a readable chapter", async () => {
    const bytes = await readFile(resolve(
      process.cwd(),
      "node_modules/mammoth/test/test-data/single-paragraph.docx"
    ));
    const browserBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(browserBuffer).set(bytes);
    const file = {
      name: "测试文稿.docx",
      size: bytes.byteLength,
      arrayBuffer: async () => browserBuffer
    } as File;

    const book = await parseSourceBook(file);

    expect(book.title).toBe("测试文稿");
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]?.html).toContain("Walking on imported air");
  });
});
