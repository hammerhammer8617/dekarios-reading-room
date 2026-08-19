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
});
