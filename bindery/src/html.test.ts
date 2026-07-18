import { describe, expect, it } from "vitest";
import { markdownToHtml, plainTextToHtml } from "./html.js";

describe("chapter html helpers", () => {
  it("escapes plain text while preserving paragraphs", () => {
    expect(plainTextToHtml("第一段 <x>\n\n第二段")).toContain("&lt;x&gt;");
    expect(plainTextToHtml("第一段\n\n第二段")).toContain("<p>第二段</p>");
  });

  it("renders useful markdown structures", () => {
    const html = markdownToHtml("# 标题\n\n**粗体**\n\n- 一\n- 二");
    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain("<strong>粗体</strong>");
    expect(html).toContain("<ul>");
  });
});
