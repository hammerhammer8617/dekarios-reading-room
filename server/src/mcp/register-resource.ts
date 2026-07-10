import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READING_NEST_URI } from "./register-tools.js";

export const READING_NEST_RESOURCE_URIS = [
  READING_NEST_URI,
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
      index === 0 ? "S×S 小窝共读" : `S×S 小窝共读兼容资源 ${index}`,
      resourceUri,
      {
        description: "移动端优先的小说与漫画共读小窝",
        _meta: {
          ui: {
            csp: resourceCsp,
            prefersBorder: true
          },
          "openai/widgetCSP": openaiWidgetCsp,
          "openai/widgetDescription":
            "一个温暖的移动端共读小窝，用于阅读用户自己粘贴的小说文本或导入的漫画图片。"
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
                  "一个温暖的移动端共读小窝，用于阅读用户自己粘贴的小说文本或导入的漫画图片。",
                "openai/widgetPrefersBorder": true
              }
            }
          ]
        };
      }
    );
  }
}
