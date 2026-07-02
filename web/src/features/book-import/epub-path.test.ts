import { describe, expect, it } from "vitest";
import {
  epubDirectoryName,
  normalizeEpubPath,
  resolveEpubPath
} from "./epub-path.js";

describe("EPUB path helpers", () => {
  it("normalizes dot segments and fragments", () => {
    expect(normalizeEpubPath("OEBPS/Text/../Images/pic.png#cover")).toBe(
      "OEBPS/Images/pic.png"
    );
  });

  it("resolves hrefs from the OPF directory", () => {
    expect(resolveEpubPath("OEBPS", "Text/chapter01.xhtml")).toBe(
      "OEBPS/Text/chapter01.xhtml"
    );
  });

  it("returns the directory of an EPUB resource", () => {
    expect(epubDirectoryName("OEBPS/content.opf")).toBe("OEBPS");
  });
});
