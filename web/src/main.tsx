import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReadingRoomEntry } from "./ReadingRoomEntry.js";
import { READING_NEST_BUILD_INFO } from "./build-info.js";
import "./styles/tokens.css";
import "./styles/app.css";

const rootElement = document.getElementById("root");
const smokeLabEnabled = new URLSearchParams(window.location.search).has("epub-smoke");
const casebookEnabled =
  new URLSearchParams(window.location.search).has("casebook") ||
  (window.openai?.toolOutput as { appView?: string } | undefined)?.appView === "casebook";
const initialOutput = window.openai?.toolOutput;

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ReadingRoomEntry
        smokeLabEnabled={smokeLabEnabled}
        casebookEnabled={casebookEnabled}
        initialOutput={isRecord(initialOutput) ? initialOutput : undefined}
      />
    </StrictMode>
  );
} else {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<main class="boot-diagnostics" role="alert"><strong>Dekarios reading room startup</strong><p>Missing app root. Please refresh the widget.</p><dl><div><dt>resourceVersion</dt><dd>${READING_NEST_BUILD_INFO.resourceVersion}</dd></div><div><dt>buildSha</dt><dd>${READING_NEST_BUILD_INFO.buildSha}</dd></div><div><dt>bootStage</dt><dd>missing-root</dd></div></dl></main>`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
