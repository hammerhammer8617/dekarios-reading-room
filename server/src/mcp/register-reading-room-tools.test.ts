import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerAppTool } = vi.hoisted(() => ({ registerAppTool: vi.fn() }));
vi.mock("@modelcontextprotocol/ext-apps/server", () => ({ registerAppTool }));

import { READING_NEST_URI } from "./register-tools.js";
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
      "render_reading_end_card"
    ]);
    for (const [, , descriptor] of registerAppTool.mock.calls) {
      expect(descriptor._meta.ui.resourceUri).toBe(READING_NEST_URI);
    }
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
      ([, name]) => name === "render_reading_end_card"
    )?.[2];
    expect(endCardDescriptor.description).toContain("bare page number is not enough");
    expect(endCardDescriptor.description).toContain("Tav's latest thought");
  });
});
