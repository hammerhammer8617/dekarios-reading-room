import { useCallback, useEffect, useMemo, useState } from "react";
import { Boot } from "./Boot.js";
import { CasebookApp } from "./CasebookApp.js";
import {
  ReadingRoomSurface,
  type RoomOutput
} from "./components/ReadingRoomSurface.js";
import type { OpenOutput } from "./App.js";
import {
  callTool,
  initialToolResult,
  subscribeToolResult
} from "./bridge/host.js";
import { EpubImportBridge } from "./features/book-import/EpubImportBridge.js";
import { EpubSmokeLab } from "./features/book-import/EpubSmokeLab.js";

type ReadingRoomEntryProps = {
  smokeLabEnabled: boolean;
  casebookEnabled: boolean;
  initialOutput?: Record<string, unknown>;
};

const roomViews = new Set(["bookshelf", "reading_status", "reading_end"]);

export function ReadingRoomEntry({
  smokeLabEnabled,
  casebookEnabled,
  initialOutput
}: ReadingRoomEntryProps) {
  const [toolOutput, setToolOutput] = useState<Record<string, unknown> | undefined>(
    () => initialOutput ?? initialToolResult()?.structuredContent
  );
  const [resultSettled, setResultSettled] = useState(
    () => initialOutput !== undefined || initialToolResult() !== undefined
  );

  useEffect(() => {
    const unsubscribe = subscribeToolResult((result) => {
      const nextOutput = result.structuredContent;
      if (!isRoutableOutput(nextOutput)) return;
      setToolOutput(nextOutput);
      setResultSettled(true);
    });
    const fallbackTimer = window.setTimeout(() => setResultSettled(true), 1_500);

    return () => {
      unsubscribe();
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  if (smokeLabEnabled) return <EpubSmokeLab />;

  if (isRoomOutput(toolOutput)) {
    return <ReadingRoomSurface initialOutput={toolOutput} />;
  }

  const shouldOpenCasebook = casebookEnabled || toolOutput?.appView === "casebook";
  if (!resultSettled && !shouldOpenCasebook) return <ReadingRoomBootstrap />;

  return (
    <ReadingNestRoot
      casebookEnabled={shouldOpenCasebook}
      initialOutput={toolOutput as OpenOutput | undefined}
    />
  );
}

function ReadingNestRoot({
  casebookEnabled,
  initialOutput
}: {
  casebookEnabled: boolean;
  initialOutput?: OpenOutput;
}) {
  const [view, setView] = useState<"reading" | "casebook">(
    casebookEnabled ? "casebook" : "reading"
  );
  const [readingOutput, setReadingOutput] = useState<OpenOutput | undefined>(() =>
    casebookEnabled ? undefined : initialOutput
  );
  const [returningToReading, setReturningToReading] = useState(false);
  const openCasebook = useCallback(() => setView("casebook"), []);
  const loadReadingApp = useMemo(
    () => async () => {
      const module = await import("./App.js");
      return {
        App: () => (
          <module.App initialOutput={readingOutput} onOpenCasebook={openCasebook} />
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

function ReadingRoomBootstrap() {
  return (
    <main className="reading-room-bootstrap" role="status" aria-live="polite">
      <span aria-hidden="true">✦</span>
      <div>
        <strong>正在打开书架</strong>
        <p>稍等，盖尔正在把今天的书放到手边。</p>
      </div>
    </main>
  );
}

function isRoomOutput(value: unknown): value is RoomOutput & Record<string, unknown> {
  return isRecord(value) && typeof value.view === "string" && roomViews.has(value.view);
}

function isRoutableOutput(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return (
    isRoomOutput(value) ||
    value.appView === "casebook" ||
    Array.isArray(value.bookshelfSessions) ||
    Array.isArray(value.recentSessions) ||
    typeof value.sourceEndpointBase === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
