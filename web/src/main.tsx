import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Boot } from "./Boot.js";
import { EpubImportBridge } from "./features/book-import/EpubImportBridge.js";
import { EpubSmokeLab } from "./features/book-import/EpubSmokeLab.js";
import { READING_NEST_BUILD_INFO } from "./build-info.js";
import "./styles/tokens.css";
import "./styles/app.css";

const rootElement = document.getElementById("root");
const smokeLabEnabled = new URLSearchParams(window.location.search).has("epub-smoke");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      {smokeLabEnabled ? (
        <EpubSmokeLab />
      ) : (
        <>
          <Boot />
          <EpubImportBridge />
        </>
      )}
    </StrictMode>
  );
} else {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<main class="boot-diagnostics" role="alert"><strong>SxS reading nest startup</strong><p>Missing app root. Please refresh the widget.</p><dl><div><dt>resourceVersion</dt><dd>${READING_NEST_BUILD_INFO.resourceVersion}</dd></div><div><dt>buildSha</dt><dd>${READING_NEST_BUILD_INFO.buildSha}</dd></div><div><dt>bootStage</dt><dd>missing-root</dd></div></dl></main>`
  );
}
