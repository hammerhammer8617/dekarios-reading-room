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
  bookshelfResourceUri: widget.bookshelfResourceUri,
  bookshelfTool: widget.bookshelfTool,
  bookshelfCount: widget.bookshelfCount,
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
        (tool) => tool.name === "render_reading_end_card_v4"
      );
      assert(readingEndTool, "render_reading_end_card_v4 is missing");
      const readingEndResourceUri = "ui://ss-reading-nest/reading-end-v4.html";
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
      const legacyBookshelfTool = tools.tools.find((tool) => tool.name === "open_bookshelf");
      assert(legacyBookshelfTool, "legacy open_bookshelf compatibility tool is missing");
      assert(
        JSON.stringify(legacyBookshelfTool._meta?.ui?.visibility) === JSON.stringify(["app"]),
        "legacy open_bookshelf must remain app-only"
      );
      const bookshelfToolName = "open_bookshelf_v2";
      const bookshelfTool = tools.tools.find((tool) => tool.name === bookshelfToolName);
      assert(bookshelfTool, `${bookshelfToolName} is missing`);
      const bookshelfResourceUri = "ui://ss-reading-nest/bookshelf-static-v2.html";
      assert(
        bookshelfTool._meta?.ui?.resourceUri === bookshelfResourceUri,
        "standard bookshelf resource URI is stale"
      );
      assert(
        bookshelfTool._meta?.["ui/resourceUri"] === bookshelfResourceUri,
        "top-level MCP Apps bookshelf resource URI is stale"
      );
      assert(
        JSON.stringify(bookshelfTool._meta?.ui?.visibility) ===
          JSON.stringify(["model", "app"]),
        "versioned bookshelf tool must be visible to model and app"
      );
      assert(
        bookshelfTool._meta?.["openai/outputTemplate"] === bookshelfResourceUri,
        "ChatGPT bookshelf resource URI is stale"
      );
      assert(
        Array.isArray(bookshelfTool.outputSchema?.required) &&
          bookshelfTool.outputSchema.required.includes("view") &&
          bookshelfTool.outputSchema.required.includes("bookshelf"),
        "bookshelf tool is missing its complete output schema"
      );

      const bookshelfResult = await client.callTool({ name: bookshelfToolName, arguments: {} });
      assert(
        bookshelfResult.structuredContent?.view === "bookshelf",
        `${bookshelfToolName} did not return the bookshelf view`
      );
      assert(
        Array.isArray(bookshelfResult.structuredContent?.bookshelf),
        `${bookshelfToolName} did not return a bookshelf array`
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
      const bookshelfResource = await client.readResource({ uri: bookshelfResourceUri });
      const bookshelfContent = bookshelfResource.contents.find(
        (content) => content.uri === bookshelfResourceUri
      );
      const bookshelfHtml = bookshelfContent?.text;
      assert(typeof bookshelfHtml === "string", "deployed bookshelf resource returned no HTML");
      assert(
        bookshelfContent?.mimeType === "text/html;profile=mcp-app",
        "deployed bookshelf resource has the wrong MCP Apps MIME type"
      );
      assert(
        bookshelfHtml.includes("data-bookshelf-static-v2"),
        "deployed bookshelf resource is missing its pre-rendered static shell"
      );
      assert(
        bookshelfHtml.includes('data-bookshelf-height-strategy="raw-postmessage-v2"'),
        "deployed bookshelf resource is missing raw intrinsic-height recovery"
      );
      assert(
        bookshelfHtml.includes("ChatGPT 已经选择并渲染了 open_bookshelf_v2 的 UI resource"),
        "deployed bookshelf resource is missing the visible binding diagnostic"
      );
      assert(
        bookshelfHtml.length > 4_000 && bookshelfHtml.length < 50_000,
        "deployed bookshelf resource is outside the stop-loss size budget"
      );
      const readingEndResource = await client.readResource({ uri: readingEndResourceUri });
      const readingEndHtml = readingEndResource.contents.find(
        (content) => content.uri === readingEndResourceUri
      )?.text;
      assert(typeof readingEndHtml === "string", "deployed reading-end resource returned no HTML");
      assert(
        readingEndHtml.includes("data-reading-end-static-v4"),
        "deployed reading-end resource is missing its pre-rendered static shell"
      );
      assert(
        readingEndHtml.includes('data-reading-end-height-strategy="raw-postmessage-v4"'),
        "deployed reading-end resource is missing raw intrinsic-height recovery"
      );
      assert(
        readingEndHtml.includes("今天读到这里"),
        "deployed reading-end resource is missing the card UI"
      );
      assert(
        readingEndHtml.length > 4_000 && readingEndHtml.length < 50_000,
        "deployed reading-end resource is outside the stop-loss size budget"
      );
      return {
        resourceUri,
        bookshelfResourceUri,
        bookshelfTool: bookshelfTool.name,
        bookshelfCount: bookshelfResult.structuredContent.bookshelf.length,
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
