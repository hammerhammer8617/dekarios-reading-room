import { describe, expect, it } from "vitest";
import {
  buildBatchChatMessage,
  buildBatchFallbackChatMessage,
  buildBatchUserNote,
  buildFormalReadingPrompt,
  buildCurrentOnlyFallbackPrompt,
  buildCurrentOnlyPrompt,
  buildGaleHighlightModelContext,
  buildGaleHighlightPrompt,
  buildSelectedTextFallbackPrompt,
  buildSelectedTextModelContext,
  buildSelectedTextPrompt,
  buildRecentOnlyFallbackPrompt,
  buildRecentOnlyPrompt
} from "./build-messages.js";
import type { ReadingSyncJob, SyncBatch } from "./types.js";

const batch: SyncBatch = {
  id: "batch-1",
  ordinal: 1,
  totalBatches: 4,
  rangeStart: 3,
  rangeEnd: 8,
  characterCount: 100,
  text: "【第 3 段】\n原文",
  isFinal: false,
  oversizedParagraph: false,
  status: "pending"
};

const job: ReadingSyncJob = {
  sessionId: "session-1",
  title: "测试小说",
  type: "novel",
  mode: "range_sync",
  targetPosition: { kind: "paragraph", index: 28, label: "第 28 段" },
  confirmedThrough: { kind: "paragraph", index: 2, label: "第 2 段" },
  batches: [batch],
  activeBatchIndex: 0,
  createdAt: "2026-06-22T00:00:00.000Z"
};

describe("reading-sync messages", () => {
  it("keeps a user-selected sentence out of formal short-comment protocols", () => {
    const context = buildSelectedTextModelContext({
      context: {
        sessionId: "session-1",
        currentText: "我们可以说，爱是一次旅行。",
        selectedText: "爱是一次旅行",
        userNote: "我喜欢这个隐喻。",
        mode: "current_only",
        readingCommentMode: "reaction_only",
        commentLength: "short",
        batch: { id: "old-batch" }
      },
      title: "我们赖以生存的隐喻",
      position: 19,
      selectedText: "爱是一次旅行",
      userNote: "我喜欢这个隐喻。"
    });

    expect(buildSelectedTextPrompt()).toBe(
      "盖尔，我在书页上划了一句给你，也可能写了批注。请告诉我你怎么看。"
    );
    expect(
      buildSelectedTextFallbackPrompt({
        selectedText: "爱是一次旅行",
        userNote: "我喜欢这个隐喻。"
      })
    ).toBe(
      "盖尔，我在书页上划了“爱是一次旅行”，批注是“我喜欢这个隐喻。”；请告诉我你怎么看。"
    );
    expect(context).toEqual(
      expect.objectContaining({
        mode: "selected_text",
        selectedText: "爱是一次旅行",
        userNote: "我喜欢这个隐喻。",
        companionRequest: expect.objectContaining({
          type: "selected_text_comment",
          instructions: expect.arrayContaining([
            expect.stringContaining("完整阐释和评价"),
            expect.stringContaining("不要调用 publish_companion_comment")
          ])
        })
      })
    );
    expect(context).not.toHaveProperty("readingCommentMode");
    expect(context).not.toHaveProperty("commentLength");
    expect(context).not.toHaveProperty("batch");
  });

  it("formats a recognizable non-final catch-up message", () => {
    const message = buildBatchChatMessage(job, batch);

    expect(message).toContain("【补课第 1/4 批：第 3–8 段】");
    expect(message).toContain("盖尔先安静追到用户当前位置");
    expect(message).toContain("只简短回复：“已读到第 8 段。”");
    expect(message).not.toContain(batch.text);
    expect(message).not.toMatch(/剧情摘要|关键事件|人物关系/);
    expect(message).not.toContain("publish_companion_comment");
  });

  it("includes source text only in the compatibility fallback message", () => {
  const message = buildBatchFallbackChatMessage(job, batch);

  expect(message).toContain("【补课第 1/4 批：第 3–8 段】");
  expect(message).toContain("只简短回复：“已读到第 8 段。”");
  expect(message).toContain(batch.text);
});

  it("puts only factual synchronization metadata in userNote", () => {
    const note = buildBatchUserNote(job, batch);

    expect(note).toContain("sessionId=session-1");
    expect(note).toContain("batchRange=3-8");
    expect(note).toContain("hasMoreBatches=true");
    expect(note).not.toMatch(/总结|判断|推测/);
  });

  it("keeps the visible highlight request brief and the full instructions hidden", () => {
    const prompt = buildGaleHighlightPrompt({ title: "测试小说", position: 8 });
    const context = buildGaleHighlightModelContext({
      context: { currentText: "当前段正文" },
      title: "测试小说",
      position: 8
    });
    const request = context.companionRequest as {
      instructions: string[];
    };

    expect(prompt).toBe("【盖尔划线】给我看看你在《测试小说》第 8 段会划下哪一句。");
    expect(prompt).not.toContain("\n");
    expect(prompt).not.toContain("操作说明");
    expect(request.instructions.join("\n")).toContain("不限制为一句");
    expect(request.instructions.join("\n")).toContain("阐释与评价");
    expect(request.instructions.join("\n")).toContain("不要复述这些操作说明");
    expect((context as Record<string, unknown>).currentText).toBe("当前段正文");
  });

  it("builds a separate formal prompt without repeating source text", () => {
    const prompt = buildFormalReadingPrompt(job, {
      mode: "light_chat",
      length: "normal",
      operationId: "catch-up-op-1",
      autoSaveCompanionComments: true
    });

    expect(prompt).toContain("补课已确认完成");
    expect(prompt).toContain("第 3-28 段");
    expect(prompt).not.toContain(batch.text);
    expect(prompt).toContain("先调用 publish_companion_comment");
    expect(prompt).toContain("source=catch_up_completion");
    expect(prompt).toContain("盖尔想给塔芙看的句子");
    expect(prompt).toContain("回赠给塔芙的一条划线");
    expect(prompt).not.toMatch(/剧情变化.*人物变化.*伏笔猜测.*当前感受/s);
  });

  it("routes current-only and recent-only formal requests through prompt policy", () => {
    const current = buildCurrentOnlyPrompt({
      sessionId: "session-1",
      title: "测试小说",
      position: 8,
      hasUnconfirmedGap: true,
      mode: "reaction_only",
      length: "short",
      operationId: "current-op-1",
      autoSaveCompanionComments: true
    });
    const recent = buildRecentOnlyPrompt({
      sessionId: "session-1",
      title: "测试小说",
      rangeStart: 4,
      rangeEnd: 8,
      mode: "plot_guess",
      length: "normal",
      operationId: "recent-op-1",
      autoSaveCompanionComments: true
    });

    expect(current).not.toContain("当前原文");
    expect(current).toContain("中间存在未同步剧情");
    expect(current).toContain("1-5 句");
    expect(recent).not.toContain("最近原文");
    expect(recent).toContain("后续走向");
    expect(current).toContain("operationId=current-op-1");
    expect(recent).toContain("operationId=recent-op-1");
    expect(current).toContain("source=current_context");
    expect(recent).toContain("source=quick_action");
  });


  it("includes current and recent source text only in fallback prompts", () => {
    const current = buildCurrentOnlyFallbackPrompt({
      sessionId: "session-1",
      title: "测试小说",
      position: 8,
      text: "当前原文",
      selectedText: "划线句子",
      userNote: "这句的动作很有意思",
      hasUnconfirmedGap: true,
      mode: "reaction_only",
      length: "short",
      operationId: "current-op-1",
      autoSaveCompanionComments: true
    });
    const recent = buildRecentOnlyFallbackPrompt({
      sessionId: "session-1",
      title: "测试小说",
      rangeStart: 4,
      rangeEnd: 8,
      text: "最近原文",
      mode: "plot_guess",
      length: "normal",
      operationId: "recent-op-1",
      autoSaveCompanionComments: true
    });

    expect(current).toContain("【只看当前段：第 8 段】");
    expect(current).toContain("当前原文");
    expect(current).toContain("划线句子");
    expect(current).toContain("我对这句的批注：这句的动作很有意思");
    expect(recent).toContain("【补最近几段：第 4–8 段】");
    expect(recent).toContain("最近原文");
  });

  it("does not request companion publish for any formal route when auto-save is off", () => {
    const formal = buildFormalReadingPrompt(job, {
      mode: "light_chat",
      length: "normal",
      operationId: "catch-up-op-1",
      autoSaveCompanionComments: false
    });
    const current = buildCurrentOnlyPrompt({
      sessionId: "session-1",
      title: "测试小说",
      position: 8,
      hasUnconfirmedGap: false,
      mode: "reaction_only",
      length: "short",
      operationId: "current-op-1",
      autoSaveCompanionComments: false
    });
    const recent = buildRecentOnlyPrompt({
      sessionId: "session-1",
      title: "测试小说",
      rangeStart: 4,
      rangeEnd: 8,
      mode: "plot_guess",
      length: "normal",
      operationId: "recent-op-1",
      autoSaveCompanionComments: false
    });

    expect(formal).not.toContain("publish_companion_comment");
    expect(current).not.toContain("publish_companion_comment");
    expect(recent).not.toContain("publish_companion_comment");
    expect(current).toContain("不自动保存短评到 Dock");
    expect(current).toContain("直接在聊天区回复短评");
  });
});
