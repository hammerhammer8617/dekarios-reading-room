import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const workerUrl = new URL(requireEnv("WORKER_URL"));
const token = requireEnv("MCP_PATH_TOKEN");
const expectedBuildSha = requireEnv("EXPECTED_BUILD_SHA");
const health = await waitForDeployedHealth();
const widget = await waitForDeployedWidgets(health);

console.log(JSON.stringify({
  ok: true,
  resourceVersion: health.resourceVersion,
  buildSha: health.buildSha,
  resourceUri: widget.resourceUri,
  readingEndResourceUri: widget.readingEndResourceUri,
  readingEndTool: widget.readingEndTool,
  selectedTextNotes: true,
  inFlowJumpToolbar: true,
  casebookEntrance: true,
  casebookView: true
}));

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
        /^app-v\d+$/.test(lastHealth.resourceVersion) &&
        lastHealth.buildSha === expectedBuildSha
      ) {
        return lastHealth;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`deployed health did not converge: ${JSON.stringify(lastHealth)}`);
}

async function waitForDeployedWidgets(health) {
  const deadline = Date.now() + 60_000;
  const resourceUri = `ui://ss-reading-nest/${health.resourceVersion}.html`;
  let lastError;

  while (Date.now() < deadline) {
    const client = new Client({ name: "ss-widget-deployment-smoke", version: "0.2.1" });
    let connected = false;
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`/mcp/${token}`, workerUrl.origin))
      );
      connected = true;
      const tools = await client.listTools();
      const openTool = tools.tools.find((tool) => tool.name === "open_reading_nest");
      assert(openTool, "open_reading_nest is missing");
      assert(
        openTool._meta?.ui?.resourceUri === resourceUri,
        "standard resource URI does not match deployed health"
      );
      assert(
        openTool._meta?.["openai/outputTemplate"] === resourceUri,
        "ChatGPT resource URI does not match deployed health"
      );
      const readingEndTool = tools.tools.find(
        (tool) => tool.name === "render_reading_end_card_v3"
      );
      assert(readingEndTool, "render_reading_end_card_v3 is missing");
      const readingEndResourceUri = "ui://ss-reading-nest/reading-end-v3.html";
      assert(
        readingEndTool._meta?.ui?.resourceUri === readingEndResourceUri,
        "standard reading-end resource URI is stale"
      );
      assert(
        readingEndTool._meta?.["openai/outputTemplate"] === readingEndResourceUri,
        "ChatGPT reading-end resource URI is stale"
      );
      assert(
        JSON.stringify(readingEndTool.inputSchema?.required) === JSON.stringify(["snapshotId"]),
        "reading-end tool contract is not the authoritative snapshot-only schema"
      );

      const resource = await client.readResource({ uri: resourceUri });
      const html = resource.contents.find((content) => content.uri === resourceUri)?.text;
      assert(typeof html === "string", "deployed resource returned no HTML");
      assert(
        html.includes("批注给盖尔（可选）"),
        "deployed widget is missing selected-text notes"
      );
      assert(
        html.includes("reader-jump-toolbar"),
        "deployed widget is missing the in-flow jump toolbar"
      );
      assert(
        !html.includes('aria-label="悬浮阅读跳转"'),
        "deployed widget still contains the overlay jump toolbar"
      );
      assert(html.includes("共同推理"), "deployed widget is missing the casebook entrance");
      assert(
        html.includes("德卡里奥斯家的案件簿"),
        "deployed widget is missing the casebook view"
      );
      const readingEndResource = await client.readResource({ uri: readingEndResourceUri });
      const readingEndHtml = readingEndResource.contents.find(
        (content) => content.uri === readingEndResourceUri
      )?.text;
      assert(typeof readingEndHtml === "string", "deployed reading-end resource returned no HTML");
      assert(
        readingEndHtml.includes("data-reading-end-startup-fallback"),
        "deployed reading-end resource is missing its startup diagnostic"
      );
      assert(
        readingEndHtml.includes('data-reading-end-height-strategy="eager-compat-v3"'),
        "deployed reading-end resource is missing eager intrinsic-height recovery"
      );
      assert(
        readingEndHtml.includes("今天读到这里"),
        "deployed reading-end resource is missing the card UI"
      );
      assert(
        readingEndHtml.length > 1_000_000,
        "deployed reading-end resource appears truncated"
      );
      return {
        resourceUri,
        readingEndResourceUri,
        readingEndTool: readingEndTool.name
      };
    } catch (error) {
      lastError = error;
    } finally {
      if (connected) await client.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(
    `deployed widget did not converge: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
