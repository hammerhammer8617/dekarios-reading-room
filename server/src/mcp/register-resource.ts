import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READING_NEST_URI } from "./register-tools.js";

export const READING_NEST_RESOURCE_URIS = [
  READING_NEST_URI,
  "ui://ss-reading-nest/app-v31.html",
  "ui://ss-reading-nest/app-v30.html",
  "ui://ss-reading-nest/app-v29.html",
  "ui://ss-reading-nest/app-v28.html",
  "ui://ss-reading-nest/app-v27.html",
  "ui://ss-reading-nest/app-v26.html",
  "ui://ss-reading-nest/app-v25.html",
  "ui://ss-reading-nest/app-v24.html",
  "ui://ss-reading-nest/app-v23.html",
  "ui://ss-reading-nest/app-v22.html",
  "ui://ss-reading-nest/app-v21.html",
  "ui://ss-reading-nest/app-v20.html",
  "ui://ss-reading-nest/app-v19.html"
] as const;

export function registerReadingResource(server: McpServer, widgetHtml: string, workerOrigin?: string) {
  const connectDomains = [workerOrigin ?? "http://localhost:8787"];
  const resourceCsp = {
    connectDomains,
    resourceDomains: []
  };
  const openaiWidgetCsp = {
    connect_domains: connectDomains,
    resource_domains: []
  };

  for (const [index, resourceUri] of READING_NEST_RESOURCE_URIS.entries()) {
    registerAppResource(
      server,
      index === 0 ? "德卡里奥斯家的书房" : `德卡里奥斯家的书房兼容资源 ${index}`,
      resourceUri,
      {
        description: "移动端优先的共读书房与共同推理案件簿",
        _meta: {
          ui: {
            csp: resourceCsp,
            prefersBorder: true
          },
          "openai/widgetCSP": openaiWidgetCsp,
          "openai/widgetDescription":
            "一个私密的移动端共读书房与案件簿，用于阅读用户提供的作品、记录案情并整理案件结构图。"
        }
      },
      async () => {
        return {
          contents: [
            {
              uri: resourceUri,
              mimeType: RESOURCE_MIME_TYPE,
              text: widgetHtml,
              _meta: {
                ui: {
                  csp: resourceCsp,
                  prefersBorder: true
                },
                "openai/widgetCSP": openaiWidgetCsp,
                "openai/widgetDescription":
                  "一个私密的移动端共读书房与案件簿，用于阅读用户提供的作品、记录案情并整理案件结构图。",
                "openai/widgetPrefersBorder": true
              }
            }
          ]
        };
      }
    );
  }
}
