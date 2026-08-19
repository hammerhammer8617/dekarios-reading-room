import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
createApp().listen(port, () => {
  console.log(`德卡里奥斯家的书房 MCP server: http://localhost:${port}/mcp`);
});
