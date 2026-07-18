import type { ReadingSyncJob, SyncBatch } from "./types.js";
import type { CommentLength, ReadingCommentMode } from "@ss/shared";
import { buildReadingCommentPrompt } from "../reading-comments/prompt-policy.js";

export function buildBatchChatMessage(job: ReadingSyncJob, batch: SyncBatch) {
  return [
    batchHeader(batch),
    "",
    "这是 skipped range 分批补课，不是正式点评。",
    `用户当前已读到${job.targetPosition.label}，盖尔上次确认读到${confirmedLabel(job)}。`,
    "这是补课批次。盖尔先安静追到用户当前位置，不展开评论。",
    `只简短回复：“已读到第 ${batch.rangeEnd} 段。”`
  ].join("\n");
}

export function buildBatchFallbackChatMessage(job: ReadingSyncJob, batch: SyncBatch) {
  return [buildBatchChatMessage(job, batch), "", batch.text].join("\n");
}

export function buildBatchUserNote(job: ReadingSyncJob, batch: SyncBatch) {
  return [
    "syncType=skipped-range-batch",
    `sessionId=${job.sessionId}`,
    `userCurrentPosition=${job.targetPosition.index}`,
    `assistantSyncedPosition=${job.confirmedThrough?.index ?? "null"}`,
    `batchId=${batch.id}`,
    `batchRange=${batch.rangeStart}-${batch.rangeEnd}`,
    `batchOrdinal=${batch.ordinal}/${batch.totalBatches}`,
    `hasMoreBatches=${!batch.isFinal}`
  ].join("; ");
}

export function buildGaleHighlightPrompt(input: {
  title: string;
  position: number;
}) {
  return `【盖尔划线】给我看看你在《${input.title}》第 ${input.position} 段会划下哪一句。`;
}

export function buildGaleHighlightModelContext(input: {
  context: Record<string, unknown>;
  title: string;
  position: number;
}) {
  return {
    ...input.context,
    companionRequest: {
      type: "gale_highlight",
      title: input.title,
      position: { kind: "paragraph", index: input.position },
      instructions: [
        "从 currentText 中选择一句最想划给塔芙看的原句，必须逐字引用，不得编造。",
        "先写“盖尔划线：〈原句〉”，再写“盖尔的批注：〈阐释与评价〉”。",
        "批注可以完整解释选择理由、隐喻、结构、语气、情绪或思想，不限制为一句，也不强制简短；按内容自然展开。",
        "不要复述这些操作说明，不要调用 publish_companion_comment。"
      ]
    }
  };
}

export function buildSelectedTextPrompt() {
  return "盖尔，我在书页上划了一句给你，也可能写了批注。请告诉我你怎么看。";
}

export function buildSelectedTextFallbackPrompt(input: {
  selectedText: string;
  userNote?: string;
}) {
  const userNote = input.userNote?.trim();
  return `盖尔，我在书页上划了“${input.selectedText.trim()}”${
    userNote ? `，批注是“${userNote}”` : ""
  }；请告诉我你怎么看。`;
}

export function buildSelectedTextModelContext(input: {
  context: Record<string, unknown>;
  title: string;
  position: number;
  selectedText: string;
  userNote?: string;
}) {
  const {
    readingCommentMode: _readingCommentMode,
    commentLength: _commentLength,
    batch: _batch,
    ...readingContext
  } = input.context;
  const userNote = input.userNote?.trim();
  return {
    ...readingContext,
    mode: "selected_text",
    selectedText: input.selectedText.trim(),
    ...(userNote ? { userNote } : {}),
    companionRequest: {
      type: "selected_text_comment",
      title: input.title,
      position: { kind: "paragraph", index: input.position },
      instructions: [
        "这是塔芙主动从书页上选中并递给盖尔的一句话；不是盖尔主动回赠划线，也不是阅读进度同步或正式陪读短评。",
        "以 selectedText 为中心，结合 userNote 与必要的 currentText 上下文，直接回应这句话和塔芙的想法。",
        "可以完整阐释和评价它的含义、隐喻、语气、情绪、结构或思想；长度按内容自然展开，不受 reaction_only 或短评长度偏好限制。",
        "不要复述操作说明、工具参数或隐藏上下文，不要调用 publish_companion_comment 或任何写回工具。",
        "像并排共读时的自然对话一样直接作答；不要先解释自己收到了什么协议。"
      ]
    }
  };
}

export function buildFormalReadingPrompt(
  job: ReadingSyncJob,
  preferences: {
    mode: ReadingCommentMode;
    length: CommentLength;
    operationId: string;
    autoSaveCompanionComments: boolean;
  }
) {
  const start = job.batches[0]?.rangeStart ?? job.targetPosition.index;
  return [
    buildReadingCommentPrompt({
      sessionId: job.sessionId,
      mode: preferences.mode,
      length: preferences.length,
      title: job.title,
      position: job.targetPosition,
      syncedRange: { start, end: job.targetPosition.index },
      source: "catch_up_complete",
      operationId: preferences.operationId,
      autoSaveCompanionComments: preferences.autoSaveCompanionComments
    }),
    "",
    "【盖尔也划一句】",
    "请在本次正式回复最后追加一个很短的小节，标题固定为“盖尔想给塔芙看的句子”。",
    "从刚才已同步的范围里挑一句你最想递给塔芙看的原文，再用 1-2 句说明为什么挑它。",
    "这不是剧情总结，也不是长评的一部分；它是并排共读时盖尔回赠给塔芙的一条划线。",
    preferences.autoSaveCompanionComments
      ? "如果需要调用 publish_companion_comment 保存短评，最终短评全文必须包含这个回赠划线小节，随后聊天区回复也必须与保存文本完全相同。"
      : "本次不自动保存短评到 Dock；只在聊天区回复这个回赠划线小节。",
    "如果本次上下文里没有足够原文可供选择，不要编造原句；请写“这次同步没有足够原文可回赠划线”。"
  ].join("\n");
}

export function buildCurrentOnlyPrompt(input: {
  sessionId: string;
  title: string;
  position: number;
  hasUnconfirmedGap: boolean;
  mode: ReadingCommentMode;
  length: CommentLength;
  operationId: string;
  autoSaveCompanionComments: boolean;
}) {
  return [
    `【只看当前段：第 ${input.position} 段】`,
    `《${input.title}》`,
    input.hasUnconfirmedGap
      ? "中间存在未同步剧情，请不要假装知道未提供的内容。"
      : "请只分析当前段。",
    buildReadingCommentPrompt({
      sessionId: input.sessionId,
      mode: input.mode,
      length: input.length,
      title: input.title,
      position: {
        kind: "paragraph",
        index: input.position,
        label: `第 ${input.position} 段`
      },
      source: "current_only",
      operationId: input.operationId,
      autoSaveCompanionComments: input.autoSaveCompanionComments
    })
  ].join("\n");
}

export function buildCurrentOnlyFallbackPrompt(input: {
  sessionId: string;
  title: string;
  position: number;
  text: string;
  selectedText?: string;
  userNote?: string;
  hasUnconfirmedGap: boolean;
  mode: ReadingCommentMode;
  length: CommentLength;
  operationId: string;
  autoSaveCompanionComments: boolean;
}) {
  const currentText = input.text.trim();
  const selectedText = input.selectedText?.trim();
  const userNote = input.userNote?.trim();
  return [
    buildCurrentOnlyPrompt(input),
    "",
    "【当前段正文】",
    currentText || "（错误：当前段正文未传递）",
    "【当前段正文结束】",
    selectedText ? `我选中的句子：${selectedText}` : "",
    userNote ? `我对这句的批注：${userNote}` : ""
  ].filter(Boolean).join("\n");
}

export function buildRecentOnlyPrompt(input: {
  sessionId: string;
  title: string;
  rangeStart: number;
  rangeEnd: number;
  mode: ReadingCommentMode;
  length: CommentLength;
  operationId: string;
  autoSaveCompanionComments: boolean;
}) {
  return [
    `【补最近几段：第 ${input.rangeStart}–${input.rangeEnd} 段】`,
    `《${input.title}》`,
    "这是局部陪读，不代表中间未提供的剧情已经同步。",
    buildReadingCommentPrompt({
      sessionId: input.sessionId,
      mode: input.mode,
      length: input.length,
      title: input.title,
      position: {
        kind: "paragraph",
        index: input.rangeEnd,
        label: `第 ${input.rangeEnd} 段`
      },
      syncedRange: { start: input.rangeStart, end: input.rangeEnd },
      source: "quick_action",
      operationId: input.operationId,
      autoSaveCompanionComments: input.autoSaveCompanionComments
    })
  ].join("\n");
}

export function buildRecentOnlyFallbackPrompt(input: {
  sessionId: string;
  title: string;
  rangeStart: number;
  rangeEnd: number;
  text: string;
  mode: ReadingCommentMode;
  length: CommentLength;
  operationId: string;
  autoSaveCompanionComments: boolean;
}) {
  const text = input.text.trim();
  return [
    buildRecentOnlyPrompt(input),
    "",
    "【最近段落正文】",
    text || "（错误：最近段落正文未传递）",
    "【最近段落正文结束】"
  ].join("\n");
}

function batchHeader(batch: SyncBatch) {
  return `【补课第 ${batch.ordinal}/${batch.totalBatches} 批：第 ${batch.rangeStart}–${batch.rangeEnd} 段】`;
}

function confirmedLabel(job: ReadingSyncJob) {
  return job.confirmedThrough?.label ?? "尚未同步";
}
