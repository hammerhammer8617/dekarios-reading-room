import { describe, expect, it, vi } from "vitest";

const registerAppResource = vi.fn();

vi.mock("@modelcontextprotocol/ext-apps/server", () => ({
  RESOURCE_MIME_TYPE: "text/html;profile=mcp-app",
  registerAppResource
}));

describe("registerReadingResource", () => {
  it("serves the current app-v38 template and cached compatibility templates", async () => {
    const {
      READING_NEST_RESOURCE_URIS,
      registerBookshelfResource,
      registerReadingEndResource,
      registerReadingResource
    } = await import("./register-resource.js");
    const { READING_NEST_URI } = await import("./register-tools.js");
    const {
      BOOKSHELF_RESOURCE_URI,
      OLDEST_BOOKSHELF_RESOURCE_URI,
      PREVIOUS_BOOKSHELF_RESOURCE_URI,
      PREVIOUS_READING_END_RESOURCE_URI,
      READING_END_RESOURCE_URI
    } = await import("@ss/shared");

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

    expect(READING_NEST_URI).toBe("ui://ss-reading-nest/app-v38.html");
    expect(READING_NEST_RESOURCE_URIS).toEqual([
      "ui://ss-reading-nest/app-v38.html",
      "ui://ss-reading-nest/app-v37.html",
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
    expect(registerAppResource).toHaveBeenCalledTimes(25);

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
      registerAppResource.mock.calls[20];
    expect(bookshelfUri).toBe(BOOKSHELF_RESOURCE_URI);
    expect(bookshelfDescriptor.description).toContain("轻量、可交互");
    const bookshelfLoaded = await bookshelfLoader();
    expect(bookshelfLoaded.contents[0].uri).toBe(BOOKSHELF_RESOURCE_URI);
    expect(bookshelfLoaded.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(bookshelfLoaded.contents[0].text).toContain("isolated bookshelf");
    expect(bookshelfLoaded.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
    expect(bookshelfLoaded.contents[0]._meta.ui.prefersBorder).toBe(false);

    const [, , previousBookshelfUri, , previousBookshelfLoader] =
      registerAppResource.mock.calls[21];
    expect(previousBookshelfUri).toBe(PREVIOUS_BOOKSHELF_RESOURCE_URI);
    const previousBookshelfLoaded = await previousBookshelfLoader();
    expect(previousBookshelfLoaded.contents[0].uri).toBe(PREVIOUS_BOOKSHELF_RESOURCE_URI);
    expect(previousBookshelfLoaded.contents[0].text).toContain("isolated bookshelf");

    const [, , oldestBookshelfUri, , oldestBookshelfLoader] =
      registerAppResource.mock.calls[22];
    expect(oldestBookshelfUri).toBe(OLDEST_BOOKSHELF_RESOURCE_URI);
    const oldestBookshelfLoaded = await oldestBookshelfLoader();
    expect(oldestBookshelfLoaded.contents[0].uri).toBe(OLDEST_BOOKSHELF_RESOURCE_URI);
    expect(oldestBookshelfLoaded.contents[0].text).toContain("isolated bookshelf");

    const [, , endUri, endDescriptor, endLoader] = registerAppResource.mock.calls[23];
    expect(endUri).toBe(READING_END_RESOURCE_URI);
    expect(endDescriptor.description).toContain("预渲染并内嵌底图");
    const endLoaded = await endLoader();
    expect(endLoaded.contents[0].uri).toBe(READING_END_RESOURCE_URI);
    expect(endLoaded.contents[0].text).toContain("isolated end");
    expect(endLoaded.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
    expect(endLoaded.contents[0]._meta.ui.prefersBorder).toBe(false);

    const [, , previousEndUri, , previousEndLoader] = registerAppResource.mock.calls[24];
    expect(previousEndUri).toBe(PREVIOUS_READING_END_RESOURCE_URI);
    const previousEndLoaded = await previousEndLoader();
    expect(previousEndLoaded.contents[0].uri).toBe(PREVIOUS_READING_END_RESOURCE_URI);
    expect(previousEndLoaded.contents[0].text).toContain("isolated end");
  });
});
