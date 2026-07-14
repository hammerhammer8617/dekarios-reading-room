import { describe, expect, it } from "vitest";
import { READING_NEST_RESOURCE_URI } from "@ss/shared";
import { CASEBOOK_TOOL_CONFIGS, registerCasebookTools } from "./register-casebook-tools.js";

describe("casebook tool descriptors", () => {
  it("exposes one rendered entry and data-only case tools", () => {
    expect(Object.keys(CASEBOOK_TOOL_CONFIGS)).toHaveLength(11);
    expect(CASEBOOK_TOOL_CONFIGS.open_casebook._meta.ui).toEqual({
      resourceUri: READING_NEST_RESOURCE_URI
    });

    for (const [name, config] of Object.entries(CASEBOOK_TOOL_CONFIGS)) {
      if (name === "open_casebook") continue;
      expect("_meta" in config ? config._meta : undefined).toBeUndefined();
    }
  });

  it("requires explicit confirmation before advancing a prepared sync", () => {
    expect(CASEBOOK_TOOL_CONFIGS.case_prepare_sync.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true
    });
    expect(CASEBOOK_TOOL_CONFIGS.case_confirm_sync.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true
    });
    expect(CASEBOOK_TOOL_CONFIGS.case_confirm_sync.description).toMatch(/only after/i);
  });

  it("returns the casebook app view without exposing source text", async () => {
    const handlers = new Map<string, (args?: Record<string, unknown>) => Promise<any>>();
    const server = {
      registerTool: (
        name: string,
        _config: unknown,
        handler: (args?: Record<string, unknown>) => Promise<any>
      ) => handlers.set(name, handler)
    };
    const service = {
      listCases: async () => [
        {
          id: "case-1",
          title: "温室失窃案",
          sourceType: "novel",
          status: "active",
          caseRevision: 2,
          assistantSyncedRevision: 1,
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z"
        }
      ]
    };

    registerCasebookTools(server as never, service as never);
    const result = await handlers.get("open_casebook")?.({});

    expect(result.structuredContent).toMatchObject({
      appView: "casebook",
      cases: [{ id: "case-1", title: "温室失窃案" }]
    });
    expect(JSON.stringify(result)).not.toMatch(/sourceText|includedText|currentPageImage/);
  });
});
