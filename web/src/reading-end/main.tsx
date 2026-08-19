import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReadingEndApp } from "./ReadingEndApp.js";
import { createReadingEndHost } from "./host.js";
import "./reading-end.css";

const rootElement = document.getElementById("reading-end-root");
const host = createReadingEndHost();

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ReadingEndApp host={host} />
    </StrictMode>
  );
}
