import { describe, expect, it } from "vitest";
import { structuredBookCacheKey } from "./structured-book-cache.js";

describe("structured book cache keys", () => {
  it("is stable for the same normalized book text", () => {
    const sourceText = "第一章\n\n第二章";
    expect(structuredBookCacheKey(sourceText)).toBe(structuredBookCacheKey(sourceText));
  });

  it("changes when the normalized book text changes", () => {
    expect(structuredBookCacheKey("第一章")).not.toBe(
      structuredBookCacheKey("第一章。")
    );
  });
});
