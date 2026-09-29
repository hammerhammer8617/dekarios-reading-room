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
  CaseStatus,
  InvestigationCase
} from "@ss/shared";
import type { ToolCallResult } from "../types/openai.js";

export const LOCAL_CASEBOOK_STORAGE_KEY = "gtd:casebook-preview:v1";

type LocalCasebookDatabase = {
  cases: InvestigationCase[];
  entries: CaseEntry[];
  entities: CaseEntity[];
  relations: CaseRelation[];
  hypotheses: CaseHypothesis[];
  observationTasks: CaseObservationTask[];
};

const localCasebookTools = new Set([
  "case_list",
  "case_create",
  "case_get",
  "case_set_status",
  "case_add_entry",
  "case_add_entries",
  "case_upsert_entity",
  "case_upsert_relation",
  "case_upsert_hypothesis",
  "case_upsert_observation_task",
  "case_prepare_sync",
  "case_confirm_sync"
]);

export function isLocalCasebookTool(name: string) {
  return localCasebookTools.has(name);
}

export function isStandaloneCasebookPreview() {
  return (
    typeof window !== "undefined" &&
    window.parent === window &&
    typeof window.openai?.callTool !== "function"
  );
}

export async function callLocalCasebookTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const database = readDatabase();

  switch (name) {
    case "case_list":
      return result({ cases: database.cases });

    case "case_create": {
      const now = new Date().toISOString();
      const investigationCase: InvestigationCase = {
        id: createId("case"),
        title: requiredString(args.title, "案件名"),
        sourceType: (optionalString(args.sourceType) ?? "other") as CaseSourceType,
        ...(optionalString(args.sourceLabel)
          ? { sourceLabel: optionalString(args.sourceLabel) }
          : {}),
        status: "active",
        caseRevision: 0,
        assistantSyncedRevision: 0,
        createdAt: now,
        updatedAt: now
      };
      database.cases.unshift(investigationCase);
      writeDatabase(database);
      return result({ case: investigationCase });
    }

    case "case_get":
      return result({ bundle: getBundle(database, requiredString(args.caseId, "caseId")) });

    case "case_set_status": {
      const investigationCase = requireCase(database, requiredString(args.caseId, "caseId"));
      investigationCase.status = requiredString(args.status, "status") as CaseStatus;
      investigationCase.updatedAt = new Date().toISOString();
      writeDatabase(database);
      return result({ case: investigationCase });
    }

    case "case_add_entry": {
      const [entry] = addEntries(database, args, [args]);
      if (!entry) throw new Error("案情记录没有建立成功");
      writeDatabase(database);
      return result({ entry, case: requireCase(database, entry.caseId) });
    }

    case "case_add_entries": {
      const inputs = Array.isArray(args.entries)
        ? args.entries.filter(isRecord)
        : [];
      if (inputs.length === 0) throw new Error("至少需要一条案情记录");
      const entries = addEntries(database, args, inputs);
      writeDatabase(database);
      return result({
        entries,
        case: requireCase(database, requiredString(args.caseId, "caseId"))
      });
    }

    case "case_upsert_entity": {
      const caseId = requiredString(args.caseId, "caseId");
      const revision = advanceCase(database, caseId);
      const entityId = optionalString(args.entityId) ?? createId("entity");
      const previous = database.entities.find((item) => item.id === entityId);
      const now = new Date().toISOString();
      const entity: CaseEntity = {
        id: entityId,
        caseId,
        entityType: requiredString(args.entityType, "entityType") as CaseEntityType,
        name: requiredString(args.name, "name"),
        ...(optionalString(args.description)
          ? { description: optionalString(args.description) }
          : {}),
        status: (optionalString(args.status) ?? "confirmed") as CaseGraphStatus,
        createdBy: (optionalString(args.createdBy) ?? "tav") as CaseAuthor,
        ...(optionalNumber(args.x) !== undefined ? { x: optionalNumber(args.x) } : {}),
        ...(optionalNumber(args.y) !== undefined ? { y: optionalNumber(args.y) } : {}),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      };
      upsert(database.entities, entity);
      writeDatabase(database);
      return result({ entity, case: revision });
    }

    case "case_upsert_relation": {
      const caseId = requiredString(args.caseId, "caseId");
      const revision = advanceCase(database, caseId);
      const relationId = optionalString(args.relationId) ?? createId("relation");
      const previous = database.relations.find((item) => item.id === relationId);
      const now = new Date().toISOString();
      const relation: CaseRelation = {
        id: relationId,
        caseId,
        sourceEntityId: requiredString(args.sourceEntityId, "sourceEntityId"),
        targetEntityId: requiredString(args.targetEntityId, "targetEntityId"),
        relationType: requiredString(args.relationType, "relationType"),
        ...(optionalString(args.label) ? { label: optionalString(args.label) } : {}),
        status: (optionalString(args.status) ?? "confirmed") as CaseGraphStatus,
        createdBy: (optionalString(args.createdBy) ?? "tav") as CaseAuthor,
        ...(optionalString(args.supportingEntryId)
          ? { supportingEntryId: optionalString(args.supportingEntryId) }
          : {}),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      };
      upsert(database.relations, relation);
      writeDatabase(database);
      return result({ relation, case: revision });
    }

    case "case_upsert_hypothesis": {
      const caseId = requiredString(args.caseId, "caseId");
      const revision = advanceCase(database, caseId);
      const hypothesisId = optionalString(args.hypothesisId) ?? createId("hypothesis");
      const previous = database.hypotheses.find((item) => item.id === hypothesisId);
      const now = new Date().toISOString();
      const hypothesis: CaseHypothesis = {
        id: hypothesisId,
        caseId,
        author: (optionalString(args.author) ?? "tav") as CaseAuthor,
        claim: requiredString(args.claim, "claim"),
        status: (optionalString(args.status) ?? "active") as CaseHypothesisStatus,
        ...(optionalNumber(args.confidence) !== undefined
          ? { confidence: optionalNumber(args.confidence) }
          : {}),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      };
      upsert(database.hypotheses, hypothesis);
      writeDatabase(database);
      return result({ hypothesis, case: revision });
    }

    case "case_upsert_observation_task": {
      const caseId = requiredString(args.caseId, "caseId");
      const revision = advanceCase(database, caseId);
      const taskId = optionalString(args.taskId) ?? createId("task");
      const previous = database.observationTasks.find((item) => item.id === taskId);
      const now = new Date().toISOString();
      const task: CaseObservationTask = {
        id: taskId,
        caseId,
        instruction: requiredString(args.instruction, "instruction"),
        createdBy: (optionalString(args.createdBy) ?? "gale") as CaseAuthor,
        status: (optionalString(args.status) ?? "open") as CaseObservationTaskStatus,
        createdRevision: previous?.createdRevision ?? revision.caseRevision,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      };
      upsert(database.observationTasks, task);
      writeDatabase(database);
      return result({ task, case: revision });
    }

    case "case_prepare_sync": {
      const caseId = requiredString(args.caseId, "caseId");
      const bundle = getBundle(database, caseId);
      const fromRevision = bundle.case.assistantSyncedRevision;
      return result({
        operation: {
          operationId: createId("sync"),
          fromRevision,
          toRevision: bundle.case.caseRevision
        },
        context: {
          type: "casebook_sync",
          case: bundle.case,
          entries: bundle.entries.filter((entry) => entry.createdRevision > fromRevision),
          entities: bundle.entities,
          relations: bundle.relations,
          hypotheses: bundle.hypotheses,
          observationTasks: bundle.observationTasks
        }
      });
    }

    case "case_confirm_sync": {
      const investigationCase = requireCase(database, requiredString(args.caseId, "caseId"));
      investigationCase.assistantSyncedRevision = investigationCase.caseRevision;
      investigationCase.updatedAt = new Date().toISOString();
      writeDatabase(database);
      return result({ case: investigationCase });
    }

    default:
      return result({});
  }
}

function addEntries(
  database: LocalCasebookDatabase,
  args: Record<string, unknown>,
  inputs: Record<string, unknown>[]
) {
  const caseId = requiredString(args.caseId, "caseId");
  const investigationCase = advanceCase(database, caseId);
  const now = new Date().toISOString();
  const author = (optionalString(args.author) ?? "tav") as CaseAuthor;
  const entries = inputs.map<CaseEntry>((input) => ({
    id: createId("entry"),
    caseId,
    author: (optionalString(input.author) ?? author) as CaseAuthor,
    kind: requiredString(input.kind, "kind") as CaseEntryKind,
    content: requiredString(input.content, "content"),
    ...(optionalString(input.sourcePosition ?? args.sourcePosition)
      ? { sourcePosition: optionalString(input.sourcePosition ?? args.sourcePosition) }
      : {}),
    createdRevision: investigationCase.caseRevision,
    createdAt: now,
    updatedAt: now
  }));
  database.entries.push(...entries);
  return entries;
}

function getBundle(database: LocalCasebookDatabase, caseId: string): CaseBundle {
  return {
    case: requireCase(database, caseId),
    entries: database.entries.filter((item) => item.caseId === caseId),
    entities: database.entities.filter((item) => item.caseId === caseId),
    relations: database.relations.filter((item) => item.caseId === caseId),
    hypotheses: database.hypotheses.filter((item) => item.caseId === caseId),
    observationTasks: database.observationTasks.filter((item) => item.caseId === caseId)
  };
}

function advanceCase(database: LocalCasebookDatabase, caseId: string) {
  const investigationCase = requireCase(database, caseId);
  investigationCase.caseRevision += 1;
  investigationCase.updatedAt = new Date().toISOString();
  return investigationCase;
}

function requireCase(database: LocalCasebookDatabase, caseId: string) {
  const investigationCase = database.cases.find((item) => item.id === caseId);
  if (!investigationCase) throw new Error("案件不存在");
  return investigationCase;
}

function readDatabase(): LocalCasebookDatabase {
  try {
    const stored = window.localStorage.getItem(LOCAL_CASEBOOK_STORAGE_KEY);
    if (!stored) return emptyDatabase();
    const parsed = JSON.parse(stored) as Partial<LocalCasebookDatabase>;
    return {
      cases: arrayOrEmpty(parsed.cases),
      entries: arrayOrEmpty(parsed.entries),
      entities: arrayOrEmpty(parsed.entities),
      relations: arrayOrEmpty(parsed.relations),
      hypotheses: arrayOrEmpty(parsed.hypotheses),
      observationTasks: arrayOrEmpty(parsed.observationTasks)
    };
  } catch {
    return emptyDatabase();
  }
}

function writeDatabase(database: LocalCasebookDatabase) {
  window.localStorage.setItem(LOCAL_CASEBOOK_STORAGE_KEY, JSON.stringify(database));
}

function emptyDatabase(): LocalCasebookDatabase {
  return {
    cases: [],
    entries: [],
    entities: [],
    relations: [],
    hypotheses: [],
    observationTasks: []
  };
}

function result(structuredContent: Record<string, unknown>): ToolCallResult {
  return { structuredContent };
}

function createId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function requiredString(value: unknown, label: string) {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayOrEmpty<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value : [];
}

function upsert<T extends { id: string }>(collection: T[], value: T) {
  const index = collection.findIndex((item) => item.id === value.id);
  if (index >= 0) collection[index] = value;
  else collection.push(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
