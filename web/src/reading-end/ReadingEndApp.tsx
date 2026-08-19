import { useEffect, useRef, useState } from "react";
import type { RenderReadingEndCardOutput } from "@ss/shared";
import { ReadingEndCard } from "./ReadingEndCard.js";
import type { ReadingEndHost, ReadingEndHostStatus } from "./host.js";

export function ReadingEndApp({ host }: { host: ReadingEndHost }) {
  const rootRef = useRef<HTMLElement>(null);
  const [output, setOutput] = useState<RenderReadingEndCardOutput>();
  const [status, setStatus] = useState<ReadingEndHostStatus>({ mode: "connecting" });

  useEffect(() => host.subscribeOutput(setOutput), [host]);
  useEffect(() => host.subscribeStatus(setStatus), [host]);
  useEffect(() => {
    host.setRoot(rootRef.current);
    return () => host.setRoot(null);
  }, [host, output]);

  return (
    <main ref={rootRef} className="reading-end-v1-root">
      {output ? (
        <ReadingEndCard snapshot={output.snapshot} />
      ) : (
        <ReadingEndDiagnostic status={status} />
      )}
    </main>
  );
}

function ReadingEndDiagnostic({ status }: { status: ReadingEndHostStatus }) {
  const isError = status.mode === "unavailable" || Boolean(status.error);
  return (
    <section className="reading-end-v1-diagnostic" role={isError ? "alert" : "status"}>
      <span aria-hidden="true">✦</span>
      <div>
        <strong>{isError ? "收尾卡没有安全地打开" : "正在取回今天的书页"}</strong>
        <p>{status.error ?? "等权威快照抵达后，卡片才会出现。"}</p>
      </div>
    </section>
  );
}
