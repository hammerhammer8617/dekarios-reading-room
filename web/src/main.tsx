import { StrictMode, useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Boot } from "./Boot.js";
import { CasebookApp } from "./CasebookApp.js";
import {
  ReadingRoomSurface,
  type RoomOutput
} from "./components/ReadingRoomSurface.js";
import type { OpenOutput } from "./App.js";
import { callTool } from "./bridge/host.js";
import { EpubImportBridge } from "./features/book-import/EpubImportBridge.js";
import { EpubSmokeLab } from "./features/book-import/EpubSmokeLab.js";
import { READING_NEST_BUILD_INFO } from "./build-info.js";
import "./styles/tokens.css";
import "./styles/app.css";

const rootElement = document.getElementById("root");
const smokeLabEnabled = new URLSearchParams(window.location.search).has("epub-smoke");
const casebookEnabled =
  new URLSearchParams(window.location.search).has("casebook") ||
  (window.openai?.toolOutput as { appView?: string } | undefined)?.appView === "casebook";
const roomOutput = window.openai?.toolOutput as RoomOutput | undefined;
const readingRoomEnabled =
  roomOutput?.view === "bookshelf" ||
  roomOutput?.view === "reading_status" ||
  roomOutput?.view === "reading_end";

function ReadingNestRoot() {
  const [view, setView] = useState<"reading" | "casebook">(
    casebookEnabled ? "casebook" : "reading"
  );
  const [readingOutput, setReadingOutput] = useState<OpenOutput | undefined>(() =>
    casebookEnabled ? undefined : (window.openai?.toolOutput as OpenOutput | undefined)
  );
  const [returningToReading, setReturningToReading] = useState(false);
  const openCasebook = useCallback(() => setView("casebook"), []);
  const loadReadingApp = useMemo(
    () => async () => {
      const module = await import("./App.js");
      return {
        App: () => (
          <module.App
            initialOutput={readingOutput}
            onOpenCasebook={openCasebook}
          />
        )
      };
    },
    [openCasebook, readingOutput]
  );

  const returnToReading = useCallback(async () => {
    if (returningToReading) return;
    setReturningToReading(true);
    try {
      const result = await callTool("open_reading_nest", {});
      setReadingOutput((result.structuredContent ?? {}) as OpenOutput);
    } catch {
      setReadingOutput({});
    } finally {
      setReturningToReading(false);
      setView("reading");
    }
  }, [returningToReading]);

  if (view === "casebook") {
    return (
      <CasebookApp
        onBackToReading={returnToReading}
        returningToReading={returningToReading}
      />
    );
  }

  return (
    <>
      <Boot loadApp={loadReadingApp} />
      <EpubImportBridge />
    </>
  );
}

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      {smokeLabEnabled ? (
        <EpubSmokeLab />
      ) : readingRoomEnabled && roomOutput ? (
        <ReadingRoomSurface initialOutput={roomOutput} />
      ) : (
        <ReadingNestRoot />
      )}
    </StrictMode>
  );
} else {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<main class="boot-diagnostics" role="alert"><strong>Dekarios reading room startup</strong><p>Missing app root. Please refresh the widget.</p><dl><div><dt>resourceVersion</dt><dd>${READING_NEST_BUILD_INFO.resourceVersion}</dd></div><div><dt>buildSha</dt><dd>${READING_NEST_BUILD_INFO.buildSha}</dd></div><div><dt>bootStage</dt><dd>missing-root</dd></div></dl></main>`
  );
}
