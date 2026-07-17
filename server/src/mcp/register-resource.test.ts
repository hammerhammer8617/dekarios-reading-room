import { describe, expect, it, vi } from "vitest";

const registerAppResource = vi.fn();

vi.mock("@modelcontextprotocol/ext-apps/server", () => ({
  RESOURCE_MIME_TYPE: "text/html+skybridge",
  registerAppResource
}));

describe("registerReadingResource", () => {
  it("serves the current app-v30 template and cached compatibility templates", async () => {
    const {
      READING_NEST_RESOURCE_URIS,
      registerReadingResource
    } = await import("./register-resource.js");
    const { READING_NEST_URI } = await import("./register-tools.js");

    registerReadingResource({} as never, "<html></html>", "https://reading-nest.example.workers.dev");

    expect(READING_NEST_URI).toBe("ui://ss-reading-nest/app-v30.html");
    expect(READING_NEST_RESOURCE_URIS).toEqual([
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
    expect(registerAppResource).toHaveBeenCalledTimes(12);

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
  });
});
