import type { ReadingEndSnapshot } from "@ss/shared";
import endBooksTea from "../assets/reading-room/end-books-tea.webp";
import endCinemaPopcorn from "../assets/reading-room/end-cinema-popcorn.webp";
import endGameNight from "../assets/reading-room/end-game-night.webp";
import endOrangeTree from "../assets/reading-room/end-orange-tree.webp";
import endSharedTableClose from "../assets/reading-room/end-shared-table-close.webp";
import endSharedTableWide from "../assets/reading-room/end-shared-table-wide.webp";

const backgrounds = [
  endBooksTea,
  endCinemaPopcorn,
  endGameNight,
  endOrangeTree,
  endSharedTableClose,
  endSharedTableWide
];

const syncLabels: Record<ReadingEndSnapshot["notionSyncStatus"], string> = {
  synced: "已同步到《书页边缘》",
  pending: "《书页边缘》待同步",
  not_requested: "本次没有待同步内容"
};

export function ReadingEndCard({ snapshot }: { snapshot: ReadingEndSnapshot }) {
  const background = backgrounds[stableHash(snapshot.id) % backgrounds.length];
  return (
    <article
      className="reading-end-v1"
      data-testid="reading-end-card"
      style={{ "--reading-end-image": `url(${background})` } as React.CSSProperties}
    >
      <div className="reading-end-v1__image" aria-hidden="true" />
      <div className="reading-end-v1__paper">
        <header>
          <time dateTime={snapshot.createdAt}>{formatDate(snapshot.createdAt)}</time>
          <p>今天读到这里</p>
          <h1>《{snapshot.title}》</h1>
          <span className="reading-end-v1__position">{snapshot.positionLabel}</span>
        </header>

        <CardSection label="读到哪里" value={snapshot.progressSummary} />
        <CardSection label="今天读了什么" value={snapshot.readingSummary} emphasis />

        {snapshot.tavThought ? (
          <CardSection label="塔芙留下" value={snapshot.tavThought} tone="tav" />
        ) : null}
        {snapshot.galeThought ? (
          <CardSection label="盖尔留下" value={snapshot.galeThought} tone="gale" />
        ) : null}
        {snapshot.openQuestion ? (
          <CardSection label="留到下次" value={snapshot.openQuestion} tone="question" />
        ) : null}

        <footer>
          <span>{snapshot.thoughtCount} 个本次想法</span>
          <span aria-hidden="true">✦</span>
          <span>{syncLabels[snapshot.notionSyncStatus]}</span>
        </footer>
      </div>
    </article>
  );
}

function CardSection({
  label,
  value,
  emphasis = false,
  tone
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "tav" | "gale" | "question";
}) {
  const classNames = [
    "reading-end-v1__section",
    emphasis ? "reading-end-v1__section--emphasis" : "",
    tone ? `reading-end-v1__section--${tone}` : ""
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={classNames}>
      <h2>{label}</h2>
      <p>{value}</p>
    </section>
  );
}

function stableHash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
