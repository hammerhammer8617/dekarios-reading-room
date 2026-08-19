import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  BOOKSHELF_RESOURCE_URI,
  BOOKSHELF_TOOL_NAME,
  getBookDetailsInputSchema,
  getCasebookInputSchema,
  getOrStartBookContextInputSchema,
  LEGACY_BOOKSHELF_TOOL_NAME,
  markNotionSyncedInputSchema,
  openBookshelfInputSchema,
  openBookshelfOutputSchema,
  prepareNotionSyncInputSchema,
  READING_END_RESOURCE_URI,
  recordCasebookUpdateInputSchema,
  recordReadingTurnInputSchema,
  renderReadingEndCardInputSchema,
  renderReadingEndCardOutputSchema,
  renderReadingStatusInputSchema
} from "@ss/shared";
import type { ReadingRoomService } from "../services/reading-room-service.js";
import { toolResult } from "./tool-result.js";
import { READING_NEST_URI } from "./register-tools.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};
const mutation = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false
};

export function registerReadingRoomTools(server: McpServer, service: ReadingRoomService) {
  server.registerTool(
    "get_or_start_book_context",
    {
      title: "找到或开始一本共读书",
      description:
        "Call this at the start of shared reading when the user says ‘我们一起读’, ‘你看这一页’, continues a named book, or sends a book-page photo in an established reading context. Restore the book, Tav/shared progress, spoiler boundary, recent attributed thoughts, open questions, and casebook state. If multiple active books fit and the page does not identify one, return candidates instead of guessing. Do not call for work screenshots, ads, chat logs, film frames, or other non-book images.",
      inputSchema: getOrStartBookContextInputSchema,
      annotations: { ...mutation, idempotentHint: true },
      _meta: {
        "openai/toolInvocation/invoking": "正在找到这本书的上次书签…",
        "openai/toolInvocation/invoked": "共读上下文已经接续"
      }
    },
    async (input) => {
      const result = await service.getOrStartBookContext(input);
      if (result.needsSelection) {
        return toolResult(
          result,
          "无法安全确定是哪一本书。请根据候选书名向塔芙确认，不要自行选择。"
        );
      }
      return toolResult(
        result,
        `已经接续《${result.context.session.title}》。请遵守剧透边界并直接讨论用户提供的书页。`
      );
    }
  );

  server.registerTool(
    "record_reading_turn",
    {
      title: "保存一次共读进展",
      description:
        "Call after discussing supplied book pages when there is a clear progress change or a durable thought worth keeping. Save Tav, Gale, and shared thoughts with attribution; preserve questions, predictions, disagreements, cross-book connections, revisions, and spoiler boundaries. When the user stops for today, include endSnapshot.progressSummary and endSnapshot.readingSummary in this same operation so the server persists an authoritative closing snapshot and returns its id. Do not store generic small talk or infer page contents the user did not supply.",
      inputSchema: recordReadingTurnInputSchema,
      annotations: { ...mutation, idempotentHint: true },
      _meta: {
        "openai/toolInvocation/invoking": "正在把书页边缘的想法夹好…",
        "openai/toolInvocation/invoked": "这一段已经收进书房"
      }
    },
    async (input) => {
      const result = await service.recordReadingTurn(input);
      return toolResult(result, "本次进度与值得保留的双方思考已经写回书房。");
    }
  );

  server.registerTool(
    "get_book_details",
    {
      title: "读取一本书的完整共读记录",
      description:
        "Use when the user asks what has been recorded for one book, or before reviewing how earlier interpretations changed. Returns progress, attributed thought history, open questions, bookmarks, quotes, and casebook data without rendering UI.",
      inputSchema: getBookDetailsInputSchema,
      annotations: readOnly
    },
    async ({ bookId }) =>
      toolResult(await service.getBookDetails(bookId), "已读取这本书的完整共读记录。")
  );

  server.registerTool(
    "prepare_notion_sync",
    {
      title: "整理《书页边缘》增量",
      description:
        "Use at the end of a durable reading session or when the user asks to sync. Prepare only unsynced attributed thoughts for the matching Notion page ‘《书名》｜书页边缘’. This does not claim the Notion write succeeded; after the actual Notion write, call mark_notion_synced with the returned thoughtIds.",
      inputSchema: prepareNotionSyncInputSchema,
      annotations: readOnly
    },
    async ({ bookId, limit }) => {
      const result = await service.prepareNotionSync(bookId, limit);
      return toolResult(
        result,
        result.thoughtCount > 0
          ? `已整理 ${result.thoughtCount} 条待同步内容。实际写入 Notion 后再确认同步。`
          : "没有尚未同步到 Notion 的共读思考。"
      );
    }
  );

  server.registerTool(
    "mark_notion_synced",
    {
      title: "确认《书页边缘》同步成功",
      description:
        "Call only after the matching Notion write actually succeeds. Marks exactly the supplied thoughtIds as synced; never use it merely because prepare_notion_sync ran.",
      inputSchema: markNotionSyncedInputSchema,
      annotations: { ...mutation, idempotentHint: true }
    },
    async ({ bookId, thoughtIds, syncedAt }) =>
      toolResult(
        await service.markNotionSynced(bookId, thoughtIds, syncedAt),
        "已确认这些共读思考写入《书页边缘》。"
      )
  );

  server.registerTool(
    "record_casebook_update",
    {
      title: "更新推理案件簿",
      description:
        "Use only for mystery or detective books when supplied pages support a new person, relation, clue, hypothesis, timeline entry, or next observation task. Keep suspected, confirmed, disproved, and solved states distinct. Never use future-book knowledge or reveal spoilers beyond Tav's boundary.",
      inputSchema: recordCasebookUpdateInputSchema,
      annotations: { ...mutation, idempotentHint: true },
      _meta: {
        "openai/toolInvocation/invoking": "正在更新案件簿…",
        "openai/toolInvocation/invoked": "线索与假说已经归档"
      }
    },
    async (input) =>
      toolResult(await service.recordCasebookUpdate(input), "案件簿已按当前证据更新。")
  );

  server.registerTool(
    "get_casebook",
    {
      title: "读取推理案件簿",
      description:
        "Use when reasoning about a mystery book or when the user asks to inspect its people, relations, clues, hypotheses, timeline, or next observation tasks. Read only; preserve uncertainty and the current spoiler boundary.",
      inputSchema: getCasebookInputSchema,
      annotations: readOnly
    },
    async ({ bookId }) => toolResult({ casebook: await service.getCasebook(bookId) }, "案件簿已打开。")
  );

  const renderBookshelf = async () =>
    toolResult(
      { view: "bookshelf" as const, bookshelf: await service.listBookshelf() },
      "书架已经完整显示；不要在卡片外重复列出全部内容。"
    );

  registerAppTool(
    server,
    LEGACY_BOOKSHELF_TOOL_NAME,
    {
      title: "打开德卡里奥斯家的书架（兼容入口）",
      description:
        "Legacy app-only bookshelf entry retained for already-mounted reading-room components. Models must use open_bookshelf_v2 instead.",
      inputSchema: openBookshelfInputSchema,
      outputSchema: openBookshelfOutputSchema,
      annotations: readOnly,
      _meta: {
        ui: { resourceUri: BOOKSHELF_RESOURCE_URI, visibility: ["app"] },
        "openai/outputTemplate": BOOKSHELF_RESOURCE_URI
      }
    },
    renderBookshelf
  );

  registerAppTool(
    server,
    BOOKSHELF_TOOL_NAME,
    {
      title: "打开德卡里奥斯家的书架",
      description:
        "Use this versioned render tool when the user explicitly asks to open the bookshelf, see what they are reading, inspect book records, or open a casebook. It replaces the legacy open_bookshelf descriptor. Do not render it for each page photo or ordinary reading turn.",
      inputSchema: openBookshelfInputSchema,
      outputSchema: openBookshelfOutputSchema,
      annotations: readOnly,
      _meta: {
        ui: { resourceUri: BOOKSHELF_RESOURCE_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": BOOKSHELF_RESOURCE_URI,
        "openai/toolInvocation/invoking": "正在推开书房的门…",
        "openai/toolInvocation/invoked": "德卡里奥斯家的书架已经打开"
      }
    },
    renderBookshelf
  );

  registerAppTool(
    server,
    "render_reading_status",
    {
      title: "显示共读已开始",
      description:
        "Render one compact start card after get_or_start_book_context when a shared-reading session begins. Show it once, then continue discussing page photos without re-rendering it.",
      inputSchema: renderReadingStatusInputSchema,
      annotations: readOnly,
      _meta: {
        ui: { resourceUri: READING_NEST_URI },
        "openai/outputTemplate": READING_NEST_URI,
        "openai/toolInvocation/invoking": "正在点亮共读书签…",
        "openai/toolInvocation/invoked": "共读已经开始"
      }
    },
    async ({ bookId }) =>
      toolResult(await service.getStatusCard(bookId), "共读状态卡已经显示；直接继续讨论书页。")
  );

  registerAppTool(
    server,
    "render_reading_end_card_v4",
    {
      title: "显示今天读到这里",
      description:
        "Render the isolated ‘今天读到这里’ card only from the snapshotId returned by record_reading_turn. Do not pass or invent render-time summary text. If the snapshot is missing or incomplete, the tool fails instead of mounting an empty card.",
      inputSchema: renderReadingEndCardInputSchema,
      outputSchema: renderReadingEndCardOutputSchema,
      annotations: readOnly,
      _meta: {
        ui: { resourceUri: READING_END_RESOURCE_URI },
        "openai/outputTemplate": READING_END_RESOURCE_URI,
        "openai/toolInvocation/invoking": "正在合上今天的书页…",
        "openai/toolInvocation/invoked": "今天读到这里"
      }
    },
    async (input) =>
      toolResult(
        await service.getEndCard(input),
        "收尾卡已经显示；不要在卡片外机械复述统计。"
      )
  );
}
