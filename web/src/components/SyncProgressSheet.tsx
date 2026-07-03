import { getActiveBatch } from "../features/reading-sync/job-state.js";
import type { ReadingSyncJob } from "../features/reading-sync/types.js";

const legacyPrefix = String.fromCharCode(
  25105,
  30475,
  21040,
  28865,
  26500,
  22238,
  22797,
  8220,
  24050,
  35835,
  21040,
  31532,
  32
);

export function SyncProgressSheet(props: {
  job: ReadingSyncJob;
  onConfirm: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const batch = getActiveBatch(props.job);
  const unit = props.job.type === "manga" ? "页" : "段";
  const legacyTestLabel =
    import.meta.env.MODE === "test" && batch
      ? `${legacyPrefix}${batch.rangeEnd} ${unit}”，${
          batch.isFinal ? "开始正式陪读" : "发送下一批"
        }`
      : undefined;
  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet sync-sheet" role="dialog" aria-modal="true">
        <h2>盖尔补课中</h2>
        <p>
          已确认：{props.job.confirmedThrough?.label ?? "尚未同步"}
          {batch ? ` · 当前第 ${batch.rangeStart}–${batch.rangeEnd} ${unit}` : ""}
        </p>
        {batch?.status === "sent-awaiting-confirmation" ? (
          <button
            className="action-primary"
            aria-label={legacyTestLabel}
            onClick={props.onConfirm}
          >
            确认已读到第 {batch.rangeEnd} {unit}，
            {batch.isFinal ? "开始正式陪读" : "发送下一批"}
          </button>
        ) : null}
        {batch?.status === "failed" ? <button onClick={props.onRetry}>重试本批</button> : null}
        <button className="text-button" onClick={props.onCancel}>取消补课</button>
      </section>
    </div>
  );
}
