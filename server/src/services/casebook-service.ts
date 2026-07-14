import { randomUUID } from "node:crypto";
import type {
  CaseAuthor,
  CaseBundle,
  CaseEntity,
  CaseEntityType,
  CaseEntry,
  CaseEntryKind,
  CaseGraphStatus,
  CaseHypothesis,
  CaseHypothesisStatus,
  CaseObservationTask,
  CaseObservationTaskStatus,
  CaseRelation,
  CaseSourceType,
  InvestigationCase,
  ReadingDatabase
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

export class CasebookService {
  constructor(
    private readonly repository: ReadingRepository,
    private readonly deps: Dependencies = defaultDependencies
  ) {}

  async listCases(): Promise<InvestigationCase[]> {
    const database = await this.repository.read();
    return database.cases
      .map((item) => structuredClone(item))
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === "active" ? -1 : 1;
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }

  async createCase(input: {
    title: string;
    sourceType: CaseSourceType;
    sourceLabel?: string;
  }): Promise<InvestigationCase> {
    return this.repository.mutate((database) => {
      const now = this.deps.now().toISOString();
      const investigationCase: InvestigationCase = {
        id: this.deps.id(),
        title: input.title.trim(),
        sourceType: input.sourceType,
        ...(input.sourceLabel ? { sourceLabel: input.sourceLabel.trim() } : {}),
        status: "active",
        caseRevision: 0,
        assistantSyncedRevision: 0,
        createdAt: now,
        updatedAt: now
      };
      database.cases.push(investigationCase);
      return structuredClone(investigationCase);
    });
  }

  async getCaseBundle(caseId: string): Promise<CaseBundle> {
    const database = await this.repository.read();
    return this.bundle(database, caseId);
  }

  async setCaseStatus(caseId: string, status: "active" | "archived") {
    return this.repository.mutate((database) => {
      const investigationCase = this.requireCase(database, caseId);
      if (investigationCase.status === status) return structuredClone(investigationCase);
      investigationCase.status = status;
      this.touch(investigationCase);
      return structuredClone(investigationCase);
    });
  }

  async addEntry(input: {
    caseId: string;
    author: CaseAuthor;
    kind: CaseEntryKind;
    content: string;
    sourcePosition?: string;
  }): Promise<{ case: InvestigationCase; entry: CaseEntry }> {
    const result = await this.addEntries({
      caseId: input.caseId,
      author: input.author,
      entries: [
        {
          kind: input.kind,
          content: input.content,
          ...(input.sourcePosition ? { sourcePosition: input.sourcePosition } : {})
        }
      ]
    });
    return { case: result.case, entry: result.entries[0]! };
  }

  async addEntries(input: {
    caseId: string;
    author: CaseAuthor;
    entries: Array<{
      kind: CaseEntryKind;
      content: string;
      sourcePosition?: string;
    }>;
  }): Promise<{ case: InvestigationCase; entries: CaseEntry[] }> {
    if (input.entries.length === 0) {
      throw new AppError("INVALID_OPERATION", "至少需要一条案情才能整批保存。");
    }
    return this.repository.mutate((database) => {
      const investigationCase = this.requireCase(database, input.caseId);
      const now = this.deps.now().toISOString();
      const revision = this.touch(investigationCase);
      const entries = input.entries.map<CaseEntry>((entry) => ({
        id: this.deps.id(),
        caseId: input.caseId,
        author: input.author,
        kind: entry.kind,
        content: entry.content.trim(),
        ...(entry.sourcePosition
          ? { sourcePosition: entry.sourcePosition.trim() }
          : {}),
        createdRevision: revision,
        createdAt: now,
        updatedAt: now
      }));
      database.caseEntries.push(...entries);
      return {
        case: structuredClone(investigationCase),
        entries: structuredClone(entries)
      };
    });
  }

  async upsertEntity(input: {
    caseId: string;
    entityId?: string;
    entityType: CaseEntityType;
    name: string;
    description?: string;
    status?: CaseGraphStatus;
    createdBy: CaseAuthor;
    x?: number;
    y?: number;
  }): Promise<{ case: InvestigationCase; entity: CaseEntity }> {
    return this.repository.mutate((database) => {
      const investigationCase = this.requireCase(database, input.caseId);
      const now = this.deps.now().toISOString();
      const existing = input.entityId
        ? database.caseEntities.find(
            (entity) => entity.id === input.entityId && entity.caseId === input.caseId
          )
        : undefined;
      if (input.entityId && !existing) {
        throw new AppError("NOT_FOUND", "没有找到要修改的案件节点。");
      }
      const normalizedDescription = input.description?.trim();
      const semanticChange =
        !existing ||
        existing.entityType !== input.entityType ||
        existing.name !== input.name.trim() ||
        existing.status !== (input.status ?? existing.status) ||
        existing.createdBy !== input.createdBy ||
        (existing.description ?? "") !== (normalizedDescription ?? existing.description ?? "");
      if (semanticChange) this.touch(investigationCase);
      else investigationCase.updatedAt = now;
      const entity: CaseEntity = existing ?? {
        id: this.deps.id(),
        caseId: input.caseId,
        entityType: input.entityType,
        name: input.name.trim(),
        status: input.status ?? (input.createdBy === "gale" ? "suggested" : "confirmed"),
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now
      };
      entity.entityType = input.entityType;
      entity.name = input.name.trim();
      entity.status = input.status ?? entity.status;
      entity.createdBy = input.createdBy;
      entity.updatedAt = now;
      if (input.description !== undefined) {
        if (normalizedDescription) entity.description = normalizedDescription;
        else delete entity.description;
      }
      if (input.x !== undefined) entity.x = input.x;
      if (input.y !== undefined) entity.y = input.y;
      if (!existing) database.caseEntities.push(entity);
      return {
        case: structuredClone(investigationCase),
        entity: structuredClone(entity)
      };
    });
  }

  async upsertRelation(input: {
    caseId: string;
    relationId?: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationType: string;
    label?: string;
    status?: CaseGraphStatus;
    createdBy: CaseAuthor;
    supportingEntryId?: string;
  }): Promise<{ case: InvestigationCase; relation: CaseRelation }> {
    return this.repository.mutate((database) => {
      const investigationCase = this.requireCase(database, input.caseId);
      if (input.sourceEntityId === input.targetEntityId) {
        throw new AppError("INVALID_OPERATION", "关系的起点与终点不能是同一个节点。");
      }
      this.requireEntity(database, input.caseId, input.sourceEntityId);
      this.requireEntity(database, input.caseId, input.targetEntityId);
      if (
        input.supportingEntryId &&
        !database.caseEntries.some(
          (entry) => entry.id === input.supportingEntryId && entry.caseId === input.caseId
        )
      ) {
        throw new AppError("NOT_FOUND", "没有找到这条关系引用的案情记录。");
      }
      const existing = input.relationId
        ? database.caseRelations.find(
            (relation) => relation.id === input.relationId && relation.caseId === input.caseId
          )
        : undefined;
      if (input.relationId && !existing) {
        throw new AppError("NOT_FOUND", "没有找到要修改的案件关系。");
      }
      const now = this.deps.now().toISOString();
      const normalizedLabel = input.label?.trim();
      const nextStatus = input.status ?? existing?.status;
      const semanticChange =
        !existing ||
        existing.sourceEntityId !== input.sourceEntityId ||
        existing.targetEntityId !== input.targetEntityId ||
        existing.relationType !== input.relationType.trim() ||
        existing.status !== nextStatus ||
        existing.createdBy !== input.createdBy ||
        (input.label !== undefined && (existing.label ?? "") !== (normalizedLabel ?? "")) ||
        (input.supportingEntryId !== undefined &&
          existing.supportingEntryId !== input.supportingEntryId);
      if (semanticChange) this.touch(investigationCase);
      else investigationCase.updatedAt = now;
      const relation: CaseRelation = existing ?? {
        id: this.deps.id(),
        caseId: input.caseId,
        sourceEntityId: input.sourceEntityId,
        targetEntityId: input.targetEntityId,
        relationType: input.relationType.trim(),
        status: input.status ?? (input.createdBy === "gale" ? "suggested" : "confirmed"),
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now
      };
      relation.sourceEntityId = input.sourceEntityId;
      relation.targetEntityId = input.targetEntityId;
      relation.relationType = input.relationType.trim();
      relation.status = input.status ?? relation.status;
      relation.createdBy = input.createdBy;
      relation.updatedAt = now;
      if (input.label !== undefined) {
        if (normalizedLabel) relation.label = normalizedLabel;
        else delete relation.label;
      }
      if (input.supportingEntryId !== undefined) {
        relation.supportingEntryId = input.supportingEntryId;
      }
      if (!existing) database.caseRelations.push(relation);
      return {
        case: structuredClone(investigationCase),
        relation: structuredClone(relation)
      };
    });
  }

  async upsertHypothesis(input: {
    caseId: string;
    hypothesisId?: string;
    author: CaseAuthor;
    claim: string;
    status?: CaseHypothesisStatus;
    confidence?: number;
  }): Promise<{ case: InvestigationCase; hypothesis: CaseHypothesis }> {
    return this.repository.mutate((database) => {
      const investigationCase = this.requireCase(database, input.caseId);
      const existing = input.hypothesisId
        ? database.caseHypotheses.find(
            (hypothesis) =>
              hypothesis.id === input.hypothesisId && hypothesis.caseId === input.caseId
          )
        : undefined;
      if (input.hypothesisId && !existing) {
        throw new AppError("NOT_FOUND", "没有找到要修改的案件猜想。");
      }
      const now = this.deps.now().toISOString();
      const nextStatus = input.status ?? existing?.status;
      const semanticChange =
        !existing ||
        existing.author !== input.author ||
        existing.claim !== input.claim.trim() ||
        existing.status !== nextStatus ||
        (input.confidence !== undefined && existing.confidence !== input.confidence);
      if (semanticChange) this.touch(investigationCase);
      else investigationCase.updatedAt = now;
      const hypothesis: CaseHypothesis = existing ?? {
        id: this.deps.id(),
        caseId: input.caseId,
        author: input.author,
        claim: input.claim.trim(),
        status: input.status ?? "active",
        createdAt: now,
        updatedAt: now
      };
      hypothesis.author = input.author;
      hypothesis.claim = input.claim.trim();
      hypothesis.status = input.status ?? hypothesis.status;
      hypothesis.updatedAt = now;
      if (input.confidence !== undefined) hypothesis.confidence = input.confidence;
      if (!existing) database.caseHypotheses.push(hypothesis);
      return {
        case: structuredClone(investigationCase),
        hypothesis: structuredClone(hypothesis)
      };
    });
  }

  async upsertObservationTask(input: {
    caseId: string;
    taskId?: string;
    instruction: string;
    createdBy: CaseAuthor;
    status: CaseObservationTaskStatus;
  }): Promise<{ case: InvestigationCase; task: CaseObservationTask }> {
    return this.repository.mutate((database) => {
      const investigationCase = this.requireCase(database, input.caseId);
      const existing = input.taskId
        ? database.caseObservationTasks.find(
            (task) => task.id === input.taskId && task.caseId === input.caseId
          )
        : undefined;
      if (input.taskId && !existing) {
        throw new AppError("NOT_FOUND", "没有找到要修改的情报委托。");
      }
      if (input.status === "open" && existing?.status !== "open") {
        const openTasks = database.caseObservationTasks.filter(
          (task) =>
            task.caseId === input.caseId &&
            task.id !== existing?.id &&
            task.status === "open"
        );
        if (openTasks.length >= 3) {
          throw new AppError("INVALID_OPERATION", "每个案件最多保留三条进行中的情报委托。");
        }
      }
      const now = this.deps.now().toISOString();
      const semanticChange =
        Boolean(existing) &&
        (existing?.instruction !== input.instruction.trim() ||
          existing.status !== input.status ||
          existing.createdBy !== input.createdBy);
      if (semanticChange) this.touch(investigationCase);
      else investigationCase.updatedAt = now;
      const task: CaseObservationTask = existing ?? {
        id: this.deps.id(),
        caseId: input.caseId,
        instruction: input.instruction.trim(),
        createdBy: input.createdBy,
        status: input.status,
        createdRevision: investigationCase.caseRevision,
        createdAt: now,
        updatedAt: now
      };
      task.instruction = input.instruction.trim();
      task.createdBy = input.createdBy;
      task.status = input.status;
      task.updatedAt = now;
      if (!existing) database.caseObservationTasks.push(task);
      return {
        case: structuredClone(investigationCase),
        task: structuredClone(task)
      };
    });
  }

  async prepareSync(caseId: string) {
    return this.repository.mutate((database) => {
      const investigationCase = this.requireCase(database, caseId);
      const fromRevision = investigationCase.assistantSyncedRevision;
      const toRevision = investigationCase.caseRevision;
      const reusable = database.caseSyncOperations.find(
        (operation) =>
          operation.caseId === caseId &&
          operation.fromRevision === fromRevision &&
          operation.toRevision === toRevision &&
          operation.state === "prepared"
      );
      const operation = reusable ?? {
        operationId: this.deps.id(),
        caseId,
        fromRevision,
        toRevision,
        state: "prepared" as const,
        createdAt: this.deps.now().toISOString()
      };
      if (!reusable) database.caseSyncOperations.push(operation);
      const bundle = this.bundle(database, caseId);
      const entries = bundle.entries.filter(
        (entry) =>
          entry.createdRevision > fromRevision && entry.createdRevision <= toRevision
      );
      return {
        operation: structuredClone(operation),
        context: {
          type: "casebook_sync" as const,
          case: {
            id: investigationCase.id,
            title: investigationCase.title,
            sourceType: investigationCase.sourceType,
            status: investigationCase.status,
            ...(investigationCase.sourceLabel
              ? { sourceLabel: investigationCase.sourceLabel }
              : {}),
            fromRevision,
            toRevision
          },
          entries,
          entities: bundle.entities,
          relations: bundle.relations,
          hypotheses: bundle.hypotheses,
          observationTasks: bundle.observationTasks,
          rules: [
            "Only reason from this synchronized case context.",
            "Keep observations, testimony, evidence, and hypotheses distinct.",
            "Any Gale-created entity or relation must remain suggested until Tav confirms it.",
            "Gale may leave at most three concise open observation tasks for Tav using case_upsert_observation_task.",
            "Confirm the sync operation only after this context has actually been received."
          ],
          operationId: operation.operationId
        }
      };
    });
  }

  async confirmSync(caseId: string, operationId: string) {
    return this.repository.mutate((database) => {
      const investigationCase = this.requireCase(database, caseId);
      const operation = database.caseSyncOperations.find(
        (candidate) =>
          candidate.operationId === operationId && candidate.caseId === caseId
      );
      if (!operation) throw new AppError("NOT_FOUND", "没有找到这次案件同步操作。");
      if (operation.state === "confirmed") {
        return {
          case: structuredClone(investigationCase),
          operation: structuredClone(operation)
        };
      }
      if (operation.toRevision > investigationCase.caseRevision) {
        throw new AppError("INVALID_OPERATION", "同步版本超过了当前案件版本。");
      }
      const confirmedAt = this.deps.now().toISOString();
      operation.state = "confirmed";
      operation.confirmedAt = confirmedAt;
      investigationCase.assistantSyncedRevision = Math.max(
        investigationCase.assistantSyncedRevision,
        operation.toRevision
      );
      investigationCase.lastAssistantConfirmation = {
        operationId,
        fromRevision: operation.fromRevision,
        toRevision: operation.toRevision,
        confirmedAt
      };
      investigationCase.updatedAt = confirmedAt;
      return {
        case: structuredClone(investigationCase),
        operation: structuredClone(operation)
      };
    });
  }

  private bundle(database: ReadingDatabase, caseId: string): CaseBundle {
    const investigationCase = this.requireCase(database, caseId);
    return {
      case: structuredClone(investigationCase),
      entries: database.caseEntries
        .filter((entry) => entry.caseId === caseId)
        .map((entry) => structuredClone(entry))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      entities: database.caseEntities
        .filter((entity) => entity.caseId === caseId)
        .map((entity) => structuredClone(entity)),
      relations: database.caseRelations
        .filter((relation) => relation.caseId === caseId)
        .map((relation) => structuredClone(relation)),
      hypotheses: database.caseHypotheses
        .filter((hypothesis) => hypothesis.caseId === caseId)
        .map((hypothesis) => structuredClone(hypothesis)),
      observationTasks: database.caseObservationTasks
        .filter((task) => task.caseId === caseId)
        .map((task) => structuredClone(task))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    };
  }

  private requireCase(database: ReadingDatabase, caseId: string) {
    const investigationCase = database.cases.find((item) => item.id === caseId);
    if (!investigationCase) throw new AppError("NOT_FOUND", "没有找到这个案件。");
    return investigationCase;
  }

  private requireEntity(database: ReadingDatabase, caseId: string, entityId: string) {
    const entity = database.caseEntities.find(
      (candidate) => candidate.id === entityId && candidate.caseId === caseId
    );
    if (!entity) throw new AppError("NOT_FOUND", "没有找到关系中的案件节点。");
    return entity;
  }

  private touch(investigationCase: InvestigationCase) {
    investigationCase.caseRevision += 1;
    investigationCase.updatedAt = this.deps.now().toISOString();
    return investigationCase.caseRevision;
  }
}
