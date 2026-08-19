import { describe, expect, it } from "vitest";
import type { ReadingDatabase, RecordReadingTurnInput } from "@ss/shared";
import { AppError } from "../errors/app-error.js";
import type { ReadingRepository } from "../repositories/reading-repository.js";
import { ReadingRoomService } from "./reading-room-service.js";

class MemoryRepository implements ReadingRepository {
  database: ReadingDatabase = {
    schemaVersion: 7,
    sessions: [],
    quotes: [],
    reactions: [],
    bookmarks: [],
    companionComments: [],
    cases: [],
    caseEntries: [],
    caseEntities: [],
    caseRelations: [],
    caseHypotheses: [],
    caseObservationTasks: [],
    caseSyncOperations: [],
    thoughts: [],
    readingRoomCasebooks: [],
    readingEndSnapshots: []
  };

  async read() {
    return structuredClone(this.database);
  }

  async mutate<T>(change: (database: ReadingDatabase) => T | Promise<T>) {
    const result = await change(this.database);
    return structuredClone(result);
  }
}

function createService(repository = new MemoryRepository()) {
  let id = 0;
  return {
    repository,
    service: new ReadingRoomService(repository, {
      now: () => new Date("2026-08-19T12:00:00.000Z"),
      id: () => `id-${++id}`
    })
  };
}

describe("ReadingRoomService", () => {
  it("keeps simultaneous books separate and asks instead of guessing", async () => {
    const { service } = createService();
    await service.getOrStartBookContext({ title: "长夜难明", genre: "mystery", createIfMissing: true });
    await service.getOrStartBookContext({ title: "献给阿尔吉侬的花束", genre: "novel", createIfMissing: true });

    const ambiguous = await service.getOrStartBookContext({ createIfMissing: false });
    expect(ambiguous.needsSelection).toBe(true);
    if (ambiguous.needsSelection) {
      expect(ambiguous.reason).toBe("multiple_active_books");
      expect(ambiguous.candidates.map((book) => book.title)).toEqual([
        "长夜难明",
        "献给阿尔吉侬的花束"
      ]);
    }
  });

  it("records attributed thoughts, progress and a safe spoiler boundary idempotently", async () => {
    const { service, repository } = createService();
    const started = await service.getOrStartBookContext({
      title: "长夜难明",
      genre: "mystery",
      createIfMissing: true
    });
    if (started.needsSelection) throw new Error("unexpected selection");

    const input: RecordReadingTurnInput = {
      bookId: started.context.session.id,
      operationId: "turn-18",
      progress: {
        tav: { kind: "page" as const, index: 88, label: "第 88 页" },
        shared: { kind: "page" as const, index: 88, label: "第 88 页" },
        spoilerBoundary: { kind: "page" as const, index: 88, label: "第 88 页" }
      },
      thoughts: [
        { author: "tav" as const, kind: "prediction" as const, content: "真正的交换发生在证词之外。", status: "open" as const },
        { author: "gale" as const, kind: "interpretation" as const, content: "叙述节奏在替某个人遮掩时间。", status: "open" as const },
        { author: "shared" as const, kind: "question" as const, content: "缺失的十分钟是谁制造的？", status: "open" as const }
      ]
    };

    const first = await service.recordReadingTurn(input);
    const second = await service.recordReadingTurn(input);
    expect(first.createdThoughts).toHaveLength(3);
    expect(second.createdThoughts).toHaveLength(3);
    expect(repository.database.thoughts).toHaveLength(3);
    expect(second.openQuestionCount).toBe(1);
    expect(second.progress.tav.label).toBe("第 88 页");
  });

  it("persists one idempotent end snapshot and renders only that exact identity", async () => {
    const { service, repository } = createService();
    const started = await service.getOrStartBookContext({
      title: "长夜难明",
      genre: "mystery",
      createIfMissing: true
    });
    if (started.needsSelection) throw new Error("unexpected selection");
    const bookId = started.context.session.id;
    const input = {
      bookId,
      operationId: "turn-18",
      progress: {
        tav: { kind: "page", index: 88, label: "第 88 页" },
        shared: { kind: "page", index: 88, label: "第 88 页" }
      },
      thoughts: [
        { author: "tav", kind: "prediction", content: "真正的交换发生在证词之外。", status: "open" },
        { author: "gale", kind: "interpretation", content: "叙述节奏正在替某个人遮掩时间。", status: "open" },
        { author: "shared", kind: "question", content: "缺失的十分钟是谁制造的？", status: "open" }
      ],
      endSnapshot: {
        progressSummary: "读完时间证词，进入对缺失十分钟的追查。",
        readingSummary: "三份证词互相冲突，叙述中的时间断层浮到台前。"
      }
    };
    const first = await service.recordReadingTurn(input);
    const second = await service.recordReadingTurn({
      ...input,
      endSnapshot: {
        progressSummary: "这次重试不应改写原快照。",
        readingSummary: "这段新文案也不应进入快照。"
      }
    });

    expect(first.endSnapshot).toEqual(second.endSnapshot);
    expect(repository.database.readingEndSnapshots).toHaveLength(1);
    const card = await service.getEndCard({ snapshotId: first.endSnapshot!.id });

    expect(card).toMatchObject({
      view: "reading_end",
      snapshot: {
        progressSummary: "读完时间证词，进入对缺失十分钟的追查。",
        readingSummary: "三份证词互相冲突，叙述中的时间断层浮到台前。",
        tavThought: "真正的交换发生在证词之外。",
        galeThought: "叙述节奏正在替某个人遮掩时间。",
        openQuestion: "缺失的十分钟是谁制造的？",
        notionSyncStatus: "pending",
        thoughtCount: 3
      }
    });
  });

  it("omits absent optional sections and rejects bare-page or missing snapshots", async () => {
    const { service, repository } = createService();
    const started = await service.getOrStartBookContext({ title: "打怪", createIfMissing: true });
    if (started.needsSelection) throw new Error("unexpected selection");

    await expect(
      service.recordReadingTurn({
        bookId: started.context.session.id,
        operationId: "turn-bare-page",
        endSnapshot: {
          progressSummary: "第 19 页",
          readingSummary: "本次只读了塔芙提供的页面。"
        }
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });

    const recorded = await service.recordReadingTurn({
      bookId: started.context.session.id,
      operationId: "turn-19",
      progress: {
        tav: { kind: "page", index: 19, label: "第 19 页" },
        shared: { kind: "page", index: 19, label: "第 19 页" }
      },
      endSnapshot: {
        progressSummary: "读完“崇高的怪物性”，进入“受遏制的怪物性”。",
        readingSummary: "怪物从崇高的边界经验转向被社会秩序约束与命名的对象。"
      }
    });
    expect(recorded.endSnapshot).not.toHaveProperty("tavThought");
    expect(recorded.endSnapshot).not.toHaveProperty("galeThought");
    expect(recorded.endSnapshot).not.toHaveProperty("openQuestion");
    expect(recorded.endSnapshot?.notionSyncStatus).toBe("not_requested");

    await expect(service.getEndCard({ snapshotId: "missing" })).rejects.toBeInstanceOf(
      AppError
    );

    repository.database.readingEndSnapshots!.push({
      ...recorded.endSnapshot!,
      id: "corrupt",
      readingSummary: ""
    });
    await expect(service.getEndCard({ snapshotId: "corrupt" })).rejects.toMatchObject({
      code: "DATA_STORE_CORRUPTED"
    });
  });

  it("prepares Notion increments without claiming success, then marks exact thoughts", async () => {
    const { service } = createService();
    const started = await service.getOrStartBookContext({ title: "小径分岔的花园", createIfMissing: true });
    if (started.needsSelection) throw new Error("unexpected selection");
    const recorded = await service.recordReadingTurn({
      bookId: started.context.session.id,
      operationId: "turn-1",
      thoughts: [{ author: "tav", kind: "connection", content: "迷宫既是空间，也是阅读顺序。", status: "open" }],
      endSnapshot: {
        progressSummary: "把迷宫从空间推进到阅读顺序的隐喻。",
        readingSummary: "本次围绕迷宫与阅读次序的重合继续向前。"
      }
    });

    const prepared = await service.prepareNotionSync(started.context.session.id, 50);
    expect(prepared.notionPageTitle).toBe("《小径分岔的花园》｜书页边缘");
    expect(prepared.markdown).toContain("塔芙｜连接 · 仍保留");
    expect((await service.getBookContext(started.context.session.id)).unsyncedThoughtCount).toBe(1);

    await service.markNotionSynced(started.context.session.id, prepared.thoughtIds);
    expect((await service.getBookContext(started.context.session.id)).unsyncedThoughtCount).toBe(0);
    expect(
      (await service.getEndCard({ snapshotId: recorded.endSnapshot!.id })).snapshot
        .notionSyncStatus
    ).toBe("synced");
  });

  it("builds a spoiler-safe mystery casebook with people, relations and hypotheses", async () => {
    const { service } = createService();
    const started = await service.getOrStartBookContext({ title: "长夜难明", genre: "mystery", createIfMissing: true });
    if (started.needsSelection) throw new Error("unexpected selection");
    const bookId = started.context.session.id;

    const updated = await service.recordCasebookUpdate({
      bookId,
      operationId: "case-1",
      entities: [
        { name: "江阳", type: "person", status: "confirmed" },
        { name: "侯贵平", type: "person", status: "confirmed" }
      ],
      relations: [{ from: "江阳", to: "侯贵平", label: "追查旧案", status: "confirmed", evidence: ["当前书页的案卷"] }],
      clues: [{ content: "时间记录出现断层", status: "suspected", entityNames: ["江阳"] }],
      hypotheses: [{ title: "时间被人为切断", summary: "断层可能用来隐藏会面。", status: "active", confidence: 0.45 }],
      observationTasks: [{ prompt: "继续留意所有精确时间。", status: "open" }]
    });

    expect(updated.summary).toMatchObject({ entities: 2, relations: 1, clues: 1, activeHypotheses: 1 });
    const casebook = await service.getCasebook(bookId);
    expect(casebook.relations[0]?.label).toBe("追查旧案");
    expect(casebook.observationTasks[0]?.status).toBe("open");
  });
});
