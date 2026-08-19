import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadingRepository } from "../repositories/reading-repository.js";
import { ReadingService } from "../services/reading-service.js";
import { ReadingRoomService } from "../services/reading-room-service.js";
import type { CloudSourceService } from "../services/cloud-source-service.js";
import { registerReadingResource } from "./register-resource.js";
import { registerReadingTools } from "./register-tools.js";
import { registerReadingRoomTools } from "./register-reading-room-tools.js";

export function createMcpServerFromRepository(
  repository: ReadingRepository,
  widgetHtml: string,
  cloudSourceService?: CloudSourceService,
  options: { sourceEndpointBase?: string; workerOrigin?: string } = {}
) {
  const server = new McpServer(
    {
      name: "德卡里奥斯家的书房",
      version: "0.3.0"
    },
    {
      instructions:
        "When Tav starts shared reading or sends a book-page photo in reading context, call get_or_start_book_context first, discuss only supplied pages within the spoiler boundary, then call record_reading_turn for durable progress or attributed thoughts. Use record_casebook_update only for mystery evidence. Never treat work screenshots, ads, chats, or film frames as book pages. Render one compact start/end card; open the full bookshelf only on explicit request. prepare_notion_sync never proves a Notion write succeeded."
    }
  );
  const service = new ReadingService(repository);
  const roomService = new ReadingRoomService(repository);
  registerReadingResource(server, widgetHtml, options.workerOrigin);
  registerReadingRoomTools(server, roomService);
  registerReadingTools(server, service, cloudSourceService, options);
  return server;
}
