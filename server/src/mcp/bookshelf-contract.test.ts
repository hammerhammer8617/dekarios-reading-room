import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import {
  BOOKSHELF_RESOURCE_URI,
  DEFAULT_SESSION_PREFERENCES,
  type ReadingDatabase
} from "@ss/shared";
import type { ReadingRepository } from "../repositories/reading-repository.js";
import { createMcpServerFromRepository } from "./server-factory.js";

class MemoryRepository implements ReadingRepository {
  database: ReadingDatabase = {
    schemaVersion: 7,
    sessions: [
      {
        id: "book-1",
        title: "侦破我的命案",
        type: "novel",
        genre: "mystery",
        status: "active",
        userCurrentPosition: { kind: "page", index: 91, label: "第 91 页" },
        assistantSyncedPosition: { kind: "page", index: 88, label: "第 88 页" },
        spoilerBoundary: { kind: "page", index: 91, label: "第 91 页" },
        liveReadingEnabled: false,
        sessionPreferences: structuredClone(DEFAULT_SESSION_PREFERENCES),
        sourceManifest: null,
        createdAt: "2026-08-19T10:00:00.000Z",
        updatedAt: "2026-08-19T12:00:00.000Z",
        lastReadAt: "2026-08-19T12:00:00.000Z"
      }
    ],
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
    return structuredClone(await change(this.database));
  }
}

describe("open_bookshelf MCP Apps contract", () => {
  it("links the advertised tool, exact result and isolated HTML resource end to end", async () => {
    const server = createMcpServerFromRepository(
      new MemoryRepository(),
      "<!doctype html><html><body>main room</body></html>",
      undefined,
      {
        bookshelfHtml:
          "<!doctype html><html><body><main data-bookshelf-static-v1>static bookshelf</main></body></html>",
        readingEndHtml: "<!doctype html><html><body>reading end</body></html>"
      }
    );
    const client = new Client({ name: "bookshelf-contract-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      const tool = tools.tools.find((candidate) => candidate.name === "open_bookshelf");
      expect(tool?._meta).toMatchObject({
        ui: { resourceUri: BOOKSHELF_RESOURCE_URI },
        "openai/outputTemplate": BOOKSHELF_RESOURCE_URI
      });
      expect(tool?.outputSchema?.required).toEqual(["view", "bookshelf"]);

      const result = await client.callTool({ name: "open_bookshelf", arguments: {} });
      expect(result.structuredContent).toMatchObject({
        view: "bookshelf",
        bookshelf: [
          {
            bookId: "book-1",
            title: "侦破我的命案",
            tavPosition: { label: "第 91 页" },
            sharedPosition: { label: "第 88 页" }
          }
        ]
      });

      const resource = await client.readResource({ uri: BOOKSHELF_RESOURCE_URI });
      expect(resource.contents).toContainEqual(
        expect.objectContaining({
          uri: BOOKSHELF_RESOURCE_URI,
          mimeType: "text/html;profile=mcp-app",
          text: expect.stringContaining("data-bookshelf-static-v1")
        })
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
