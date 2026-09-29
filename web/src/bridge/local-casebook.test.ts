import { beforeEach, describe, expect, it } from "vitest";
import {
  LOCAL_CASEBOOK_STORAGE_KEY,
  callLocalCasebookTool,
  isLocalCasebookTool
} from "./local-casebook.js";

describe("standalone casebook preview", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates and reloads a browser-local case", async () => {
    const created = await callLocalCasebookTool("case_create", {
      title: "凶手就在聊天记录中",
      sourceType: "novel",
      sourceLabel: "珍妮丝·哈雷特｜The Appeal"
    });
    const investigationCase = created.structuredContent?.case as { id: string };

    const listed = await callLocalCasebookTool("case_list", {});
    expect(listed.structuredContent?.cases).toEqual([
      expect.objectContaining({
        id: investigationCase.id,
        title: "凶手就在聊天记录中",
        caseRevision: 0
      })
    ]);
    expect(window.localStorage.getItem(LOCAL_CASEBOOK_STORAGE_KEY)).toContain(
      "凶手就在聊天记录中"
    );
  });

  it("persists entries, entities, relations, hypotheses and observation tasks", async () => {
    const created = await callLocalCasebookTool("case_create", {
      title: "聊天记录案",
      sourceType: "novel"
    });
    const caseId = (created.structuredContent?.case as { id: string }).id;

    await callLocalCasebookTool("case_add_entries", {
      caseId,
      author: "tav",
      entries: [
        {
          kind: "observation",
          content: "同一件事出现了两个时间说法。",
          sourcePosition: "第一组邮件"
        }
      ]
    });
    const first = await callLocalCasebookTool("case_upsert_entity", {
      caseId,
      entityType: "person",
      name: "写信人 A",
      createdBy: "tav",
      status: "confirmed"
    });
    const second = await callLocalCasebookTool("case_upsert_entity", {
      caseId,
      entityType: "person",
      name: "收信人 B",
      createdBy: "tav",
      status: "suggested"
    });
    const firstId = (first.structuredContent?.entity as { id: string }).id;
    const secondId = (second.structuredContent?.entity as { id: string }).id;
    await callLocalCasebookTool("case_upsert_relation", {
      caseId,
      sourceEntityId: firstId,
      targetEntityId: secondId,
      relationType: "通信",
      createdBy: "tav",
      status: "confirmed"
    });
    await callLocalCasebookTool("case_upsert_hypothesis", {
      caseId,
      author: "tav",
      claim: "消息顺序可能比内容更重要。",
      status: "active"
    });
    await callLocalCasebookTool("case_upsert_observation_task", {
      caseId,
      instruction: "留意下一封邮件的抄送人。",
      createdBy: "gale",
      status: "open"
    });

    const loaded = await callLocalCasebookTool("case_get", { caseId });
    const bundle = loaded.structuredContent?.bundle as {
      case: { caseRevision: number };
      entries: unknown[];
      entities: unknown[];
      relations: unknown[];
      hypotheses: unknown[];
      observationTasks: unknown[];
    };
    expect(bundle.case.caseRevision).toBe(6);
    expect(bundle.entries).toHaveLength(1);
    expect(bundle.entities).toHaveLength(2);
    expect(bundle.relations).toHaveLength(1);
    expect(bundle.hypotheses).toHaveLength(1);
    expect(bundle.observationTasks).toHaveLength(1);
  });

  it("recognizes only the casebook tool family", () => {
    expect(isLocalCasebookTool("case_create")).toBe(true);
    expect(isLocalCasebookTool("open_bookshelf_v4")).toBe(false);
  });
});
