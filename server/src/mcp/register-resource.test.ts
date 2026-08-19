import { describe, expect, it, vi } from "vitest";

const registerAppResource = vi.fn();

vi.mock("@modelcontextprotocol/ext-apps/server", () => ({
  RESOURCE_MIME_TYPE: "text/html;profile=mcp-app",
  registerAppResource
}));

describe("registerReadingResource", () => {
  it("serves the current app-v36 template and cached compatibility templates", async () => {
    const {
      READING_NEST_RESOURCE_URIS,
      registerBookshelfResource,
      registerReadingEndResource,
      registerReadingResource
    } = await import("./register-resource.js");
    const { READING_NEST_URI } = await import("./register-tools.js");
    const { BOOKSHELF_RESOURCE_URI, READING_END_RESOURCE_URI } = await import("@ss/shared");

    registerReadingResource({} as never, "<html></html>", "https://reading-nest.example.workers.dev");
    registerBookshelfResource(
      {} as never,
      "<html><body>isolated bookshelf</body></html>"
    );
    registerReadingEndResource(
      {} as never,
      "<html><body>isolated end</body></html>",
      "https://reading-nest.example.workers.dev"
    );

    expect(READING_NEST_URI).toBe("ui://ss-reading-nest/app-v36.html");
    expect(READING_NEST_RESOURCE_URIS).toEqual([
      "ui://ss-reading-nest/app-v36.html",
      "ui://ss-reading-nest/app-v35.html",
      "ui://ss-reading-nest/app-v34.html",
      "ui://ss-reading-nest/app-v33.html",
      "ui://ss-reading-nest/app-v32.html",
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
    ]);
    expect(registerAppResource).toHaveBeenCalledTimes(20);

    for (const [index, expectedUri] of READING_NEST_RESOURCE_URIS.entries()) {
      const [, , uri, descriptor, loader] = registerAppResource.mock.calls[index];

      expect(uri).toBe(expectedUri);
      expect(descriptor._meta.ui.csp.connectDomains).toContain(
        "https://reading-nest.example.workers.dev"
      );
      expect(descriptor._meta["openai/widgetCSP"].connect_domains).toContain(
        "https://reading-nest.example.workers.dev"
      );

      const loaded = await loader();
      expect(loaded.contents[0].uri).toBe(expectedUri);
      expect(loaded.contents[0].text).toBe("<html></html>");
      expect(loaded.contents[0]._meta.ui.csp.connectDomains).toContain(
        "https://reading-nest.example.workers.dev"
      );
      expect(loaded.contents[0]._meta["openai/widgetCSP"].connect_domains).toContain(
        "https://reading-nest.example.workers.dev"
      );
    }

    const [, , bookshelfUri, bookshelfDescriptor, bookshelfLoader] =
      registerAppResource.mock.calls[18];
    expect(bookshelfUri).toBe(BOOKSHELF_RESOURCE_URI);
    expect(bookshelfDescriptor.description).toContain("最小、预渲染");
    const bookshelfLoaded = await bookshelfLoader();
    expect(bookshelfLoaded.contents[0].uri).toBe(BOOKSHELF_RESOURCE_URI);
    expect(bookshelfLoaded.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(bookshelfLoaded.contents[0].text).toContain("isolated bookshelf");
    expect(bookshelfLoaded.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
    expect(bookshelfLoaded.contents[0]._meta.ui.prefersBorder).toBe(false);

    const [, , endUri, endDescriptor, endLoader] = registerAppResource.mock.calls[19];
    expect(endUri).toBe(READING_END_RESOURCE_URI);
    expect(endDescriptor.description).toContain("最小、预渲染");
    const endLoaded = await endLoader();
    expect(endLoaded.contents[0].uri).toBe(READING_END_RESOURCE_URI);
    expect(endLoaded.contents[0].text).toContain("isolated end");
    expect(endLoaded.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
    expect(endLoaded.contents[0]._meta.ui.prefersBorder).toBe(false);
  });
});
