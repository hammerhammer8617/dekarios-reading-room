import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReadingRoomEntry } from "./ReadingRoomEntry.js";

const host = vi.hoisted(() => ({
  listener: undefined as
    | ((result: { structuredContent?: Record<string, unknown> }) => void)
    | undefined
}));

vi.mock("./bridge/host.js", () => ({
  callTool: vi.fn(),
  initialToolResult: vi.fn(() => undefined),
  requestReaderInline: vi.fn().mockResolvedValue(true),
  subscribeToolResult: vi.fn(
    (listener: (result: { structuredContent?: Record<string, unknown> }) => void) => {
      host.listener = listener;
      return vi.fn();
    }
  )
}));

vi.mock("./components/ReadingRoomSurface.js", () => ({
  ReadingRoomSurface: ({ initialOutput }: { initialOutput: { view?: string } }) => (
    <main>新版界面：{initialOutput.view}</main>
  )
}));

vi.mock("./Boot.js", () => ({
  Boot: () => <main>旧版界面</main>
}));

vi.mock("./CasebookApp.js", () => ({
  CasebookApp: () => <main>案件簿</main>
}));

vi.mock("./features/book-import/EpubImportBridge.js", () => ({
  EpubImportBridge: () => null
}));

vi.mock("./features/book-import/EpubSmokeLab.js", () => ({
  EpubSmokeLab: () => <main>导入实验室</main>
}));

describe("ReadingRoomEntry", () => {
  it("switches to the new bookshelf when the opening tool result arrives after mount", () => {
    render(
      <ReadingRoomEntry
        smokeLabEnabled={false}
        casebookEnabled={false}
      />
    );

    expect(screen.getByText("正在打开书架")).toBeInTheDocument();
    expect(screen.queryByText("旧版界面")).not.toBeInTheDocument();

    act(() => {
      host.listener?.({
        structuredContent: {
          view: "bookshelf",
          bookshelf: []
        }
      });
    });

    expect(screen.getByText("新版界面：bookshelf")).toBeInTheDocument();
    expect(screen.queryByText("旧版界面")).not.toBeInTheDocument();
    expect(document.documentElement).toHaveClass("reading-room-document");
  });

  it("renders the new bookshelf immediately when output already exists", () => {
    render(
      <ReadingRoomEntry
        smokeLabEnabled={false}
        casebookEnabled={false}
        initialOutput={{ view: "bookshelf", bookshelf: [] }}
      />
    );

    expect(screen.getByText("新版界面：bookshelf")).toBeInTheDocument();
  });
});
