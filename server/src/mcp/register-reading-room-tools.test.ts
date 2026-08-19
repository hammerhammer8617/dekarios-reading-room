import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerAppTool } = vi.hoisted(() => ({ registerAppTool: vi.fn() }));
vi.mock("@modelcontextprotocol/ext-apps/server", () => ({ registerAppTool }));

import { READING_NEST_URI } from "./register-tools.js";
import { READING_END_RESOURCE_URI } from "@ss/shared";
import { registerReadingRoomTools } from "./register-reading-room-tools.js";

describe("registerReadingRoomTools", () => {
  beforeEach(() => registerAppTool.mockClear());

  it("separates data tools from the three deliberate UI surfaces", () => {
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
      "open_bookshelf",
      "render_reading_status",
      "render_reading_end_card_v3"
    ]);
    expect(registerAppTool.mock.calls[0]?.[2]._meta.ui.resourceUri).toBe(READING_NEST_URI);
    expect(registerAppTool.mock.calls[1]?.[2]._meta.ui.resourceUri).toBe(READING_NEST_URI);
    const endDescriptor = registerAppTool.mock.calls[2]?.[2];
    expect(endDescriptor._meta.ui.resourceUri).toBe(READING_END_RESOURCE_URI);
    expect(endDescriptor.outputSchema).toBeDefined();
  });

  it("documents automatic book-page triggers and explicit non-book exclusions", () => {
    const registerTool = vi.fn();
    registerReadingRoomTools({ registerTool } as never, {} as never);
    const contextDescriptor = registerTool.mock.calls.find(
      ([name]) => name === "get_or_start_book_context"
    )?.[1];
    const bookshelfDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === "open_bookshelf"
    )?.[2];

    expect(contextDescriptor.description).toContain("book-page photo");
    expect(contextDescriptor.description).toContain("work screenshots");
    expect(contextDescriptor.description).toContain("film frames");
    expect(bookshelfDescriptor.description).toContain("explicitly asks");
    expect(bookshelfDescriptor.description).toContain("Do not render it for each page photo");
    const endCardDescriptor = registerAppTool.mock.calls.find(
      ([, name]) => name === "render_reading_end_card_v3"
    )?.[2];
    expect(endCardDescriptor.description).toContain("snapshotId");
    expect(endCardDescriptor.description).toContain("Do not pass or invent render-time summary text");
  });
});
