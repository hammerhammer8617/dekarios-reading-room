import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReadingEndSnapshot } from "@ss/shared";
import { ReadingEndCard } from "./ReadingEndCard.js";

export const readingEndFixture: ReadingEndSnapshot = {
  id: "snapshot-monsters-19",
  bookId: "book-monsters",
  operationId: "turn-19",
  createdAt: "2026-08-19T12:00:00.000Z",
  title: "打怪",
  positionLabel: "第 19 页",
  progressSummary: "读完“崇高的怪物性”，进入“受遏制的怪物性”",
  readingSummary:
    "这一段把怪物从令人敬畏的边界经验，推进为会被制度命名、约束与利用的对象；怪物性没有消失，只是换了一种被允许出现的方式。",
  tavThought: "所谓受遏制，也许不是怪物变弱，而是观看它的人终于找到一套能安心分类的语言。",
  galeThought: "分类在这里不是中性的知识动作；它同时建立秩序，也悄悄规定了什么可以被驱逐。",
  openQuestion: "下一节会把“遏制”写成真正有效的控制，还是另一种更隐蔽的怪物生产？",
  notionSyncStatus: "pending",
  thoughtCount: 3
};

describe("isolated ReadingEndCard", () => {
  it("renders every fixture field in the required order without empty sections", () => {
    const html = renderToStaticMarkup(<ReadingEndCard snapshot={readingEndFixture} />);
    const required = [
      "今天读到这里",
      "《打怪》",
      "第 19 页",
      "读到哪里",
      readingEndFixture.progressSummary,
      "今天读了什么",
      readingEndFixture.readingSummary,
      "塔芙留下",
      readingEndFixture.tavThought!,
      "盖尔留下",
      readingEndFixture.galeThought!,
      "留到下次",
      readingEndFixture.openQuestion!,
      "《书页边缘》待同步"
    ];
    for (const value of required) expect(html).toContain(value);
    for (let index = 1; index < required.length; index += 1) {
      expect(html.indexOf(required[index]!)).toBeGreaterThan(html.indexOf(required[index - 1]!));
    }
    expect(html).toContain("--reading-end-image:url(");
  });

  it("omits Tav, Gale and question sections when the snapshot omits them", () => {
    const { tavThought: _tav, galeThought: _gale, openQuestion: _question, ...snapshot } =
      readingEndFixture;
    const html = renderToStaticMarkup(<ReadingEndCard snapshot={snapshot} />);
    expect(html).not.toContain("塔芙留下");
    expect(html).not.toContain("盖尔留下");
    expect(html).not.toContain("留到下次");
  });

  it("keeps the isolated stylesheet intrinsic-height friendly", () => {
    const cssPath = resolve(process.cwd(), "src/reading-end/reading-end.css");
    const css = readFileSync(cssPath, "utf8");
    expect(css).not.toMatch(/100(?:d?vh|svh|lvh)/u);
    expect(css).not.toMatch(/overflow\s*:\s*(?:auto|scroll)/u);
    expect(css).toContain("height: auto");
    expect(css).toContain("overflow: visible");
  });
});
