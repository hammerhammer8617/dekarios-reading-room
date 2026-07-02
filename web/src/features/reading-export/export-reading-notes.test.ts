import { describe, expect, it } from "vitest";
import { buildReadingNotesMarkdown } from "./export-reading-notes.js";

describe("buildReadingNotesMarkdown", () => {
  it("exports highlights, personal notes and companion comments", () => {
    const markdown = buildReadingNotesMarkdown({
      title: "智能简史",
      authors: ["麦克斯·班尼特"],
      exportedAt: new Date("2026-07-02T12:00:00.000Z"),
      quotes: [
        {
          id: "quote-1",
          sessionId: "session-1",
          content: "这是一段被划线的文字。",
          position: { kind: "paragraph", index: 8, label: "第 8 段" },
          note: "这句值得继续讨论。",
          createdAt: "2026-07-02T11:00:00.000Z"
        }
      ],
      companionComments: [
        {
          id: "comment-1",
          sessionId: "session-1",
          position: { kind: "paragraph", index: 8, label: "第 8 段" },
          mode: "light_chat",
          length: "normal",
          text: "这句话的前提很有意思。",
          source: "current_context",
          inRecent: true,
          inHistory: true,
          createdAt: "2026-07-02T11:01:00.000Z"
        }
      ]
    });

    expect(markdown).toContain("# 智能简史");
    expect(markdown).toContain("> 这是一段被划线的文字。");
    expect(markdown).toContain("我的批注：这句值得继续讨论。");
    expect(markdown).toContain("盖尔的页边批注");
  });
});
