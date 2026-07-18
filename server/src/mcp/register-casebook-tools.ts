import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  READING_NEST_RESOURCE_URI,
  addCaseEntriesInputSchema,
  addCaseEntryInputSchema,
  confirmCaseSyncInputSchema,
  createCaseInputSchema,
  getCaseInputSchema,
  openCasebookInputSchema,
  prepareCaseSyncInputSchema,
  setCaseStatusInputSchema,
  upsertCaseEntityInputSchema,
  upsertCaseHypothesisInputSchema,
  upsertCaseObservationTaskInputSchema,
  upsertCaseRelationInputSchema
} from "@ss/shared";
import { CasebookService } from "../services/casebook-service.js";
import { toolResult } from "./tool-result.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};
const mutation = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false
};

export const CASEBOOK_TOOL_CONFIGS = {
  open_casebook: {
    title: "打开德卡里奥斯家的案件簿",
    description:
      "Use this when Tav wants to open the shared casebook, record clues, or continue a mystery investigation.",
    inputSchema: openCasebookInputSchema,
    annotations: readOnly,
    _meta: {
      ui: { resourceUri: READING_NEST_RESOURCE_URI },
      "openai/outputTemplate": READING_NEST_RESOURCE_URI,
      "openai/toolInvocation/invoking": "正在展开案件簿…",
      "openai/toolInvocation/invoked": "案件桌已经准备好"
    }
  },
  case_list: {
    title: "列出案件",
    description: "List the private cases in Tav and Gale's shared casebook.",
    inputSchema: openCasebookInputSchema,
    annotations: readOnly
  },
  case_create: {
    title: "新建案件",
    description: "Create a new mystery case after the user asks to start one.",
    inputSchema: createCaseInputSchema,
    annotations: mutation
  },
  case_get: {
    title: "读取案件",
    description:
      "Read one case's structured entries, entities, relations, and hypotheses. Never infer missing source text.",
    inputSchema: getCaseInputSchema,
    annotations: readOnly
  },
  case_set_status: {
    title: "更新案件状态",
    description: "Archive or reactivate a case when Tav explicitly asks.",
    inputSchema: setCaseStatusInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  case_add_entry: {
    title: "记录案情",
    description:
      "Save an observation, testimony, evidence item, question, or hypothesis. Preserve the user's wording.",
    inputSchema: addCaseEntryInputSchema,
    annotations: mutation
  },
  case_add_entries: {
    title: "批量记录案情",
    description:
      "Atomically save up to 30 separately classified case entries after Tav confirms the parsed batch. Preserve every entry's wording.",
    inputSchema: addCaseEntriesInputSchema,
    annotations: mutation
  },
  case_upsert_entity: {
    title: "写入案件节点",
    description:
      "Create or update a person, place, object, organization, or event. Gale-created nodes remain suggested until Tav confirms them.",
    inputSchema: upsertCaseEntityInputSchema,
    annotations: mutation
  },
  case_upsert_relation: {
    title: "写入案件关系",
    description:
      "Create or update a structured relation between two existing case entities. Gale-created relations remain suggested.",
    inputSchema: upsertCaseRelationInputSchema,
    annotations: mutation
  },
  case_upsert_hypothesis: {
    title: "写入案件猜想",
    description:
      "Create or update a clearly attributed hypothesis without rewriting it as established fact.",
    inputSchema: upsertCaseHypothesisInputSchema,
    annotations: mutation
  },
  case_upsert_observation_task: {
    title: "写入情报委托",
    description:
      "Create or update one concise next-observation task. Gale may leave at most three open tasks for Tav to investigate in the source.",
    inputSchema: upsertCaseObservationTaskInputSchema,
    annotations: mutation
  },
  case_prepare_sync: {
    title: "准备新增案情同步",
    description:
      "Prepare only the case changes since Gale's last confirmed revision. Returns a bounded structured context and operationId.",
    inputSchema: prepareCaseSyncInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  case_confirm_sync: {
    title: "确认盖尔已收到案情",
    description:
      "Call only after the prepared case context was actually received. Idempotently advances Gale's confirmed revision.",
    inputSchema: confirmCaseSyncInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  }
} as const;

export function registerCasebookTools(server: McpServer, service: CasebookService) {
  registerAppTool(server, "open_casebook", CASEBOOK_TOOL_CONFIGS.open_casebook, async () => {
    const cases = await service.listCases();
    return toolResult(
      { appView: "casebook", cases },
      "已打开德卡里奥斯家的案件簿。"
    );
  });

  server.registerTool("case_list", CASEBOOK_TOOL_CONFIGS.case_list, async () => {
    const cases = await service.listCases();
    return toolResult({ cases }, "已读取案件列表。");
  });

  server.registerTool("case_create", CASEBOOK_TOOL_CONFIGS.case_create, async (input) => {
    const investigationCase = await service.createCase(input);
    return toolResult(
      { case: investigationCase },
      `已经为《${investigationCase.title}》建立案件。`
    );
  });

  server.registerTool("case_get", CASEBOOK_TOOL_CONFIGS.case_get, async ({ caseId }) => {
    const bundle = await service.getCaseBundle(caseId);
    return toolResult({ bundle }, `已读取《${bundle.case.title}》的当前案情。`);
  });

  server.registerTool(
    "case_set_status",
    CASEBOOK_TOOL_CONFIGS.case_set_status,
    async ({ caseId, status }) => {
      const investigationCase = await service.setCaseStatus(caseId, status);
      return toolResult(
        { case: investigationCase },
        status === "archived" ? "案件已经归档。" : "案件已经重新展开。"
      );
    }
  );

  server.registerTool("case_add_entry", CASEBOOK_TOOL_CONFIGS.case_add_entry, async (input) => {
    const result = await service.addEntry(input);
    return toolResult(result, "这条案情已经按原话记下。"
    );
  });

  server.registerTool(
    "case_add_entries",
    CASEBOOK_TOOL_CONFIGS.case_add_entries,
    async (input) => {
      const result = await service.addEntries(input);
      return toolResult(result, `已经原样记下 ${result.entries.length} 条案情。`);
    }
  );

  server.registerTool(
    "case_upsert_entity",
    CASEBOOK_TOOL_CONFIGS.case_upsert_entity,
    async (input) => {
      const result = await service.upsertEntity(input);
      return toolResult(result, "案件节点已经写入结构图。"
      );
    }
  );

  server.registerTool(
    "case_upsert_relation",
    CASEBOOK_TOOL_CONFIGS.case_upsert_relation,
    async (input) => {
      const result = await service.upsertRelation(input);
      return toolResult(result, "案件关系已经写入结构图。"
      );
    }
  );

  server.registerTool(
    "case_upsert_hypothesis",
    CASEBOOK_TOOL_CONFIGS.case_upsert_hypothesis,
    async (input) => {
      const result = await service.upsertHypothesis(input);
      return toolResult(result, "这条猜想已经按署名保存。"
      );
    }
  );

  server.registerTool(
    "case_upsert_observation_task",
    CASEBOOK_TOOL_CONFIGS.case_upsert_observation_task,
    async (input) => {
      const result = await service.upsertObservationTask(input);
      return toolResult(
        result,
        result.task.status === "open"
          ? "情报委托已经交给侦探夫人。"
          : "情报委托状态已经更新。"
      );
    }
  );

  server.registerTool(
    "case_prepare_sync",
    CASEBOOK_TOOL_CONFIGS.case_prepare_sync,
    async ({ caseId }) => {
      const result = await service.prepareSync(caseId);
      const count = result.context.entries.length;
      return toolResult(
        result,
        count > 0
          ? `已准备 ${count} 条新增案情，请只依据这批内容参与推理。`
          : "没有新的案情记录；已提供当前结构图与猜想供复核。"
      );
    }
  );

  server.registerTool(
    "case_confirm_sync",
    CASEBOOK_TOOL_CONFIGS.case_confirm_sync,
    async ({ caseId, operationId }) => {
      const result = await service.confirmSync(caseId, operationId);
      return toolResult(
        result,
        `已确认盖尔收到案件第 ${result.case.assistantSyncedRevision} 版。`
      );
    }
  );
}
