import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Boot } from "./Boot.js";
import { EpubImportBridge } from "./features/book-import/EpubImportBridge.js";
import "./styles/tokens.css";
import "./styles/app.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <Boot />
      <EpubImportBridge />
    </StrictMode>
  );
} else {
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<main class="boot-diagnostics" role="alert"><strong>SxS reading nest startup</strong><p>Missing app root. Please refresh the widget.</p><dl><div><dt>resourceVersion</dt><dd>app-v19</dd></div><div><dt>bootStage</dt><dd>missing-root</dd></div></dl></main>'
  );
}
