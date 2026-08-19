import { randomUUID } from "node:crypto";
import { DEFAULT_SESSION_PREFERENCES } from "@ss/shared";
import type {
  BookContext,
  BookGenre,
  DurableThought,
  GetOrStartBookContextInput,
  MysteryReadingCasebook,
  ReadingDatabase,
  ReadingPosition,
  ReadingSession,
  ReadingRoomCaseEntity,
  RecordCasebookUpdateInput,
  RecordReadingTurnInput,
  RenderReadingEndCardInput,
  ThoughtAuthor
} from "@ss/shared";
import { AppError } from "../errors/app-error.js";
import type { ReadingRepository } from "../repositories/reading-repository.js";

type Dependencies = {
  now: () => Date;
  id: () => string;
};

const defaultDependencies: Dependencies = {
  now: () => new Date(),
  id: () => randomUUID()
};

export class ReadingRoomService {
  constructor(
    private readonly repository: ReadingRepository,
    private readonly deps: Dependencies = defaultDependencies
  ) {}

  async getOrStartBookContext(input: GetOrStartBookContextInput) {
    const result = await this.repository.mutate((database) => {
      const candidates = this.sortSessions(database.sessions.filter((session) => session.status === "active"));
      let session = input.bookId
        ? database.sessions.find((item) => item.id === input.bookId)
        : input.title
          ? database.sessions.find((item) => normalizeTitle(item.title) === normalizeTitle(input.title!))
          : candidates.length === 1
            ? candidates[0]
            : undefined;

      if (!session && !input.title) {
        return {
          needsSelection: true as const,
          reason: candidates.length > 1 ? "multiple_active_books" : "book_not_identified",
          candidates: candidates.map((item) => this.summarizeSession(item))
        };
      }
      if (!session && input.createIfMissing === false) {
        return {
          needsSelection: true as const,
          reason: "book_not_found",
          candidates: candidates.map((item) => this.summarizeSession(item))
        };
      }
      if (!session) {
        session = this.createSession(input.title!, input.genre ?? "novel", input.author);
        database.sessions.push(session);
      }

      const now = this.deps.now().toISOString();
      if (input.author) session.author = input.author;
      if (input.genre) session.genre = input.genre;
      if (input.currentPosition) session.userCurrentPosition = structuredClone(input.currentPosition);
      if (input.sharedPosition) session.assistantSyncedPosition = structuredClone(input.sharedPosition);
      if (input.spoilerBoundary) session.spoilerBoundary = structuredClone(input.spoilerBoundary);
      this.assertProgressBoundary(session);
      session.status = "active";
      session.updatedAt = now;
      session.lastReadAt = now;
      delete session.completedAt;
      return { needsSelection: false as const, bookId: session.id };
    });

    if (result.needsSelection) return result;
    return {
      needsSelection: false as const,
      context: await this.getBookContext(result.bookId)
    };
  }

  async recordReadingTurn(input: RecordReadingTurnInput) {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database, input.bookId);
      const alreadyRecorded = database.thoughts.filter(
        (thought) => thought.sessionId === input.bookId && thought.operationId === input.operationId
      );
      const now = this.deps.now().toISOString();

      if (input.progress?.tav) session.userCurrentPosition = structuredClone(input.progress.tav);
      if (input.progress?.shared) session.assistantSyncedPosition = structuredClone(input.progress.shared);
      if (input.progress?.spoilerBoundary) {
        session.spoilerBoundary = structuredClone(input.progress.spoilerBoundary);
      }
      this.assertProgressBoundary(session);

      const created: DurableThought[] = [];
      if (alreadyRecorded.length === 0) {
        for (const draft of input.thoughts) {
          if (draft.relatedThoughtId) {
            const related = database.thoughts.find(
              (thought) => thought.id === draft.relatedThoughtId && thought.sessionId === input.bookId
            );
            if (!related) throw new AppError("INVALID_OPERATION", "找不到要修正的旧思考。");
            if (draft.status !== "open") {
              related.status = draft.status;
              related.updatedAt = now;
            }
          }
          const thought: DurableThought = {
            id: this.deps.id(),
            sessionId: input.bookId,
            author: draft.author,
            kind: draft.kind,
            content: draft.content,
            ...(draft.position ? { position: structuredClone(draft.position) } : {}),
            status: draft.status,
            ...(draft.relatedThoughtId ? { relatedThoughtId: draft.relatedThoughtId } : {}),
            operationId: input.operationId,
            createdAt: now,
            updatedAt: now
          };
          database.thoughts.push(thought);
          created.push(thought);
        }
      }

      session.status = "active";
      session.updatedAt = now;
      session.lastReadAt = now;
      delete session.completedAt;
      return {
        bookId: session.id,
        operationId: input.operationId,
        progress: this.progressSnapshot(session),
        createdThoughts: structuredClone(created.length > 0 ? created : alreadyRecorded),
        openQuestionCount: database.thoughts.filter(
          (thought) =>
            thought.sessionId === session.id &&
            thought.kind === "question" &&
            thought.status === "open"
        ).length,
        unsyncedThoughtCount: database.thoughts.filter(
          (thought) => thought.sessionId === session.id && !thought.notionSyncedAt
        ).length
      };
    });
  }

  async listBookshelf() {
    const database = await this.repository.read();
    return this.sortSessions(database.sessions).map((session) => {
      const thoughts = this.sortThoughts(
        database.thoughts.filter((thought) => thought.sessionId === session.id)
      );
      const casebook = database.readingRoomCasebooks.find(
        (item) => item.sessionId === session.id
      );
      return {
        ...this.summarizeSession(session),
        latestThought: thoughts[0],
        openQuestionCount: thoughts.filter(
          (thought) => thought.kind === "question" && thought.status === "open"
        ).length,
        unsyncedThoughtCount: thoughts.filter((thought) => !thought.notionSyncedAt).length,
        casebookInProgress: !!casebook && this.casebookItemCount(casebook) > 0,
        casebookItemCount: casebook ? this.casebookItemCount(casebook) : 0
      };
    });
  }

  async getBookContext(bookId: string): Promise<BookContext> {
    const database = await this.repository.read();
    const session = this.requireSession(database, bookId);
    const thoughts = this.sortThoughts(
      database.thoughts.filter((thought) => thought.sessionId === bookId)
    );
    const casebook = database.readingRoomCasebooks.find((item) => item.sessionId === bookId);
    return {
      session: structuredClone(session),
      recentThoughts: structuredClone(thoughts.slice(0, 12)),
      openQuestions: structuredClone(
        thoughts.filter((thought) => thought.kind === "question" && thought.status === "open")
      ),
      unsyncedThoughtCount: thoughts.filter((thought) => !thought.notionSyncedAt).length,
      ...(casebook ? { casebook: structuredClone(casebook) } : {})
    };
  }

  async getBookDetails(bookId: string) {
    const database = await this.repository.read();
    const context = await this.getBookContext(bookId);
    return {
      ...context,
      thoughts: this.sortThoughts(
        database.thoughts.filter((thought) => thought.sessionId === bookId)
      ),
      quotes: database.quotes.filter((quote) => quote.sessionId === bookId),
      bookmarks: database.bookmarks.filter((bookmark) => bookmark.sessionId === bookId)
    };
  }

  async prepareNotionSync(bookId: string, limit: number) {
    const database = await this.repository.read();
    const session = this.requireSession(database, bookId);
    const thoughts = database.thoughts
      .filter((thought) => thought.sessionId === bookId && !thought.notionSyncedAt)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit);
    const authorLabel: Record<ThoughtAuthor, string> = {
      tav: "塔芙",
      gale: "盖尔",
      shared: "共同"
    };
    const kindLabel: Record<DurableThought["kind"], string> = {
      reaction: "反应",
      interpretation: "解释",
      disagreement: "分歧",
      question: "问题",
      prediction: "预测",
      connection: "连接",
      clue: "线索"
    };
    const statusLabel: Record<DurableThought["status"], string> = {
      open: "仍保留",
      revised: "已修正",
      resolved: "已回答",
      rejected: "已推翻"
    };
    const markdown = thoughts
      .map((thought) => {
        const position = thought.position ? ` · ${thought.position.label}` : "";
        return `- **${authorLabel[thought.author]}｜${kindLabel[thought.kind]} · ${statusLabel[thought.status]}${position}**：${thought.content}`;
      })
      .join("\n");
    return {
      bookId,
      title: session.title,
      notionPageTitle: `《${session.title}》｜书页边缘`,
      thoughtIds: thoughts.map((thought) => thought.id),
      thoughtCount: thoughts.length,
      markdown,
      hasMore: database.thoughts.some(
        (thought) =>
          thought.sessionId === bookId &&
          !thought.notionSyncedAt &&
          !thoughts.some((selected) => selected.id === thought.id)
      )
    };
  }

  async markNotionSynced(bookId: string, thoughtIds: string[], syncedAt?: string) {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database, bookId);
      const timestamp = syncedAt ?? this.deps.now().toISOString();
      const ids = new Set(thoughtIds);
      let marked = 0;
      for (const thought of database.thoughts) {
        if (thought.sessionId !== bookId || !ids.has(thought.id)) continue;
        thought.notionSyncedAt = timestamp;
        thought.updatedAt = timestamp;
        marked += 1;
      }
      session.lastNotionSyncedAt = timestamp;
      session.updatedAt = timestamp;
      return { bookId, marked, syncedAt: timestamp };
    });
  }

  async recordCasebookUpdate(input: RecordCasebookUpdateInput) {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database, input.bookId);
      if (session.genre !== "mystery") session.genre = "mystery";
      const now = this.deps.now().toISOString();
      const casebook = this.ensureCasebook(database, input.bookId, now);

      for (const draft of input.entities ?? []) {
        const existing = this.findEntity(casebook, draft.name);
        if (existing) {
          existing.type = draft.type;
          existing.aliases = unique([...(existing.aliases ?? []), ...(draft.aliases ?? [])]);
          if (draft.description) existing.description = draft.description;
          if (draft.firstSeenPosition) existing.firstSeenPosition = structuredClone(draft.firstSeenPosition);
          existing.status = draft.status;
          existing.updatedAt = now;
        } else {
          casebook.entities.push({
            id: this.deps.id(),
            name: draft.name,
            type: draft.type,
            aliases: unique(draft.aliases ?? []),
            ...(draft.description ? { description: draft.description } : {}),
            ...(draft.firstSeenPosition
              ? { firstSeenPosition: structuredClone(draft.firstSeenPosition) }
              : {}),
            status: draft.status,
            updatedAt: now
          });
        }
      }

      for (const draft of input.relations ?? []) {
        const from = this.requireEntity(casebook, draft.from);
        const to = this.requireEntity(casebook, draft.to);
        const existing = casebook.relations.find(
          (item) =>
            item.fromEntityId === from.id &&
            item.toEntityId === to.id &&
            normalizeText(item.label) === normalizeText(draft.label)
        );
        if (existing) {
          existing.status = draft.status;
          existing.evidence = unique([...(existing.evidence ?? []), ...(draft.evidence ?? [])]);
          existing.updatedAt = now;
        } else {
          casebook.relations.push({
            id: this.deps.id(),
            fromEntityId: from.id,
            toEntityId: to.id,
            label: draft.label,
            status: draft.status,
            evidence: unique(draft.evidence ?? []),
            updatedAt: now
          });
        }
      }

      for (const [index, draft] of (input.clues ?? []).entries()) {
        const operationId = `${input.operationId}:clue:${index}`;
        if (casebook.clues.some((item) => item.operationId === operationId)) continue;
        casebook.clues.push({
          id: this.deps.id(),
          content: draft.content,
          ...(draft.position ? { position: structuredClone(draft.position) } : {}),
          entityIds: (draft.entityNames ?? []).map((name) => this.requireEntity(casebook, name).id),
          status: draft.status,
          operationId,
          createdAt: now,
          updatedAt: now
        });
      }

      for (const [index, draft] of (input.hypotheses ?? []).entries()) {
        const existing = casebook.hypotheses.find(
          (item) => normalizeText(item.title) === normalizeText(draft.title)
        );
        if (existing) {
          existing.summary = draft.summary;
          existing.status = draft.status;
          if (draft.confidence !== undefined) existing.confidence = draft.confidence;
          existing.evidenceFor = unique(draft.evidenceFor ?? existing.evidenceFor);
          existing.evidenceAgainst = unique(draft.evidenceAgainst ?? existing.evidenceAgainst);
          existing.updatedAt = now;
        } else {
          casebook.hypotheses.push({
            id: this.deps.id(),
            title: draft.title,
            summary: draft.summary,
            status: draft.status,
            ...(draft.confidence !== undefined ? { confidence: draft.confidence } : {}),
            evidenceFor: unique(draft.evidenceFor ?? []),
            evidenceAgainst: unique(draft.evidenceAgainst ?? []),
            operationId: `${input.operationId}:hypothesis:${index}`,
            createdAt: now,
            updatedAt: now
          });
        }
      }

      for (const [index, draft] of (input.timeline ?? []).entries()) {
        const existing = casebook.timeline.find(
          (item) =>
            normalizeText(item.label) === normalizeText(draft.label) &&
            normalizeText(item.whenText) === normalizeText(draft.whenText)
        );
        const entityIds = (draft.entityNames ?? []).map((name) => this.requireEntity(casebook, name).id);
        if (existing) {
          if (draft.note) existing.note = draft.note;
          if (draft.position) existing.position = structuredClone(draft.position);
          existing.entityIds = unique([...existing.entityIds, ...entityIds]);
          existing.updatedAt = now;
        } else {
          casebook.timeline.push({
            id: this.deps.id(),
            label: draft.label,
            whenText: draft.whenText,
            ...(draft.note ? { note: draft.note } : {}),
            ...(draft.position ? { position: structuredClone(draft.position) } : {}),
            entityIds,
            operationId: `${input.operationId}:timeline:${index}`,
            createdAt: now,
            updatedAt: now
          });
        }
      }

      for (const [index, draft] of (input.observationTasks ?? []).entries()) {
        const existing = casebook.observationTasks.find(
          (item) => normalizeText(item.prompt) === normalizeText(draft.prompt)
        );
        if (existing) {
          existing.status = draft.status;
          if (draft.position) existing.position = structuredClone(draft.position);
          existing.updatedAt = now;
        } else {
          casebook.observationTasks.push({
            id: this.deps.id(),
            prompt: draft.prompt,
            status: draft.status,
            ...(draft.position ? { position: structuredClone(draft.position) } : {}),
            operationId: `${input.operationId}:task:${index}`,
            createdAt: now,
            updatedAt: now
          });
        }
      }

      casebook.updatedAt = now;
      session.updatedAt = now;
      return {
        bookId: input.bookId,
        summary: this.casebookSummary(casebook),
        casebook: structuredClone(casebook)
      };
    });
  }

  async getCasebook(bookId: string) {
    const database = await this.repository.read();
    this.requireSession(database, bookId);
    const casebook = database.readingRoomCasebooks.find((item) => item.sessionId === bookId);
    return casebook
      ? structuredClone(casebook)
      : this.emptyCasebook(bookId, this.deps.now().toISOString());
  }

  async getStatusCard(bookId: string) {
    const context = await this.getBookContext(bookId);
    return {
      view: "reading_status" as const,
      book: this.summarizeSession(context.session),
      openQuestionCount: context.openQuestions.length,
      latestThought: context.recentThoughts[0]
    };
  }

  async getEndCard(input: RenderReadingEndCardInput) {
    const database = await this.repository.read();
    const session = this.requireSession(database, input.bookId);
    const allThoughts = this.sortThoughts(
      database.thoughts.filter((thought) => thought.sessionId === input.bookId)
    );
    const thoughts = input.operationId
      ? allThoughts.filter((thought) => thought.operationId === input.operationId)
      : allThoughts.slice(0, 12);
    const latestTavThought = thoughts.find((thought) => thought.author === "tav");
    const latestGaleThought = thoughts.find((thought) => thought.author === "gale");
    const latestSharedThought = thoughts.find((thought) => thought.author === "shared");
    const latestQuestion = thoughts.find(
      (thought) => thought.kind === "question" && thought.status === "open"
    );
    return {
      view: "reading_end" as const,
      book: this.summarizeSession(session),
      operationId: input.operationId,
      progressSummary: input.progressSummary,
      readingSummary: input.readingSummary,
      tavThought: input.tavThought ?? latestTavThought?.content,
      galeThought: input.galeThought ?? latestGaleThought?.content,
      openQuestion: input.openQuestion ?? latestQuestion?.content,
      tavThoughtCount: thoughts.filter((thought) => thought.author === "tav").length,
      galeThoughtCount: thoughts.filter((thought) => thought.author === "gale").length,
      sharedThoughtCount: thoughts.filter((thought) => thought.author === "shared").length,
      newQuestionCount: thoughts.filter(
        (thought) => thought.kind === "question" && thought.status === "open"
      ).length,
      latestTavThought,
      latestGaleThought,
      latestSharedThought,
      latestQuestion,
      unsyncedThoughtCount: allThoughts.filter((thought) => !thought.notionSyncedAt).length
    };
  }

  private createSession(title: string, genre: BookGenre, author?: string): ReadingSession {
    const now = this.deps.now().toISOString();
    const type = genre === "manga" ? "manga" : "novel";
    return {
      id: this.deps.id(),
      title,
      type,
      status: "active",
      userCurrentPosition: {
        kind: type === "manga" ? "page" : "paragraph",
        index: 1,
        label: type === "manga" ? "第 1 页" : "开篇"
      },
      assistantSyncedPosition: null,
      liveReadingEnabled: false,
      sessionPreferences: structuredClone(DEFAULT_SESSION_PREFERENCES),
      sourceManifest: null,
      ...(author ? { author } : {}),
      genre,
      createdAt: now,
      updatedAt: now,
      lastReadAt: now
    };
  }

  private requireSession(database: ReadingDatabase, bookId: string): ReadingSession {
    const session = database.sessions.find((item) => item.id === bookId);
    if (!session) throw new AppError("SESSION_NOT_FOUND", `找不到书籍：${bookId}`);
    return session;
  }

  private assertProgressBoundary(session: ReadingSession) {
    const tav = session.userCurrentPosition;
    const shared = session.assistantSyncedPosition;
    if (shared && shared.kind === tav.kind && shared.index > tav.index) {
      throw new AppError("INVALID_OPERATION", "共同阅读边界不能越过塔芙已经读到的位置。");
    }
    const spoiler = session.spoilerBoundary;
    if (spoiler && spoiler.kind === tav.kind && spoiler.index > tav.index) {
      throw new AppError("INVALID_OPERATION", "剧透边界不能越过塔芙已经读到的位置。");
    }
  }

  private summarizeSession(session: ReadingSession) {
    return {
      bookId: session.id,
      title: session.title,
      ...(session.author ? { author: session.author } : {}),
      genre: session.genre ?? (session.type === "manga" ? "manga" : "novel"),
      status: session.status,
      tavPosition: structuredClone(session.userCurrentPosition),
      sharedPosition: session.assistantSyncedPosition
        ? structuredClone(session.assistantSyncedPosition)
        : null,
      spoilerBoundary: session.spoilerBoundary
        ? structuredClone(session.spoilerBoundary)
        : null,
      lastReadAt: session.lastReadAt,
      lastNotionSyncedAt: session.lastNotionSyncedAt ?? null
    };
  }

  private progressSnapshot(session: ReadingSession) {
    return {
      tav: structuredClone(session.userCurrentPosition),
      shared: session.assistantSyncedPosition
        ? structuredClone(session.assistantSyncedPosition)
        : null,
      spoilerBoundary: session.spoilerBoundary
        ? structuredClone(session.spoilerBoundary)
        : null
    };
  }

  private sortSessions(sessions: ReadingSession[]) {
    return [...sessions].sort((left, right) => {
      if (left.status !== right.status) return left.status === "active" ? -1 : 1;
      return right.lastReadAt.localeCompare(left.lastReadAt);
    });
  }

  private sortThoughts(thoughts: DurableThought[]) {
    return [...thoughts].sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt)
    );
  }

  private ensureCasebook(database: ReadingDatabase, bookId: string, now: string) {
    let casebook = database.readingRoomCasebooks.find((item) => item.sessionId === bookId);
    if (!casebook) {
      casebook = this.emptyCasebook(bookId, now);
      database.readingRoomCasebooks.push(casebook);
    }
    return casebook;
  }

  private emptyCasebook(bookId: string, now: string): MysteryReadingCasebook {
    return {
      sessionId: bookId,
      entities: [],
      relations: [],
      clues: [],
      hypotheses: [],
      timeline: [],
      observationTasks: [],
      updatedAt: now
    };
  }

  private findEntity(
    casebook: MysteryReadingCasebook,
    name: string
  ): ReadingRoomCaseEntity | undefined {
    const normalized = normalizeText(name);
    return casebook.entities.find(
      (entity) =>
        normalizeText(entity.name) === normalized ||
        entity.aliases.some((alias) => normalizeText(alias) === normalized)
    );
  }

  private requireEntity(casebook: MysteryReadingCasebook, name: string) {
    const entity = this.findEntity(casebook, name);
    if (!entity) {
      throw new AppError(
        "INVALID_OPERATION",
        `案件簿中还没有“${name}”。请在同一次更新的 entities 中先建立它。`
      );
    }
    return entity;
  }

  private casebookSummary(casebook: MysteryReadingCasebook) {
    return {
      entities: casebook.entities.length,
      relations: casebook.relations.length,
      clues: casebook.clues.length,
      activeHypotheses: casebook.hypotheses.filter((item) => item.status === "active").length,
      timelineEntries: casebook.timeline.length,
      openObservationTasks: casebook.observationTasks.filter((item) => item.status === "open").length
    };
  }

  private casebookItemCount(casebook: MysteryReadingCasebook) {
    return (
      casebook.entities.length +
      casebook.relations.length +
      casebook.clues.length +
      casebook.hypotheses.length +
      casebook.timeline.length +
      casebook.observationTasks.length
    );
  }
}

function normalizeTitle(value: string) {
  return normalizeText(value.replace(/[《》]/g, ""));
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
