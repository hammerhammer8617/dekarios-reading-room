import { useEffect, useRef, useState } from "react";
import type { CompanionComment, ReadingSession } from "@ss/shared";
import type {
  ParsedBookChapter,
  ParsedBookResource
} from "../features/book-import/types.js";
import {
  activeImportedBookMatchesChunks,
  getActiveImportedBook
} from "../features/book-import/active-imported-book.js";
import { FootnotedChapter } from "../features/book-reader/FootnotedChapter.js";
import { useHorizontalPaging } from "../hooks/useHorizontalPaging.js";
import type { CompanionLayout } from "../hooks/useReadingHostLayout.js";
import {
  CompanionDock,
  type PendingCompanionCommentDraft
} from "../components/CompanionDock.js";
import { ReaderHeader } from "../components/ReaderHeader.js";
import { ReaderActions } from "../components/ReaderActions.js";
import { ReadingSyncStatus } from "../components/ReadingSyncStatus.js";

export function NovelReader(props: {
  session: ReadingSession;
  chunks: string[];
  structuredChapter?: ParsedBookChapter;
  structuredResources?: ParsedBookResource[];
  onPosition: (index: number) => void;
  onLook: (currentText: string, selectedText: string) => void;
  onSaveQuote: (content: string) => void;
  onFinish: () => void;
  onBack: () => void;
  onFullscreen: () => void;
  fullscreenLabel?: string;
  immersive?: boolean;
  onSettings: () => void;
  onMore: () => void;
  companionComments: CompanionComment[];
  companionLoading: boolean;
  companionError?: string;
  companionLayout: CompanionLayout;
  companionLayoutRevision: number;
  syncRequestInFlight: boolean;
  canRequestPip: boolean;
  onRequestPip: () => void;
  pendingCommentDraft?: PendingCompanionCommentDraft | null;
  pendingCommentSaving?: boolean;
  onSavePendingComment?: (text: string) => void;
  onClearCompanionComments: () => void;
  initialScrollTop: number;
  onScrollPosition: (scrollTop: number) => void;
}) {
  const importedBook = activeImportedBookMatchesChunks(props.chunks)
    ? getActiveImportedBook()
    : null;
  const total = importedBook?.chapters.length ?? props.chunks.length;
  const index = Math.max(
    0,
    Math.min(Math.max(0, total - 1), props.session.userCurrentPosition.index - 1)
  );
  const structuredChapter = props.structuredChapter ?? importedBook?.chapters[index];
  const structuredResources = props.structuredResources ?? importedBook?.resources;
  const current = structuredChapter?.text ?? props.chunks[index] ?? "";
  const [selected, setSelected] = useState("");
  const previous = () => props.onPosition(Math.max(1, index));
  const next = () => props.onPosition(Math.min(total, index + 2));
  const swipe = useHorizontalPaging(previous, next);
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = props.initialScrollTop;
  }, [index, props.companionLayoutRevision]);

  return (
    <main
      className={`reader-shell reader-with-dock companion-layout-${props.companionLayout}${
        props.immersive ? " reader-immersive" : ""
      }`}
    >
      <ReaderHeader
        title={props.session.title}
        progress={
          structuredChapter
            ? structuredChapter.title
            : `第 ${index + 1} 段 / 共 ${total} 段`
        }
        fullscreenLabel={props.fullscreenLabel}
        onBack={props.onBack}
        onFullscreen={props.onFullscreen}
        onSettings={props.onSettings}
        onMore={props.onMore}
      />
      <ReadingSyncStatus session={props.session} />
      <div className="reader-workspace">
        <section
          ref={scrollRef}
          className="reader-scroll novel-scroll"
          {...swipe}
          onScroll={(event) => props.onScrollPosition(event.currentTarget.scrollTop)}
          onMouseUp={() => setSelected(window.getSelection()?.toString().trim() ?? "")}
          onTouchEnd={(event) => {
            swipe.onTouchEnd(event);
            setSelected(window.getSelection()?.toString().trim() ?? "");
          }}
        >
          {structuredChapter ? (
            <FootnotedChapter
              chapter={structuredChapter}
              resources={structuredResources}
              className="novel-paper"
            />
          ) : (
            <article className="novel-paper">
              {current.split("\n").map((line, lineIndex) => (
                <p key={lineIndex}>{line}</p>
              ))}
            </article>
          )}
          <div className="page-buttons">
            <button onClick={previous} disabled={index === 0}>上一段</button>
            <span>{index + 1} / {total}</span>
            <button onClick={next} disabled={index >= total - 1}>下一段</button>
          </div>
        </section>
        <CompanionDock
          sessionId={props.session.id}
          comments={props.companionComments}
          layout={props.companionLayout}
          layoutRevision={props.companionLayoutRevision}
          loading={props.companionLoading}
          error={props.companionError}
          canRequestPip={props.canRequestPip}
          onRequestPip={props.onRequestPip}
          pendingCommentDraft={props.pendingCommentDraft}
          pendingCommentSaving={props.pendingCommentSaving}
          onSavePendingComment={props.onSavePendingComment}
          onJump={props.onPosition}
          onClear={props.onClearCompanionComments}
        />
      </div>
      <ReaderActions
        primaryLabel="陪我看看这里"
        secondaryLabel="保存这句"
        onPrimary={() => props.onLook(current, selected)}
        primaryDisabled={props.syncRequestInFlight}
        onSecondary={() => props.onSaveQuote(selected)}
        secondaryDisabled={!selected}
        onFinish={props.onFinish}
      />
    </main>
  );
}
