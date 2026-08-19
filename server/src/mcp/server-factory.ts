import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READING_NEST_APP_VERSION } from "@ss/shared";
import type { ReadingRepository } from "../repositories/reading-repository.js";
import { ReadingService } from "../services/reading-service.js";
import { ReadingRoomService } from "../services/reading-room-service.js";
import { CasebookService } from "../services/casebook-service.js";
import type { CloudSourceService } from "../services/cloud-source-service.js";
import { registerReadingResource } from "./register-resource.js";
import { registerReadingTools } from "./register-tools.js";
import { registerReadingRoomTools } from "./register-reading-room-tools.js";
import { registerCasebookTools } from "./register-casebook-tools.js";

export function createMcpServerFromRepository(
  repository: ReadingRepository,
  widgetHtml: string,
  cloudSourceService?: CloudSourceService,
  options: { sourceEndpointBase?: string; workerOrigin?: string } = {}
) {
  const server = new McpServer({
    name: "德卡里奥斯家的书房",
    version: READING_NEST_APP_VERSION
  });
  const service = new ReadingService(repository);
  const readingRoomService = new ReadingRoomService(repository);
  const casebookService = new CasebookService(repository);
  registerReadingResource(server, widgetHtml, options.workerOrigin);
  registerReadingTools(server, service, cloudSourceService, options);
  registerReadingRoomTools(server, readingRoomService);
  registerCasebookTools(server, casebookService);
  return server;
}
