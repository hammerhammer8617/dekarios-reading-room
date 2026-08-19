import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READING_NEST_URI } from "./register-tools.js";

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
  registerAppResource(
    server,
    "德卡里奥斯家的书房",
    READING_NEST_URI,
    {
      description: "移动端优先的共读书架、思考时间线与推理案件簿",
      _meta: {
        ui: {
          csp: resourceCsp,
          prefersBorder: true
        },
        "openai/widgetCSP": openaiWidgetCsp,
        "openai/widgetDescription":
          "德卡里奥斯家的移动端共读书房：查看书架、双方思考、开放问题、推理案件簿，以及今天读到这里的收尾卡。"
      }
    },
    async () => {
      return {
        contents: [
          {
            uri: READING_NEST_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: widgetHtml,
            _meta: {
              ui: {
                csp: resourceCsp,
                prefersBorder: true
              },
              "openai/widgetCSP": openaiWidgetCsp,
              "openai/widgetDescription":
                "德卡里奥斯家的移动端共读书房：查看书架、双方思考、开放问题、推理案件簿，以及今天读到这里的收尾卡。",
              "openai/widgetPrefersBorder": true
            }
          }
        ]
      };
    }
  );
}
