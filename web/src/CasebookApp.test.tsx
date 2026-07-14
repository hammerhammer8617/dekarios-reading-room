import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CasebookApp, detectQuickEntryKind } from "./CasebookApp.js";
import { callTool } from "./bridge/host.js";

vi.mock("./bridge/host.js", () => ({
  askChatGpt: vi.fn().mockResolvedValue(undefined),
  callTool: vi.fn(),
  initialToolOutput: vi.fn(() => ({
    appView: "casebook",
    cases: [
      {
        id: "case-1",
        title: "温室失窃案",
        sourceType: "novel",
        status: "active",
        caseRevision: 1,
        assistantSyncedRevision: 0,
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z"
      }
    ]
  })),
  requestReaderFullscreen: vi.fn().mockResolvedValue(true),
  updateModelContext: vi.fn().mockResolvedValue(true)
}));

const bundle = {
  case: {
    id: "case-1",
    title: "温室失窃案",
    sourceType: "novel",
    status: "active",
    caseRevision: 1,
    assistantSyncedRevision: 0,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  },
  entries: [],
  entities: [],
  relations: [],
  hypotheses: []
};

describe("CasebookApp", () => {
  beforeEach(() => {
    vi.mocked(callTool).mockReset();
    vi.mocked(callTool).mockImplementation(async (name) => {
      if (name === "case_get") return { structuredContent: { bundle } };
      if (name === "case_list") {
        return { structuredContent: { cases: [bundle.case] } };
      }
      return { structuredContent: {} };
    });
  });

  it("opens on the case list and can return there after viewing a case", async () => {
    render(<CasebookApp />);

    expect(screen.getByText("德卡里奥斯家的案件簿")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /温室失窃案/ }));
    expect(await screen.findByText("案情记录")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /案件列表/ }));
    expect(screen.getByText("德卡里奥斯家的案件簿")).toBeInTheDocument();
  });

  it("saves Tav's wording as a structured case entry", async () => {
    render(<CasebookApp />);
    fireEvent.click(screen.getByRole("button", { name: /温室失窃案/ }));
    await screen.findByText("案情记录");

    fireEvent.change(screen.getByLabelText("记录一条案情"), {
      target: { value: "窗台上有新鲜泥土。" }
    });
    fireEvent.change(screen.getByLabelText("案情类型"), {
      target: { value: "evidence" }
    });
    fireEvent.click(screen.getByRole("button", { name: "只保存" }));

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("case_add_entry", {
        caseId: "case-1",
        author: "tav",
        kind: "evidence",
        content: "窗台上有新鲜泥土。"
      });
    });
  });

  it.each([
    ["事实：钟在十点十七分停了。", "observation"],
    ["证词: 管家说自己没有离开厨房。", "claim"],
    ["物证：壁炉里有一枚烧焦的纽扣。", "evidence"],
    ["我注意到：书房的窗户是从里面锁上的。", "observation"],
    ["我觉得：停电不是意外。", "hypothesis"],
    ["问盖尔：谁有机会碰到配电箱？", "question"]
  ] as const)("recognizes quick entry syntax in %s", (content, expected) => {
    expect(detectQuickEntryKind(content)).toBe(expected);
  });

  it("classifies quick syntax while preserving Tav's complete wording", async () => {
    render(<CasebookApp />);
    fireEvent.click(screen.getByRole("button", { name: /温室失窃案/ }));
    await screen.findByText("案情记录");

    const content = "证词：园丁说九点后没有进入温室。";
    fireEvent.change(screen.getByLabelText("记录一条案情"), {
      target: { value: content }
    });

    expect(screen.getByText("将保存为「证词」；原文不会改写。")).toBeInTheDocument();
    expect(screen.getByLabelText("案情类型")).toHaveValue("claim");
    fireEvent.click(screen.getByRole("button", { name: "只保存" }));

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("case_add_entry", {
        caseId: "case-1",
        author: "tav",
        kind: "claim",
        content
      });
    });
  });

  it("returns from the casebook home to the reading room", async () => {
    const onBackToReading = vi.fn().mockResolvedValue(undefined);
    render(<CasebookApp onBackToReading={onBackToReading} />);

    fireEvent.click(screen.getByRole("button", { name: "返回书房" }));
    await waitFor(() => expect(onBackToReading).toHaveBeenCalledTimes(1));
  });
});
