import { describe, expect, it } from "vitest";
import {
  detectBinderyFormat,
  formatBytes,
  safeEpubFileName,
  stripBookExtension
} from "./format.js";

describe("bindery formats", () => {
  it("detects every supported extension without caring about case", () => {
    expect(detectBinderyFormat("Novel.DOCX")).toBe("docx");
    expect(detectBinderyFormat("book.azw3")).toBe("azw3");
    expect(detectBinderyFormat("notes.markdown")).toBe("markdown");
  });

  it("creates a filesystem-safe epub name", () => {
    expect(safeEpubFileName("  A/B：书  ")).toBe("A-B：书.epub");
    expect(stripBookExtension("作品.epub")).toBe("作品");
  });

  it("formats binary file sizes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
  });
});
