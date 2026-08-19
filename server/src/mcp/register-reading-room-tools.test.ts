import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerAppTool } = vi.hoisted(() => ({ registerAppTool: vi.fn() }));
vi.mock("@modelcontextprotocol/ext-apps/server", () => ({ registerAppTool }));

import { READING_NEST_URI } from "./register-tools.js";
import {
  BOOKSHELF_RESOURCE_URI,
  BOOKSHELF_TOOL_NAME,
  LEGACY_BOOKSHELF_TOOL_NAME,
  OLDEST_BOOKSHELF_RESOURCE_URI,
  OLDEST_BOOKSHELF_TOOL_NAME,
  PREVIOUS_BOOKSHELF_RESOURCE_URI,
  PREVIOUS_BOOKSHELF_TOOL_NAME,
  PREVIOUS_READING_END_TOOL_NAME,
  READING_END_RESOURCE_URI,
  READING_END_TOOL_NAME
} from "@ss/shared";
import { registerReadingRoomTools } from "./register-reading-room-tools.js";

describe("registerReadingRoomTools", () => {
  beforeEach(() => registerAppTool.mockClear());

  it("separates data tools from three UI surfaces and their compatibility entries", () => {
    const registerTool = vi.fn();
    registerReadingRoomTools({ registerTool } as never, {} as never);

    expect(registerTool.mock.calls.map(([name]) => name)).toEqual([
      "get_or_start_book_context",
      "record_reading_turn",
      "get_book_details",
      "prepare_notion_sync",
      "mark_notion_synced",
      "record_casebook_update",
      "get_casebook"
    ]);
    expect(registerAppTool.mock.calls.map(([, name]) => name)).toEqual([
      LEGACY_BOOKSHELF_TOOL_NAME,
      OLDEST_BOOKSHELF_TOOL_NAME,
      PREVIOUS_BOOKSHELF_TOOL_NAME,
      BOOKSHELF_TOOL_NAME,
      "render_reading_status",
      PREVIOUS_READING_END_TOOL_NAME,
      READING_END_TOOL_NAME
    ]);
    const legacyBookshelfDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === LEGACY_BOOKSHELF_TOOL_NAME
    )?.[2];
    expect(legacyBookshelfDescriptor._meta.ui.visibility).toEqual(["app"]);
    const oldestBookshelfDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === OLDEST_BOOKSHELF_TOOL_NAME
    )?.[2];
    expect(oldestBookshelfDescriptor._meta.ui).toEqual({
      resourceUri: OLDEST_BOOKSHELF_RESOURCE_URI,
      visibility: ["app"]
    });
    const previousBookshelfDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === PREVIOUS_BOOKSHELF_TOOL_NAME
    )?.[2];
    expect(previousBookshelfDescriptor._meta.ui).toEqual({
      resourceUri: PREVIOUS_BOOKSHELF_RESOURCE_URI,
      visibility: ["app"]
    });
    const bookshelfDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === BOOKSHELF_TOOL_NAME
    )?.[2];
    expect(bookshelfDescriptor._meta.ui.resourceUri).toBe(BOOKSHELF_RESOURCE_URI);
    expect(bookshelfDescriptor._meta.ui.visibility).toEqual(["model", "app"]);
    expect(bookshelfDescriptor._meta["openai/outputTemplate"]).toBe(BOOKSHELF_RESOURCE_URI);
    expect(bookshelfDescriptor.outputSchema).toBeDefined();
    const statusDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === "render_reading_status"
    )?.[2];
    expect(statusDescriptor._meta.ui.resourceUri).toBe(READING_NEST_URI);
    const endDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === READING_END_TOOL_NAME
    )?.[2];
    expect(endDescriptor._meta.ui.resourceUri).toBe(READING_END_RESOURCE_URI);
    expect(endDescriptor._meta.ui.visibility).toEqual(["model", "app"]);
    expect(endDescriptor._meta["openai/widgetAccessible"]).toBe(true);
    expect(endDescriptor.outputSchema).toBeDefined();
  });

  it("returns the exact bookshelf output bound to the isolated resource", async () => {
    const registerTool = vi.fn();
    const listBookshelf = vi.fn().mockResolvedValue([
      {
        bookId: "book-1",
        title: "侦破我的命案",
        genre: "mystery",
        status: "active",
        tavPosition: { kind: "page", index: 91, label: "第 91 页" },
        sharedPosition: null,
        spoilerBoundary: null,
        lastReadAt: "2026-08-19T12:00:00.000Z",
        lastNotionSyncedAt: null,
        openQuestionCount: 1,
        unsyncedThoughtCount: 0,
        casebookInProgress: true,
        casebookItemCount: 4
      }
    ]);
    registerReadingRoomTools({ registerTool } as never, { listBookshelf } as never);
    const [, , descriptor, handler] = registerAppTool.mock.calls.find(
      ([, name]) => name === BOOKSHELF_TOOL_NAME
    );

    const result = await handler();

    expect(descriptor._meta).toMatchObject({
      ui: { resourceUri: BOOKSHELF_RESOURCE_URI },
      "openai/outputTemplate": BOOKSHELF_RESOURCE_URI
    });
    expect(result.structuredContent).toEqual({
      view: "bookshelf",
      bookshelf: [expect.objectContaining({ bookId: "book-1", title: "侦破我的命案" })]
    });
    expect(listBookshelf).toHaveBeenCalledOnce();
  });

  it("documents automatic book-page triggers and explicit non-book exclusions", () => {
    const registerTool = vi.fn();
    registerReadingRoomTools({ registerTool } as never, {} as never);
    const contextDescriptor = registerTool.mock.calls.find(
      ([name]) => name === "get_or_start_book_context"
    )?.[1];
    const bookshelfDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === BOOKSHELF_TOOL_NAME
    )?.[2];

    expect(contextDescriptor.description).toContain("book-page photo");
    expect(contextDescriptor.description).toContain("work screenshots");
    expect(contextDescriptor.description).toContain("film frames");
    expect(bookshelfDescriptor.description).toContain("explicitly asks");
    expect(bookshelfDescriptor.description).toContain("Do not render it for each page photo");
    const endCardDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === READING_END_TOOL_NAME
    )?.[2];
    expect(endCardDescriptor.description).toContain("snapshotId");
    expect(endCardDescriptor.description).toContain("Do not pass or invent render-time summary text");
  });
});
