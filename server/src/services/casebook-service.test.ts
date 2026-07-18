import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { CaseObservationTask } from "@ss/shared";
import { JsonReadingRepository } from "../repositories/json-reading-repository.js";
import { CasebookService } from "./casebook-service.js";

describe("CasebookService", () => {
  let service: CasebookService;
  let ids: number;

  beforeEach(async () => {
    const directory = await mkdtemp(join(tmpdir(), "ss-casebook-"));
    ids = 0;
    service = new CasebookService(
      new JsonReadingRepository(join(directory, "reading.json")),
      {
        now: () => new Date("2026-07-14T19:00:00.000Z"),
        id: () => `casebook-${++ids}`
      }
    );
  });

  it("creates a private case and preserves Tav's clue wording", async () => {
    const investigationCase = await service.createCase({
      title: "高尔夫球场命案",
      sourceType: "novel",
      sourceLabel: "阿加莎·克里斯蒂"
    });
    const result = await service.addEntry({
      caseId: investigationCase.id,
      author: "tav",
      kind: "observation",
      content: "  杰克说自己穿过火焰是为了保护她。  ",
      sourcePosition: "第七章"
    });
    const bundle = await service.getCaseBundle(investigationCase.id);

    expect(investigationCase).toMatchObject({
      caseRevision: 0,
      assistantSyncedRevision: 0,
      status: "active"
    });
    expect(result.entry.content).toBe("杰克说自己穿过火焰是为了保护她。");
    expect(bundle.entries).toEqual([result.entry]);
    expect(bundle.case.caseRevision).toBe(1);
  });

  it("atomically saves a confirmed clue batch in one case revision", async () => {
    const investigationCase = await service.createCase({
      title: "钟楼晚宴",
      sourceType: "video_game"
    });
    const result = await service.addEntries({
      caseId: investigationCase.id,
      author: "tav",
      entries: [
        { kind: "observation", content: "事实：钟在十点停了。" },
        { kind: "claim", content: "证词：管家说自己一直在厨房。" },
        { kind: "question", content: "问盖尔：谁能碰到钟楼钥匙？" }
      ]
    });

    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => entry.createdRevision)).toEqual([1, 1, 1]);
    expect(result.case.caseRevision).toBe(1);
    expect((await service.getCaseBundle(investigationCase.id)).entries).toEqual(
      result.entries
    );
  });

  it("keeps Gale-created graph material suggested until Tav confirms it", async () => {
    const investigationCase = await service.createCase({
      title: "温室失窃案",
      sourceType: "video_game"
    });
    const galeNode = await service.upsertEntity({
      caseId: investigationCase.id,
      entityType: "person",
      name: "园丁",
      createdBy: "gale"
    });
    const tavNode = await service.upsertEntity({
      caseId: investigationCase.id,
      entityType: "object",
      name: "银钥匙",
      createdBy: "tav"
    });
    const relation = await service.upsertRelation({
      caseId: investigationCase.id,
      sourceEntityId: galeNode.entity.id,
      targetEntityId: tavNode.entity.id,
      relationType: "可能持有",
      createdBy: "gale"
    });

    expect(galeNode.entity.status).toBe("suggested");
    expect(tavNode.entity.status).toBe("confirmed");
    expect(relation.relation.status).toBe("suggested");

    const confirmed = await service.upsertRelation({
      caseId: investigationCase.id,
      relationId: relation.relation.id,
      sourceEntityId: galeNode.entity.id,
      targetEntityId: tavNode.entity.id,
      relationType: relation.relation.relationType,
      createdBy: "gale",
      status: "confirmed"
    });
    expect(confirmed.relation.status).toBe("confirmed");
  });

  it("does not advance Gale's revision until the prepared sync is confirmed", async () => {
    const investigationCase = await service.createCase({
      title: "列车上的不在场证明",
      sourceType: "tabletop"
    });
    await service.addEntry({
      caseId: investigationCase.id,
      author: "tav",
      kind: "claim",
      content: "乘务员声称十一点后没有人离开车厢。"
    });

    const prepared = await service.prepareSync(investigationCase.id);
    const preparedAgain = await service.prepareSync(investigationCase.id);
    const beforeConfirmation = await service.getCaseBundle(investigationCase.id);

    expect(prepared.context.entries).toHaveLength(1);
    expect(preparedAgain.operation.operationId).toBe(prepared.operation.operationId);
    expect(beforeConfirmation.case.assistantSyncedRevision).toBe(0);

    const confirmed = await service.confirmSync(
      investigationCase.id,
      prepared.operation.operationId
    );
    const confirmedAgain = await service.confirmSync(
      investigationCase.id,
      prepared.operation.operationId
    );

    expect(confirmed.case.assistantSyncedRevision).toBe(1);
    expect(confirmedAgain.case.assistantSyncedRevision).toBe(1);

    await service.addEntry({
      caseId: investigationCase.id,
      author: "tav",
      kind: "evidence",
      content: "餐车门锁上留有新鲜划痕。"
    });
    const delta = await service.prepareSync(investigationCase.id);
    expect(delta.operation).toMatchObject({ fromRevision: 1, toRevision: 2 });
    expect(delta.context.entries.map((entry) => entry.content)).toEqual([
      "餐车门锁上留有新鲜划痕。"
    ]);
  });

  it("persists graph coordinates without losing the rest of the case", async () => {
    const investigationCase = await service.createCase({
      title: "庄园平面图",
      sourceType: "novel"
    });
    const created = await service.upsertEntity({
      caseId: investigationCase.id,
      entityType: "place",
      name: "书房",
      description: "二楼东侧",
      createdBy: "tav"
    });
    await service.upsertEntity({
      caseId: investigationCase.id,
      entityId: created.entity.id,
      entityType: created.entity.entityType,
      name: created.entity.name,
      description: created.entity.description,
      status: created.entity.status,
      createdBy: created.entity.createdBy,
      x: 216,
      y: 144
    });

    const bundle = await service.getCaseBundle(investigationCase.id);
    expect(bundle.entities[0]).toMatchObject({
      name: "书房",
      description: "二楼东侧",
      x: 216,
      y: 144
    });
    expect(bundle.case.caseRevision).toBe(1);
  });

  it("lets Gale leave at most three observation tasks without creating a false sync delta", async () => {
    const investigationCase = await service.createCase({
      title: "庄园外勤",
      sourceType: "tabletop"
    });
    const instructions = [
      "确认门锁从哪一侧损坏。",
      "询问女仆最后一次见到钥匙的时间。",
      "检查泥印是否延伸到温室外。"
    ];
    const tasks: CaseObservationTask[] = [];
    for (const instruction of instructions) {
      tasks.push(
        (await service.upsertObservationTask({
          caseId: investigationCase.id,
          instruction,
          createdBy: "gale",
          status: "open"
        })).task
      );
    }
    const beforeCompletion = await service.getCaseBundle(investigationCase.id);
    expect(beforeCompletion.observationTasks).toEqual(tasks);
    expect(beforeCompletion.case.caseRevision).toBe(0);

    await expect(
      service.upsertObservationTask({
        caseId: investigationCase.id,
        instruction: "再查一条。",
        createdBy: "gale",
        status: "open"
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });

    const completed = await service.upsertObservationTask({
      caseId: investigationCase.id,
      taskId: tasks[0].id,
      instruction: tasks[0].instruction,
      createdBy: "gale",
      status: "completed"
    });
    expect(completed.case.caseRevision).toBe(1);
    expect(completed.task.status).toBe("completed");

    await service.upsertObservationTask({
      caseId: investigationCase.id,
      instruction: "确认钟楼钥匙是否有复制品。",
      createdBy: "gale",
      status: "open"
    });
    await expect(
      service.upsertObservationTask({
        caseId: investigationCase.id,
        taskId: tasks[0].id,
        instruction: tasks[0].instruction,
        createdBy: "gale",
        status: "open"
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });
  });

  it("runs a seven-clue micro-case through the shared reasoning loop", async () => {
    const investigationCase = await service.createCase({
      title: "停电后的蓝宝石",
      sourceType: "other",
      sourceLabel: "原创试玩案"
    });
    const clues = [
      ["observation", "事实：停电发生在十点整。"],
      ["claim", "证词：管家说停电时自己一直在厨房。"],
      ["evidence", "物证：配电箱旁有半枚蓝色蜡封。"],
      ["observation", "我注意到：展示柜没有被撬开的痕迹。"],
      ["claim", "证词：收藏家声称只有自己有展示柜钥匙。"],
      ["evidence", "物证：管家的袖口沾着蓝色蜡屑。"],
      ["question", "问盖尔：蜡屑能否证明管家碰过配电箱？"]
    ] as const;
    for (const [kind, content] of clues) {
      await service.addEntry({
        caseId: investigationCase.id,
        author: "tav",
        kind,
        content
      });
    }
    const butler = await service.upsertEntity({
      caseId: investigationCase.id,
      entityType: "person",
      name: "管家",
      createdBy: "tav"
    });
    const fuseBox = await service.upsertEntity({
      caseId: investigationCase.id,
      entityType: "object",
      name: "配电箱",
      createdBy: "tav"
    });
    const suggestedRelation = await service.upsertRelation({
      caseId: investigationCase.id,
      sourceEntityId: butler.entity.id,
      targetEntityId: fuseBox.entity.id,
      relationType: "可能接触过",
      createdBy: "gale"
    });
    await service.upsertHypothesis({
      caseId: investigationCase.id,
      author: "joint",
      claim: "停电可能是为了掩护使用真钥匙打开展示柜。",
      confidence: 55
    });

    const prepared = await service.prepareSync(investigationCase.id);
    const bundle = await service.getCaseBundle(investigationCase.id);

    expect(bundle.entries).toHaveLength(7);
    expect(bundle.hypotheses).toHaveLength(1);
    expect(suggestedRelation.relation.status).toBe("suggested");
    expect(prepared.context.entries.map((entry) => entry.content)).toEqual(
      clues.map(([, content]) => content)
    );
    expect(prepared.context.rules).toContain(
      "Keep observations, testimony, evidence, and hypotheses distinct."
    );
  });
});
