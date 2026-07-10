import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const workerUrl = new URL(requireEnv("WORKER_URL"));
const token = requireEnv("MCP_PATH_TOKEN");
const expectedBuildSha = requireEnv("EXPECTED_BUILD_SHA");
const resourceUri = "ui://ss-reading-nest/app-v22.html";
const client = new Client({ name: "ss-widget-deployment-smoke", version: "0.2.1" });

await client.connect(
  new StreamableHTTPClientTransport(new URL(`/mcp/${token}`, workerUrl.origin))
);

try {
  const healthResponse = await fetch(new URL("/health", workerUrl));
  assert(healthResponse.ok, `health returned ${healthResponse.status}`);
  const health = await healthResponse.json();
  assert(health.resourceVersion === "app-v22", "health resourceVersion is not app-v22");
  assert(health.buildSha === expectedBuildSha, "health buildSha does not match deployed commit");

  const tools = await client.listTools();
  const openTool = tools.tools.find((tool) => tool.name === "open_reading_nest");
  assert(openTool, "open_reading_nest is missing");
  assert(openTool._meta?.ui?.resourceUri === resourceUri, "standard resource URI is not app-v22");
  assert(openTool._meta?.["openai/outputTemplate"] === resourceUri, "ChatGPT resource URI is not app-v22");

  const resource = await client.readResource({ uri: resourceUri });
  const html = resource.contents.find((content) => content.uri === resourceUri)?.text;
  assert(typeof html === "string", "app-v22 resource returned no HTML");
  assert(html.includes("批注给盖尔（可选）"), "deployed widget is missing selected-text notes");
  assert(html.includes("reader-jump-toolbar"), "deployed widget is missing the in-flow jump toolbar");
  assert(!html.includes('aria-label="悬浮阅读跳转"'), "deployed widget still contains the overlay jump toolbar");

  console.log(JSON.stringify({
    ok: true,
    resourceVersion: health.resourceVersion,
    buildSha: health.buildSha,
    resourceUri,
    selectedTextNotes: true,
    inFlowJumpToolbar: true
  }));
} finally {
  await client.close();
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
