import { useEffect, useMemo, useState } from "react";
import type {
  DurableThought,
  MysteryReadingCasebook,
  ReadingPosition
} from "@ss/shared";
import { callTool, requestReaderInline } from "../bridge/host.js";
import bookroomBackground from "../assets/reading-room/bookroom-background.webp";
import endBooksTea from "../assets/reading-room/end-books-tea.webp";
import endCinemaPopcorn from "../assets/reading-room/end-cinema-popcorn.webp";
import endGameNight from "../assets/reading-room/end-game-night.webp";
import endOrangeTree from "../assets/reading-room/end-orange-tree.webp";
import endSharedTableClose from "../assets/reading-room/end-shared-table-close.webp";
import endSharedTableWide from "../assets/reading-room/end-shared-table-wide.webp";
import "../styles/reading-room.css";

type ViewName = "bookshelf" | "reading_status" | "reading_end";

type BookSummary = {
  bookId: string;
  title: string;
  author?: string;
  genre: string;
  status: "active" | "completed";
  tavPosition: ReadingPosition;
  sharedPosition: ReadingPosition | null;
  spoilerBoundary: ReadingPosition | null;
  lastReadAt: string;
  lastNotionSyncedAt: string | null;
  latestThought?: DurableThought;
  openQuestionCount?: number;
  unsyncedThoughtCount?: number;
  casebookInProgress?: boolean;
  casebookItemCount?: number;
};

export type RoomOutput = {
  view?: ViewName;
  bookshelf?: BookSummary[];
  book?: BookSummary;
  latestThought?: DurableThought;
  openQuestionCount?: number;
  operationId?: string;
  tavThoughtCount?: number;
  galeThoughtCount?: number;
  sharedThoughtCount?: number;
  newQuestionCount?: number;
  latestTavThought?: DurableThought;
  latestGaleThought?: DurableThought;
  latestSharedThought?: DurableThought;
  latestQuestion?: DurableThought;
  progressSummary?: string;
  readingSummary?: string;
  tavThought?: string;
  galeThought?: string;
  openQuestion?: string;
  unsyncedThoughtCount?: number;
};

type BookDetails = {
  session: {
    id: string;
    title: string;
    author?: string;
    genre: string;
    status: "active" | "completed";
    userCurrentPosition: ReadingPosition;
    assistantSyncedPosition: ReadingPosition | null;
    spoilerBoundary?: ReadingPosition;
    lastReadAt: string;
    lastNotionSyncedAt?: string;
  };
  thoughts: DurableThought[];
  openQuestions: DurableThought[];
  unsyncedThoughtCount: number;
  casebook?: MysteryReadingCasebook;
};

const endBackgrounds = [
  endBooksTea,
  endCinemaPopcorn,
  endGameNight,
  endOrangeTree,
  endSharedTableClose,
  endSharedTableWide
];

const authorLabels = { tav: "塔芙", gale: "盖尔", shared: "我们" } as const;
const genreLabels: Record<string, string> = {
  novel: "小说",
  mystery: "推理",
  nonfiction: "非虚构",
  essay: "随笔",
  poetry: "诗歌",
  manga: "漫画",
  other: "其他"
};

export function ReadingRoomSurface({ initialOutput }: { initialOutput: RoomOutput }) {
  const [output, setOutput] = useState<RoomOutput>(initialOutput);
  const [details, setDetails] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setOutput(initialOutput);
    setDetails(null);
  }, [initialOutput]);

  async function openBookshelf() {
    setLoading(true);
    setError("");
    try {
      const result = await callTool("open_bookshelf", {});
      setOutput(result.structuredContent as RoomOutput);
      setDetails(null);
      await requestReaderInline();
    } catch {
      setError("书架暂时没有打开，再试一次就好。");
    } finally {
      setLoading(false);
    }
  }

  async function openBook(bookId: string) {
    setLoading(true);
    setError("");
    try {
      const result = await callTool("get_book_details", { bookId });
      setDetails(result.structuredContent as BookDetails);
      await requestReaderInline();
    } catch {
      setError("这本书的记录暂时没有读出来。");
    } finally {
      setLoading(false);
    }
  }

  async function closeDetail() {
    setDetails(null);
    await requestReaderInline();
  }

  if (output.view === "reading_status" && output.book) {
    return (
      <ReadingStatusCard
        book={output.book}
        latestThought={output.latestThought}
        openQuestionCount={output.openQuestionCount ?? 0}
        loading={loading}
        error={error}
        onOpenBookshelf={openBookshelf}
      />
    );
  }

  if (output.view === "reading_end" && output.book) {
    return <ReadingEndCard output={{ ...output, book: output.book }} onOpenBookshelf={openBookshelf} loading={loading} />;
  }

  return (
    <main className="reading-room" style={{ "--room-image": `url(${bookroomBackground})` } as React.CSSProperties}>
      <header className="room-hero">
        <div className="room-hero__shade" />
        <div className="room-hero__copy">
          <span className="room-kicker">Dekarios Reading Room</span>
          <h1>德卡里奥斯家的书房</h1>
          <p>我们共同读过的地方，都留在这里。</p>
        </div>
      </header>

      <section className="room-content" aria-busy={loading}>
        {details ? (
          <BookDetail details={details} onBack={closeDetail} />
        ) : (
          <Bookshelf books={output.bookshelf ?? []} onOpenBook={openBook} />
        )}
        {loading ? <p className="room-notice">正在翻找书页…</p> : null}
        {error ? <p className="room-notice room-notice--error">{error}</p> : null}
      </section>
    </main>
  );
}

function ReadingStatusCard({
  book,
  latestThought,
  openQuestionCount,
  loading,
  error,
  onOpenBookshelf
}: {
  book: BookSummary;
  latestThought?: DurableThought;
  openQuestionCount: number;
  loading: boolean;
  error: string;
  onOpenBookshelf: () => void;
}) {
  return (
    <article className="reading-status-card">
      <div className="status-mark" aria-hidden="true">✦</div>
      <div className="status-copy">
        <span className="room-kicker">共读已开始</span>
        <h1>《{book.title}》</h1>
        <p className="status-position">从 {book.tavPosition.label} 接着读</p>
        {latestThought ? (
          <blockquote>
            <b>{authorLabels[latestThought.author]}</b>
            <span>{latestThought.content}</span>
          </blockquote>
        ) : (
          <p className="status-muted">把你看到的书页拍给我就好。</p>
        )}
        <div className="status-footer">
          <span>{openQuestionCount > 0 ? `${openQuestionCount} 个问题仍亮着` : "先看看这一页会把我们带到哪里"}</span>
          <button type="button" onClick={onOpenBookshelf} disabled={loading}>查看书架</button>
        </div>
        {error ? <p className="room-notice room-notice--error">{error}</p> : null}
      </div>
    </article>
  );
}

function ReadingEndCard({
  output,
  onOpenBookshelf,
  loading
}: {
  output: RoomOutput & { book: BookSummary };
  onOpenBookshelf: () => void;
  loading: boolean;
}) {
  const seed = `${output.book.bookId}:${output.operationId ?? output.book.lastReadAt}`;
  const image = endBackgrounds[hash(seed) % endBackgrounds.length];
  const tavThought = output.tavThought ?? output.latestTavThought?.content;
  const galeThought = output.galeThought ?? output.latestGaleThought?.content;
  const openQuestion = output.openQuestion ?? output.latestQuestion?.content;
  const readingSummary = output.readingSummary ?? output.latestSharedThought?.content;
  return (
    <article className="reading-end-card" style={{ "--end-image": `url(${image})` } as React.CSSProperties}>
      <div className="end-card__paper">
        <span className="room-kicker">{formatDate(output.book.lastReadAt)}</span>
        <h1>今天读到这里</h1>
        <h2>《{output.book.title}》</h2>
        <p className="end-position">
          <b>读到</b>
          <span>{output.book.tavPosition.label}</span>
          {output.progressSummary ? <i>{output.progressSummary}</i> : null}
        </p>
        {readingSummary ? (
          <section className="end-summary">
            <b>今天读了什么</b>
            <p>{readingSummary}</p>
          </section>
        ) : null}
        {tavThought || galeThought ? (
          <div className="end-thoughts">
            {tavThought ? <p><b>塔芙留下</b><span>{tavThought}</span></p> : null}
            {galeThought ? <p><b>盖尔留下</b><span>{galeThought}</span></p> : null}
          </div>
        ) : null}
        {openQuestion ? (
          <p className="end-question"><span>留到下次</span>{openQuestion}</p>
        ) : null}
        <footer>
          <div>
            <span>{(output.tavThoughtCount ?? 0) + (output.galeThoughtCount ?? 0) + (output.sharedThoughtCount ?? 0)} 个新想法</span>
            <span> · </span>
            <span>{output.unsyncedThoughtCount ? `${output.unsyncedThoughtCount} 条待同步` : "已收进书页边缘"}</span>
          </div>
          <button type="button" onClick={onOpenBookshelf} disabled={loading}>回书房看看</button>
        </footer>
      </div>
    </article>
  );
}

function Bookshelf({ books, onOpenBook }: { books: BookSummary[]; onOpenBook: (id: string) => void }) {
  const active = books.filter((book) => book.status === "active");
  const completed = books.filter((book) => book.status === "completed");
  return (
    <>
      <section className="shelf-section">
        <div className="section-heading">
          <div><span className="room-kicker">正在共读</span><h2>手边的书</h2></div>
          <span>{active.length} 本</span>
        </div>
        <div className="room-book-grid">
          {active.map((book) => <BookCard key={book.bookId} book={book} onOpen={onOpenBook} />)}
          {active.length === 0 ? <p className="empty-shelf">下一次你发来书页时，这里就会多一本书。</p> : null}
        </div>
      </section>
      {completed.length > 0 ? (
        <section className="shelf-section shelf-section--quiet">
          <div className="section-heading"><div><span className="room-kicker">读完了</span><h2>留在架上的书</h2></div><span>{completed.length} 本</span></div>
          <div className="room-book-grid">{completed.map((book) => <BookCard key={book.bookId} book={book} onOpen={onOpenBook} />)}</div>
        </section>
      ) : null}
    </>
  );
}

function BookCard({ book, onOpen }: { book: BookSummary; onOpen: (id: string) => void }) {
  return (
    <button className="room-book-card" type="button" onClick={() => onOpen(book.bookId)}>
      <span className="room-book-spine" aria-hidden="true" />
      <span className="room-book-card__body">
        <span className="room-book-card__meta">{genreLabels[book.genre] ?? book.genre} · {formatDate(book.lastReadAt)}</span>
        <strong>《{book.title}》</strong>
        {book.author ? <em>{book.author}</em> : null}
        <span className="progress-pair"><b>塔芙</b>{book.tavPosition.label}<i>共同</i>{book.sharedPosition?.label ?? "尚未接上"}</span>
        {book.latestThought ? <span className="latest-thought"><b>{authorLabels[book.latestThought.author]}</b>{book.latestThought.content}</span> : null}
        <span className="book-flags">
          {(book.openQuestionCount ?? 0) > 0 ? <i>{book.openQuestionCount} 个问题</i> : null}
          {book.casebookInProgress ? <i>案件簿 {book.casebookItemCount}</i> : null}
          {(book.unsyncedThoughtCount ?? 0) > 0 ? <i>{book.unsyncedThoughtCount} 条待同步</i> : <i>已同步</i>}
        </span>
      </span>
      <span className="room-book-card__arrow" aria-hidden="true">›</span>
    </button>
  );
}

function BookDetail({ details, onBack }: { details: BookDetails; onBack: () => void }) {
  const { session, thoughts, openQuestions, casebook } = details;
  const recent = thoughts.slice(0, 16);
  return (
    <article className="book-detail">
      <button className="back-button" type="button" onClick={onBack}>← 书架</button>
      <header className="book-detail__header">
        <span className="room-kicker">{genreLabels[session.genre] ?? session.genre}</span>
        <h2>《{session.title}》</h2>
        {session.author ? <p>{session.author}</p> : null}
        <div className="detail-progress">
          <ProgressItem label="塔芙读到" value={session.userCurrentPosition.label} />
          <ProgressItem label="我们读到" value={session.assistantSyncedPosition?.label ?? "尚未接上"} />
          <ProgressItem label="剧透边界" value={session.spoilerBoundary?.label ?? session.userCurrentPosition.label} />
          <ProgressItem label="书页边缘" value={details.unsyncedThoughtCount ? `${details.unsyncedThoughtCount} 条待同步` : "已经同步"} />
        </div>
      </header>

      {casebook ? <Casebook casebook={casebook} /> : null}

      <section className="detail-section">
        <div className="section-heading"><div><span className="room-kicker">Thoughts</span><h3>我们把书读厚的地方</h3></div><span>{thoughts.length}</span></div>
        <div className="thought-list">
          {recent.map((thought) => <ThoughtRow key={thought.id} thought={thought} />)}
          {recent.length === 0 ? <p className="empty-shelf">还没有需要钉在书页边缘的想法。</p> : null}
        </div>
      </section>

      {openQuestions.length > 0 ? (
        <section className="detail-section questions-section">
          <div className="section-heading"><div><span className="room-kicker">Open questions</span><h3>还没合上的问题</h3></div><span>{openQuestions.length}</span></div>
          <ol>{openQuestions.map((question) => <li key={question.id}>{question.content}<small>{question.position?.label}</small></li>)}</ol>
        </section>
      ) : null}
    </article>
  );
}

function ProgressItem({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ThoughtRow({ thought }: { thought: DurableThought }) {
  return (
    <article className={`thought-row thought-row--${thought.author}`}>
      <div><b>{authorLabels[thought.author]}</b><span>{kindLabel(thought.kind)}</span><i>{statusLabel(thought.status)}</i></div>
      <p>{thought.content}</p>
      <small>{thought.position?.label ?? formatDate(thought.updatedAt)}</small>
    </article>
  );
}

function Casebook({ casebook }: { casebook: MysteryReadingCasebook }) {
  const activeHypotheses = casebook.hypotheses.filter((item) => item.status !== "rejected");
  return (
    <section className="casebook">
      <div className="section-heading"><div><span className="room-kicker">Casebook</span><h3>案件簿</h3></div><span>{casebook.clues.length} 条线索</span></div>
      {casebook.entities.length > 0 ? <RelationMap casebook={casebook} /> : null}
      <div className="casebook-columns">
        <section><h4>假说</h4>{activeHypotheses.length ? activeHypotheses.map((item) => <article key={item.id}><b>{item.title}</b><p>{item.summary}</p><small>{hypothesisLabel(item.status)}{item.confidence !== undefined ? ` · ${Math.round(item.confidence * 100)}%` : ""}</small></article>) : <p>还没有成形的假说。</p>}</section>
        <section><h4>接下来留意</h4>{casebook.observationTasks.filter((item) => item.status === "open").map((item) => <article key={item.id}><p>{item.prompt}</p><small>{item.position?.label ?? "下一页"}</small></article>)}</section>
      </div>
      {casebook.timeline.length > 0 ? <ol className="case-timeline">{casebook.timeline.map((item) => <li key={item.id}><b>{item.whenText}</b><span>{item.label}</span>{item.note ? <small>{item.note}</small> : null}</li>)}</ol> : null}
    </section>
  );
}

function RelationMap({ casebook }: { casebook: MysteryReadingCasebook }) {
  const entities = casebook.entities.slice(0, 10);
  const points = useMemo(() => {
    const radius = entities.length < 5 ? 92 : 118;
    return new Map(entities.map((entity, index) => {
      const angle = (Math.PI * 2 * index) / entities.length - Math.PI / 2;
      return [entity.id, { x: 180 + Math.cos(angle) * radius, y: 145 + Math.sin(angle) * radius }];
    }));
  }, [entities]);
  return (
    <div className="relation-map" role="img" aria-label="案件人物关系图">
      <svg viewBox="0 0 360 290">
        {casebook.relations.map((relation) => {
          const from = points.get(relation.fromEntityId);
          const to = points.get(relation.toEntityId);
          if (!from || !to) return null;
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;
          return <g key={relation.id}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`relation-line relation-line--${relation.status}`} /><text x={mx} y={my - 4} className="relation-label">{shorten(relation.label, 8)}</text></g>;
        })}
        {entities.map((entity) => {
          const point = points.get(entity.id)!;
          return <g key={entity.id}><circle cx={point.x} cy={point.y} r="29" className={`entity-node entity-node--${entity.status}`} /><text x={point.x} y={point.y + 4} textAnchor="middle" className="entity-label">{shorten(entity.name, 6)}</text></g>;
        })}
      </svg>
    </div>
  );
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) >>> 0;
  return result;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

function kindLabel(value: DurableThought["kind"]) {
  return ({ reaction: "反应", interpretation: "解释", disagreement: "分歧", question: "问题", prediction: "预测", connection: "连接", clue: "线索" } as const)[value];
}

function statusLabel(value: DurableThought["status"]) {
  return ({ open: "仍保留", revised: "已修正", resolved: "已回答", rejected: "已推翻" } as const)[value];
}

function hypothesisLabel(value: string) {
  return ({ active: "推理中", supported: "证据增强", rejected: "已推翻", solved: "已解开" } as Record<string, string>)[value] ?? value;
}

function shorten(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
