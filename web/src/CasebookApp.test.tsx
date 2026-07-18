import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CasebookApp,
  detectQuickEntryKind,
  parseQuickEntries
} from "./CasebookApp.js";
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
  hypotheses: [],
  observationTasks: []
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
    fireEvent.click(screen.getByRole("button", { name: "检查后保存" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存 1 条" }));

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("case_add_entries", {
        caseId: "case-1",
        author: "tav",
        entries: [{ kind: "evidence", content: "窗台上有新鲜泥土。" }]
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

  it("splits prefixed lines while keeping continuation text with its entry", () => {
    expect(
      parseQuickEntries(
        "事实：钟在十点停了。\n这是大厅的钟。\n证词：管家说自己在厨房。\n问盖尔：先查什么？"
      )
    ).toEqual([
      { kind: "observation", content: "事实：钟在十点停了。\n这是大厅的钟。" },
      { kind: "claim", content: "证词：管家说自己在厨房。" },
      { kind: "question", content: "问盖尔：先查什么？" }
    ]);
  });

  it("classifies quick syntax while preserving Tav's complete wording", async () => {
    render(<CasebookApp />);
    fireEvent.click(screen.getByRole("button", { name: /温室失窃案/ }));
    await screen.findByText("案情记录");

    const content = "证词：园丁说九点后没有进入温室。";
    fireEvent.change(screen.getByLabelText("记录一条案情"), {
      target: { value: content }
    });

    expect(screen.getByText("将保存为「证词」；下一步仍可修改。")).toBeInTheDocument();
    expect(screen.getByLabelText("案情类型")).toHaveValue("claim");
    fireEvent.click(screen.getByRole("button", { name: "检查后保存" }));
    expect(screen.getByText("提交前确认")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认保存 1 条" }));

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("case_add_entries", {
        caseId: "case-1",
        author: "tav",
        entries: [{ kind: "claim", content }]
      });
    });
  });

  it("reviews and atomically saves a multi-entry batch", async () => {
    render(<CasebookApp />);
    fireEvent.click(screen.getByRole("button", { name: /温室失窃案/ }));
    await screen.findByText("案情记录");

    fireEvent.change(screen.getByLabelText("记录一条案情"), {
      target: {
        value: "事实：九点停电。\n证词：园丁说自己在门外。\n我觉得：有人提前拿走了钥匙。"
      }
    });
    expect(screen.getByText("已识别 3 条案情；下一步可以逐条确认。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "检查后保存" }));
    fireEvent.change(screen.getByLabelText("案情 3 类型"), {
      target: { value: "question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认保存 3 条" }));

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("case_add_entries", {
        caseId: "case-1",
        author: "tav",
        entries: [
          { kind: "observation", content: "事实：九点停电。" },
          { kind: "claim", content: "证词：园丁说自己在门外。" },
          { kind: "question", content: "我觉得：有人提前拿走了钥匙。" }
        ]
      });
    });
  });

  it("lets Tav bring back Gale's observation task", async () => {
    const taskBundle = {
      ...bundle,
      observationTasks: [
        {
          id: "task-1",
          caseId: "case-1",
          instruction: "确认温室门锁是从内侧还是外侧损坏。",
          createdBy: "gale",
          status: "open",
          createdRevision: 1,
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z"
        }
      ]
    };
    vi.mocked(callTool).mockImplementation(async (name) => {
      if (name === "case_get") return { structuredContent: { bundle: taskBundle } };
      if (name === "case_list") return { structuredContent: { cases: [bundle.case] } };
      return { structuredContent: {} };
    });
    render(<CasebookApp />);
    fireEvent.click(screen.getByRole("button", { name: /温室失窃案/ }));
    expect(await screen.findByText("确认温室门锁是从内侧还是外侧损坏。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "带回情报" }));

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("case_upsert_observation_task", {
        caseId: "case-1",
        taskId: "task-1",
        instruction: "确认温室门锁是从内侧还是外侧损坏。",
        createdBy: "gale",
        status: "completed"
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
