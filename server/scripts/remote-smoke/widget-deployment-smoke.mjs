import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const workerUrl = new URL(requireEnv("WORKER_URL"));
const token = requireEnv("MCP_PATH_TOKEN");
const expectedBuildSha = requireEnv("EXPECTED_BUILD_SHA");
const resourceUri = "ui://ss-reading-nest/app-v22.html";
const client = new Client({ name: "ss-widget-deployment-smoke", version: "0.2.1" });
let connected = false;

try {
  const health = await waitForDeployedHealth();
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`/mcp/${token}`, workerUrl.origin))
  );
  connected = true;

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
  if (connected) await client.close();
}

async function waitForDeployedHealth() {
  const deadline = Date.now() + 60_000;
  let lastHealth;

  while (Date.now() < deadline) {
    const healthUrl = new URL("/health", workerUrl);
    healthUrl.searchParams.set("deployment-check", String(Date.now()));
    const response = await fetch(healthUrl, { cache: "no-store" });
    if (response.ok) {
      lastHealth = await response.json();
      if (
        lastHealth.resourceVersion === "app-v22" &&
        lastHealth.buildSha === expectedBuildSha
      ) {
        return lastHealth;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`deployed health did not converge: ${JSON.stringify(lastHealth)}`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
