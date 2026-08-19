import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadingRoomSurface } from "./ReadingRoomSurface.js";

const book = {
  bookId: "book-1",
  title: "长夜难明",
  author: "紫金陈",
  genre: "mystery",
  status: "active" as const,
  tavPosition: { kind: "page" as const, index: 88, label: "第 88 页" },
  sharedPosition: { kind: "page" as const, index: 88, label: "第 88 页" },
  spoilerBoundary: { kind: "page" as const, index: 88, label: "第 88 页" },
  lastReadAt: "2026-08-19T12:00:00.000Z",
  lastNotionSyncedAt: null,
  openQuestionCount: 2,
  unsyncedThoughtCount: 3,
  casebookInProgress: true,
  casebookItemCount: 9
};

describe("ReadingRoomSurface", () => {
  it("renders a compact start card instead of the full bookshelf", () => {
    const html = renderToStaticMarkup(
      <ReadingRoomSurface initialOutput={{ view: "reading_status", book, openQuestionCount: 2 }} />
    );
    expect(html).toContain("共读已开始");
    expect(html).toContain("从 第 88 页 接着读");
    expect(html).toContain("查看书架");
    expect(html).not.toContain("手边的书");
  });

  it("renders the mobile bookshelf with progress, questions and casebook state", () => {
    const html = renderToStaticMarkup(
      <ReadingRoomSurface initialOutput={{ view: "bookshelf", bookshelf: [book] }} />
    );
    expect(html).toContain("德卡里奥斯家的书房");
    expect(html).toContain("手边的书");
    expect(html).toContain("塔芙");
    expect(html).toContain("共同");
    expect(html).toContain("2 个问题");
    expect(html).toContain("案件簿 9");
    expect(html).toContain("room-book-card");
    expect(html).not.toContain("class=\"book-card\"");
  });

  it("renders today's closing card with a stable built-in background", () => {
    const html = renderToStaticMarkup(
      <ReadingRoomSurface
        initialOutput={{
          view: "reading_end",
          book,
          operationId: "turn-18",
          tavThoughtCount: 1,
          galeThoughtCount: 1,
          sharedThoughtCount: 1,
          progressSummary: "读完时间证词，进入对缺失十分钟的追查。",
          readingSummary: "三份证词互相冲突，叙述中的时间断层浮到台前。",
          tavThought: "真正的交换发生在证词之外。",
          galeThought: "叙述节奏正在替某个人遮掩时间。",
          openQuestion: "缺失的十分钟是谁制造的？",
          unsyncedThoughtCount: 0
        }}
      />
    );
    expect(html).toContain("今天读到这里");
    expect(html).toContain("3 个新想法");
    expect(html).toContain("已收进书页边缘");
    expect(html).toContain("今天读了什么");
    expect(html).toContain("三份证词互相冲突");
    expect(html).toContain("塔芙留下");
    expect(html).toContain("盖尔留下");
    expect(html).toContain("留到下次");
    expect(html).toContain("--end-image:url(");
  });
});
