import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CommentLength,
  CompanionComment,
  MangaLocalCache,
  NovelLocalCache,
  ReadingCommentMode,
  ReadingPosition,
  ReadingSession,
  ReadingType,
  SessionBundle,
  SessionPreferences,
  SourceAvailability,
  SourceManifest
} from "@ss/shared";
import { DEFAULT_SESSION_PREFERENCES } from "@ss/shared";
import {
  askChatGpt,
  callTool,
  fileCapabilities,
  initialToolOutput,
  initialWidgetState,
  requestReaderFullscreen,
  requestReaderInline,
  requestReaderPip,
  saveReaderWidgetState,
  updateModelContext
} from "./bridge/host.js";
import { syncCurrentContext } from "./bridge/sync-current-context.js";
import { CacheSettings } from "./components/CacheSettings.js";
import { BookManagementSheet } from "./components/BookManagementSheet.js";
import { DiaryPreview } from "./components/DiaryPreview.js";
import { MoreActions } from "./components/MoreActions.js";
import { SyncChoiceSheet } from "./components/SyncChoiceSheet.js";
import { SyncProgressSheet } from "./components/SyncProgressSheet.js";
import type { PendingCompanionCommentDraft } from "./components/CompanionDock.js";
import { prepareCurrentPageContext } from "./features/manga/image-sync.js";
import { splitNovelText, splitNovelTextForVersion } from "./features/novel/split-text.js";
import { CloudSourceClient } from "./features/source-cloud/cloud-source-client.js";
import type { CloudUploadDiagnostics } from "./features/source-cloud/cloud-source-client.js";
import { getSourceAvailability } from "./features/source-identity/source-availability.js";
import {
  createMangaSourceManifest,
  createNovelSourceManifest
} from "./features/source-identity/source-manifest.js";
import { checkSourceSyncPermission } from "./features/source-identity/sync-guard.js";
import { buildSyncBatches } from "./features/reading-sync/build-batches.js";
import {
  buildBatchUserNote,
  buildCurrentOnlyFallbackPrompt,
  buildCurrentOnlyPrompt,
  buildGaleHighlightModelContext,
  buildGaleHighlightPrompt,
  buildSelectedTextFallbackPrompt,
  buildSelectedTextModelContext,
  buildSelectedTextPrompt
} from "./features/reading-sync/build-messages.js";
import { buildReadingCommentPrompt } from "./features/reading-comments/prompt-policy.js";
import {
  cancelSyncJob,
  getActiveBatch,
  markBatchConfirmed,
  markBatchFailed,
  markBatchSent
} from "./features/reading-sync/job-state.js";
import type { ReadingSyncJob } from "./features/reading-sync/types.js";
import { useLiveReading } from "./hooks/useLiveReading.js";
import { useReadingHostLayout } from "./hooks/useReadingHostLayout.js";
import { Home, type BookshelfItem } from "./pages/Home.js";
import { MangaReader, type MangaPage } from "./pages/MangaReader.js";
import { NovelReader } from "./pages/NovelReader.js";
import { IndexedDbReadingCache } from "./storage/indexeddb-cache.js";

type Screen = "home" | "setup" | "novel" | "manga";
type Overlay = "cache" | "more" | "diary" | "management" | null;
type ImportProgress = {
  stage:
    | "idle"
    | "reading"
    | "ready"
    | "segmenting"
    | "creating_session"
    | "uploading"
    | "saving_manifest"
    | "saving_cache"
    | "done"
    | "failed";
  fileName?: string;
  fileSize?: number;
  decodedTextLength?: number;
  sourceEndpointBasePresent?: boolean;
  uploadStatus?: string;
  sourceId?: string;
  sizeBytes?: number;
  paragraphCount?: number;
  sessionId?: string;
  indexedDbStatus?: "not_started" | "success" | "failure";
  screen?: Screen;
  message?: string;
};
export type OpenOutput = {
  bookshelfSessions?: Array<SessionBundle & { cacheState?: string }>;
  recentSessions?: Array<SessionBundle & { cacheState?: string }>;
  sourceEndpointBase?: string;
};

const cache = new IndexedDbReadingCache();
const DEEP_ANALYSIS_DOCK_TEXT = "已生成长评，可回聊天区查看。";
const MAX_NOVEL_FILE_SIZE = 5 * 1024 * 1024;
const LARGE_NOVEL_TEXTAREA_PREVIEW_BYTES = 2 * 1024 * 1024;
const LARGE_NOVEL_TEXTAREA_PREVIEW_CHARS = 1200;

export function App(props: {
  initialOutput?: OpenOutput;
  onOpenCasebook?: () => void;
} = {}) {
  const initial = props.initialOutput ?? initialToolOutput<OpenOutput>();
  const sourceEndpointBase = initial?.sourceEndpointBase ?? deriveSourceEndpointBase();
  const cloudSourceClient = useMemo(
    () => new CloudSourceClient(sourceEndpointBase, undefined, callTool),
    [sourceEndpointBase]
  );
  const [restoredWidgetState] = useState(() => initialWidgetState());
  const [screen, setScreen] = useState<Screen>(() =>
    restoredWidgetState?.screen === "novel" || restoredWidgetState?.screen === "manga"
      ? restoredWidgetState.screen
      : "home"
  );
  const [setupType, setSetupType] = useState<ReadingType>("novel");
  const [existingSession, setExistingSession] = useState<ReadingSession | null>(null);
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [remembered, setRemembered] = useState(false);
  const [recent, setRecent] = useState<BookshelfItem[]>(
    () =>
      (initial?.bookshelfSessions ?? initial?.recentSessions ?? []).map(
        ({ cacheState: _cacheState, ...item }) => ({
          ...item,
          sourceAvailability: "unknown" as const
        })
      )
  );
  const [sessionBundle, setSessionBundle] = useState<SessionBundle | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [mangaPages, setMangaPages] = useState<MangaPage[]>([]);
  const [pageDescription, setPageDescription] = useState("");
  const [userNote, setUserNote] = useState("");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [diaryContext, setDiaryContext] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [companionComments, setCompanionComments] = useState<CompanionComment[]>([]);
  const [companionLoading, setCompanionLoading] = useState(false);
  const [companionError, setCompanionError] = useState("");
  const [pendingCommentDraft, setPendingCommentDraft] =
    useState<PendingCompanionCommentDraft | null>(null);
  const [pendingCommentSaving, setPendingCommentSaving] = useState(false);
  const [manualSaveRevision, setManualSaveRevision] = useState(0);
  const [startReadingInFlight, setStartReadingInFlight] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: "idle" });
  const [readerImmersive, setReaderImmersive] = useState(
    restoredWidgetState?.immersive ?? false
  );
  const [syncRequestInFlight, setSyncRequestInFlight] = useState(false);
  const [managedBook, setManagedBook] = useState<BookshelfItem | null>(null);
  const [historyComments, setHistoryComments] = useState<CompanionComment[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | undefined>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [syncChoiceOpen, setSyncChoiceOpen] = useState(false);
  const [syncJob, setSyncJob] = useState<ReadingSyncJob | null>(null);
  const [sourceAvailability, setSourceAvailability] =
    useState<SourceAvailability>("unknown");
  const [readerScrollTop, setReaderScrollTop] = useState(restoredWidgetState?.scrollTop ?? 0);
  const restoreAttempted = useRef(false);
  const syncJobRef = useRef<ReadingSyncJob | null>(null);
  const liveReadingInFlightRef = useRef(false);
  const hostLayout = useReadingHostLayout();
  const manualCompanionDraft = useMemo<PendingCompanionCommentDraft | null>(() => {
    if (!sessionBundle) return null;
    const preferences = sessionBundle.session.sessionPreferences;
    const position = sessionBundle.session.userCurrentPosition;
    return {
      position,
      mode: preferences.readingCommentMode,
      length: preferences.commentLength,
      source: "manual_save",
      operationId: `manual-save-${sessionBundle.session.id}-${position.kind}-${position.index}-${manualSaveRevision}`
    };
  }, [manualSaveRevision, sessionBundle]);
  const companionDraftForSave = pendingCommentDraft ?? manualCompanionDraft;

  const loadCompanionComments = useCallback(async (sessionId: string, background = false) => {
    if (!background) setCompanionLoading(true);
    try {
      const result = await callTool("list_companion_comments", {
        sessionId,
        scope: "recent",
        limit: 20
      });
      const comments = Array.isArray(result.structuredContent?.comments)
        ? (result.structuredContent.comments as CompanionComment[])
        : [];
      setCompanionComments(
        comments
          .filter(
            (comment) =>
              comment.sessionId === sessionId &&
              comment.inRecent === true
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 20)
      );
      setCompanionError("");
    } catch {
      if (!background) {
        setCompanionComments([]);
        setCompanionError("短评暂时没有读取成功。");
      }
    } finally {
      if (!background) setCompanionLoading(false);
    }
  }, []);

  useEffect(() => {
    const sessionId = sessionBundle?.session.id;
    const reading = screen === "novel" || screen === "manga";
    const setupVerification = screen === "setup" && !!sessionId;
    if (!sessionId || (!reading && !setupVerification)) {
      setCompanionComments([]);
      setCompanionError("");
      setPendingCommentDraft(null);
      return;
    }
    setCompanionComments([]);
    setPendingCommentDraft(null);
    void loadCompanionComments(sessionId);
    const timer = window.setInterval(() => {
      void loadCompanionComments(sessionId, true);
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [loadCompanionComments, screen, sessionBundle?.session.id]);

  useEffect(() => {
    if (screen !== "novel" && screen !== "manga") return;
    setOverlay(null);
    setSyncChoiceOpen(false);
  }, [hostLayout.revision]);

  useEffect(() => {
    if (screen !== "home") return;
    let cancelled = false;
    Promise.all(
      recent.map(async (item) => {
        const local = await cache.get(item.session.id).catch(() => null);
        let session = item.session;
        if (local && !session.sourceManifest) {
          await callTool("set_source_manifest", {
            sessionId: session.id,
            sourceManifest: local.metadata.sourceManifest
          }).catch(() => undefined);
          session = {
            ...session,
            sourceManifest: local.metadata.sourceManifest
          };
        }
        let sourceAvailability = getSourceAvailability(
          session.sourceManifest ?? null,
          local?.metadata.sourceManifest ?? null
        );
        if (sourceAvailability === "available_cloud") {
          setRecent((items) =>
            items.map((candidate) =>
              candidate.session.id === session.id
                ? { ...candidate, sourceAvailability: "restoring_from_cloud" }
                : candidate
            )
          );
          try {
            if (session.type === "novel") {
              const restored = await cloudSourceClient.restoreNovelSource({ sessionId: session.id });
              const restoredChunks = splitNovelTextForVersion(
                restored.sourceText,
                restored.sourceManifest.segmentationVersion
              );
              const localManifest = {
                ...restored.sourceManifest,
                paragraphCount: restoredChunks.length
              };
              const restoredAvailability = getSourceAvailability(
                restored.sourceManifest,
                localManifest
              );
              if (restoredAvailability !== "available_local") {
                throw new Error("Restored source did not match its manifest");
              }
              session = {
                ...session,
                sourceManifest: restored.sourceManifest
              };
              await rememberNovel(session, restored.sourceText, restoredChunks, restored.sourceManifest);
            } else {
              if (!session.sourceManifest) throw new Error("Missing manga source manifest");
              const pages = await restoreMangaPages(session, cloudSourceClient);
              await rememberManga(
                { ...session, sourceManifest: session.sourceManifest },
                pages.map((page) => page.file),
                session.sourceManifest
              );
            }
            sourceAvailability = "available_local";
          } catch {
            sourceAvailability = "cloud_restore_failed";
          }
        }
        let latestComment: string | undefined;
        try {
          const result = await callTool("list_companion_comments", {
            sessionId: session.id,
            scope: "recent",
            limit: 1
          });
          const comments = result.structuredContent?.comments;
          const comment = Array.isArray(comments)
            ? (comments as CompanionComment[]).find(
                (candidate) =>
                  candidate.sessionId === session.id &&
                  candidate.inRecent
              )
            : undefined;
          latestComment =
            comment?.mode === "deep_analysis"
              ? "已生成长评，可回聊天区查看。"
              : comment?.text;
        } catch {
          latestComment = undefined;
        }
        return {
          ...item,
          session,
          sourceAvailability,
          ...(latestComment ? { latestComment } : {})
        };
      })
    ).then((items) => {
      if (!cancelled) {
        setRecent((current) =>
          items.filter((item) =>
            current.some((candidate) => candidate.session.id === item.session.id)
          )
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cloudSourceClient, recent.length, screen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => mangaPages.forEach((page) => URL.revokeObjectURL(page.url));
  }, [mangaPages]);

  const position = sessionBundle?.session.userCurrentPosition;

  useEffect(() => {
    if ((screen === "novel" || screen === "manga") && !sessionBundle) return;
    saveReaderWidgetState({
      screen,
      ...(sessionBundle ? { sessionId: sessionBundle.session.id } : {}),
      ...(position ? { positionIndex: position.index } : {}),
      ...(screen === "novel" || screen === "manga"
        ? { scrollTop: readerScrollTop, immersive: readerImmersive }
        : {})
    });
  }, [screen, sessionBundle?.session.id, position?.index, readerScrollTop, readerImmersive]);

  function begin(type: ReadingType) {
    setSessionBundle(null);
    setCompanionComments([]);
    setCompanionError("");
    setExistingSession(null);
    setSetupType(type);
    setTitle("");
    setSourceText("");
    setSelectedFiles([]);
    setRemembered(true);
    setSourceAvailability("unknown");
    setScreen("setup");
  }

  async function continueReading(item: BookshelfItem) {
    let nextItem = item;
    const local = await cache.get(item.session.id).catch(() => undefined);
    if (local && !item.session.sourceManifest) {
      await callTool("set_source_manifest", {
        sessionId: item.session.id,
        sourceManifest: local.metadata.sourceManifest
      });
      nextItem = {
        ...item,
        session: {
          ...item.session,
          sourceManifest: local.metadata.sourceManifest
        }
      };
    }
    setSessionBundle(nextItem);
    const availability = getSourceAvailability(
      nextItem.session.sourceManifest ?? null,
      local === null ? null : local?.metadata.sourceManifest
    );
    setSourceAvailability(availability);
    if (local && "chunks" in local && (availability === "available_local" || availability === "unknown")) {
      setChunks(local.chunks);
      setSourceText(local.sourceText);
      setRemembered(true);
      setScreen("novel");
      return;
    }
    if (local && "pages" in local && (availability === "available_local" || availability === "unknown")) {
      setMangaPages(
        local.pages.map((page) => ({
          file: new File([page.blob], page.fileName, { type: page.mimeType }),
          url: URL.createObjectURL(page.blob)
        }))
      );
      setRemembered(true);
      setScreen("manga");
      return;
    }
    setExistingSession(nextItem.session);
    setTitle(nextItem.session.title);
    setSetupType(nextItem.session.type);
    setRemembered(true);
    setScreen("setup");
    setToast(
      availability === "mismatch" || availability === "segmentation_mismatch"
        ? "当前设备的正文版本与原 session 不一致，已停止自动同步。请重新导入正确版本。"
        : nextItem.session.type === "novel"
        ? `正文缓存已丢失。上次看到${nextItem.session.userCurrentPosition.label}，请重新粘贴正文继续。`
        : `漫画图片缓存不可用。上次看到${nextItem.session.userCurrentPosition.label}，请重新导入漫画图片继续。`
    );
  }

  function prepareReimport(item: BookshelfItem) {
    setSessionBundle(item);
    setSourceAvailability(item.sourceAvailability);
    setExistingSession(item.session);
    setTitle(item.session.title);
    setSetupType(item.session.type);
    setSourceText("");
    setSelectedFiles([]);
    setRemembered(true);
    setScreen("setup");
    setToast(sourceReimportMessage(item.sourceAvailability, item.session.type));
  }

  async function openBookManagement(item: BookshelfItem) {
    setManagedBook(item);
    setHistoryComments([]);
    setHistoryCursor(undefined);
    setOverlay("management");
    await loadMoreCommentHistory(item.session.id, undefined, true);
  }

  async function openFullscreenReader() {
    if (!sessionBundle || !position) return;
    const saveFullscreenIntent = (immersive: boolean) =>
      saveReaderWidgetState({
        screen,
        sessionId: sessionBundle.session.id,
        positionIndex: position.index,
        scrollTop: readerScrollTop,
        immersive
      });
    if (readerImmersive) {
      saveFullscreenIntent(false);
      setReaderImmersive(false);
      const floating = await requestReaderPip();
      if (floating) {
        setToast("书房已收进浮窗，阅读位置还在这里。");
        return;
      }
      await requestReaderInline();
      setToast("当前设备暂不支持浮窗，已回到书房卡片。");
      return;
    }
    saveFullscreenIntent(true);
    setReaderImmersive(true);
    const supported = await requestReaderFullscreen();
    if (!supported) {
      saveFullscreenIntent(false);
      setReaderImmersive(false);
      setToast("无法进入全屏阅读，请重试。");
    }
  }

  function storeSyncJob(job: ReadingSyncJob) {
    syncJobRef.current = job;
    setSyncJob(job);
  }

  function clearSyncJobState() {
    syncJobRef.current = null;
    setSyncJob(null);
  }

  async function loadMoreCommentHistory(
    sessionId = managedBook?.session.id,
    cursor = historyCursor,
    replace = false
  ) {
    if (!sessionId || historyLoading) return;
    setHistoryLoading(true);
    try {
      const result = await callTool("list_companion_comments", {
        sessionId,
        scope: "history",
        limit: 20,
        ...(cursor ? { cursor } : {})
      });
      const comments = Array.isArray(result.structuredContent?.comments)
        ? (result.structuredContent.comments as CompanionComment[]).filter(
            (comment) => comment.sessionId === sessionId && comment.inHistory
          )
        : [];
      setHistoryComments((current) => (replace ? comments : [...current, ...comments]));
      setHistoryCursor(
        result.structuredContent?.nextCursor as string | undefined
      );
    } catch {
      setToast("盖尔评论历史暂时没有读取成功。");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function renameManagedBook(title: string) {
    if (!managedBook) return;
    try {
      const result = await callTool("rename_reading_session", {
        sessionId: managedBook.session.id,
        title
      });
      const session = result.structuredContent?.session as ReadingSession | undefined;
      if (!session) throw new Error("Missing renamed session");
      updateBookshelfSession(session);
      setManagedBook((current) => current ? { ...current, session } : current);
      setToast("书名已经改好啦。");
    } catch {
      setToast("书名没有保存成功，请重试。");
    }
  }

  async function setManagedBookStatus(status: "active" | "completed") {
    if (!managedBook) return;
    try {
      const result = await callTool("set_reading_session_status", {
        sessionId: managedBook.session.id,
        status
      });
      const session = result.structuredContent?.session as ReadingSession | undefined;
      if (!session) throw new Error("Missing updated session");
      updateBookshelfSession(session);
      setManagedBook((current) => current ? { ...current, session } : current);
      setToast(status === "completed" ? "已经标记为完成。" : "已经恢复为阅读中。");
    } catch {
      setToast("作品状态没有更新成功，请重试。");
    }
  }

  async function clearManagedComments(scope: "recent" | "history") {
    if (!managedBook) return;
    try {
      await callTool("clear_companion_comments", {
        sessionId: managedBook.session.id,
        scope
      });
      if (scope === "recent") {
        setRecent((items) =>
          items.map((item) =>
            item.session.id === managedBook.session.id
              ? { ...item, latestComment: undefined }
              : item
          )
        );
      } else {
        setHistoryComments([]);
        setHistoryCursor(undefined);
      }
      setToast(scope === "recent" ? "最近短评已清除。" : "历史短评已清除。");
    } catch {
      setToast("短评没有清除成功，请重试。");
    }
  }

  async function deleteManagedBook(options: {
    deleteCloudSource: boolean;
    deleteLocalCache: boolean;
  }) {
    if (!managedBook) return;
    const sessionId = managedBook.session.id;
    try {
      const result = await callTool("delete_reading_session", {
        sessionId,
        operationId: crypto.randomUUID(),
        ...(options.deleteCloudSource ? { deleteCloudSource: true } : {})
      });
      const cloudSourceDeleteError = result.structuredContent?.cloudSourceDeleteError;
      setRecent((items) => items.filter((item) => item.session.id !== sessionId));
      setManagedBook(null);
      setOverlay(null);
      if (options.deleteLocalCache) {
        try {
          await cache.remove(sessionId);
          await cache.removeSyncJob(sessionId).catch(() => undefined);
          setToast(
            cloudSourceDeleteError
              ? "云端阅读数据已删除，但云端正文副本删除失败；本设备正文缓存已删除。"
              : options.deleteCloudSource
                ? "云端阅读数据、云端正文副本和本设备正文缓存都已删除。"
                : "云端阅读数据和本设备正文缓存都已删除。"
          );
        } catch {
          setToast(
            cloudSourceDeleteError
              ? "云端阅读数据已删除，但云端正文副本删除失败；本设备正文缓存清除失败。"
              : "云端阅读数据已删除，但本设备正文缓存清除失败。"
          );
        }
      } else {
        setToast(
          cloudSourceDeleteError
            ? "云端阅读数据已删除，但云端正文副本删除失败；本设备正文缓存仍保留。"
            : options.deleteCloudSource
              ? "云端阅读数据和云端正文副本已删除，本设备正文缓存仍保留。"
              : "云端阅读数据已删除，本设备正文缓存仍保留。"
        );
      }
    } catch {
      setToast("这本书没有删除成功，请重试。");
    }
  }

  function updateBookshelfSession(session: ReadingSession) {
    setRecent((items) =>
      items.map((item) =>
        item.session.id === session.id ? { ...item, session } : item
      )
    );
    setSessionBundle((current) =>
      current?.session.id === session.id ? { ...current, session } : current
    );
  }

  function importNovelFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      setToast("目前只支持 TXT / Markdown 文档。");
      setImportProgress({
        stage: "failed",
        fileName: file.name,
        fileSize: file.size,
        sourceEndpointBasePresent: Boolean(sourceEndpointBase),
        screen,
        message: "不支持的文件格式"
      });
      return;
    }
    if (file.size > MAX_NOVEL_FILE_SIZE) {
      setToast("文档超过 5 MB，请拆分后再导入。");
      setImportProgress({
        stage: "failed",
        fileName: file.name,
        fileSize: file.size,
        sourceEndpointBasePresent: Boolean(sourceEndpointBase),
        screen,
        message: "文件超过 5 MB"
      });
      return;
    }

    setImportProgress({
      stage: "reading",
      fileName: file.name,
      fileSize: file.size,
      sourceEndpointBasePresent: Boolean(sourceEndpointBase),
      screen,
      message: "正在读取文件"
    });
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setToast("读取失败，请确认文件是 UTF-8 文本，或改用复制粘贴。");
        setImportProgress((current) => ({
          ...current,
          stage: "failed",
          screen,
          message: "读取失败"
        }));
        return;
      }
      if (!result.trim()) {
        setSourceText("");
        setToast("文档解析为空，请确认是 UTF-8 文本，或改用复制粘贴。");
        setImportProgress((current) => ({
          ...current,
          stage: "failed",
          decodedTextLength: result.length,
          screen,
          message: "解析为空"
        }));
        return;
      }
      setSourceText(result);
      setTitle((current) => current.trim() || file.name.replace(/\.(txt|md|markdown)$/i, ""));
      setImportProgress((current) => ({
        ...current,
        stage: "ready",
        decodedTextLength: result.length,
        sourceEndpointBasePresent: Boolean(sourceEndpointBase),
        screen,
        message: file.size > LARGE_NOVEL_TEXTAREA_PREVIEW_BYTES ? "大文件已读取，准备分段" : "文档已读取"
      }));
      setToast("文档已导入，你仍然可以继续编辑正文。");
    };
    reader.onerror = () => {
      setToast("读取失败，请确认文件是 UTF-8 文本，或改用复制粘贴。");
      setImportProgress((current) => ({
        ...current,
        stage: "failed",
        screen,
        message: "读取失败"
      }));
    };
    reader.readAsText(file, "UTF-8");
  }

  async function startReading() {
    if (!title.trim()) return setToast("请先填写作品名。");
    if (setupType === "novel" && !sourceText.trim()) {
      setImportProgress((current) => ({
        ...current,
        stage: "failed",
        screen,
        message: "正文为空"
      }));
      return setToast("请先粘贴小说正文。");
    }
    if (setupType === "manga" && selectedFiles.length === 0) return setToast("请先导入漫画图片。");

    let novelChunks: string[] = [];
    if (setupType === "novel") {
      setImportProgress((current) => ({
        ...current,
        stage: "segmenting",
        decodedTextLength: sourceText.length,
        sourceEndpointBasePresent: Boolean(sourceEndpointBase),
        indexedDbStatus: "not_started",
        screen,
        message: "正在分段"
      }));
      await nextFrame();
      novelChunks = splitNovelText(sourceText);
      if (novelChunks.length === 0) {
        setImportProgress((current) => ({
          ...current,
          stage: "failed",
          paragraphCount: 0,
          screen,
          message: "正文为空"
        }));
        return setToast("请先粘贴小说正文。");
      }
      setImportProgress((current) => ({
        ...current,
        paragraphCount: novelChunks.length,
        screen,
        message: "分段完成"
      }));
      await nextFrame();
    }

    let session = existingSession;
    if (!session) {
      setImportProgress((current) => ({
        ...current,
        stage: "creating_session",
        paragraphCount: setupType === "novel" ? novelChunks.length : current.paragraphCount,
        screen,
        message: "正在创建书房"
      }));
      await nextFrame();
      const result = await callTool("start_reading_session", { title: title.trim(), type: setupType });
      session = ensureSessionDefaults(
        result.structuredContent?.session as ReadingSession | undefined ??
          createLocalSession(title.trim(), setupType)
      );
    }
    if (!session) throw new Error("Failed to create reading session");
    setImportProgress((current) => ({
      ...current,
      sessionId: session?.id,
      screen,
      message: "书房已创建"
    }));
    await nextFrame();
    let sourceManifest =
      setupType === "novel"
        ? await createNovelSourceManifest({
            sourceId: session.sourceManifest?.sourceId ?? crypto.randomUUID(),
            sourceKind: "pasted_text",
            title: title.trim(),
            sourceText
          })
        : await createMangaSourceManifest({
            sourceId: session.sourceManifest?.sourceId ?? crypto.randomUUID(),
            title: title.trim(),
            pages: selectedFiles
          });
    const importedAvailability = session.sourceManifest
      ? getSourceAvailability(session.sourceManifest, sourceManifest)
      : "available_local";
    if (importedAvailability !== "available_local") {
      setSourceAvailability(importedAvailability);
      setToast("当前导入内容与原 session 不一致，已阻止套用旧进度。");
      return;
    }
    let cloudUploadFailed = false;
    let cloudUploadError = "";
    let cloudDiagnostics: CloudUploadDiagnostics | undefined;
    let serverSideCloudUploadOnly = false;
    if (setupType === "novel") {
      const sessionId = session.id;
      setImportProgress((current) => ({
        ...current,
        stage: "uploading",
        sessionId,
        paragraphCount: novelChunks.length,
        sourceEndpointBasePresent: Boolean(sourceEndpointBase),
        uploadStatus: "started",
        screen,
        message: "正在上传云端正文"
      }));
      await nextFrame();
      const upload = await cloudSourceClient.uploadNovelSource({
          sessionId,
          title: title.trim(),
          sourceText
        });
      cloudDiagnostics = upload.diagnostics;
      if (upload.sourceManifest?.cloudSync.enabled) {
        sourceManifest = upload.sourceManifest;
        setImportProgress((current) => ({
          ...current,
          uploadStatus: "success",
          sourceId: sourceManifest.sourceId,
          sizeBytes: sourceManifest.cloudSync.sizeBytes,
          paragraphCount: sourceManifest.paragraphCount ?? novelChunks.length,
          screen,
          message: "云端正文已上传"
        }));
      } else if (upload.diagnostics.bridgeUploadStatus === "success") {
        serverSideCloudUploadOnly = true;
        setImportProgress((current) => ({
          ...current,
          uploadStatus: "success",
          screen,
          message: "云端正文已上传"
        }));
      } else {
        cloudUploadFailed = true;
        cloudUploadError = formatCloudUploadDiagnostics(upload.diagnostics);
        setImportProgress((current) => ({
          ...current,
          uploadStatus: upload.diagnostics.directUploadStatus,
          screen,
          message: "云端上传失败，继续创建本地阅读"
        }));
      }
    } else {
      const upload = await cloudSourceClient.uploadMangaSource({
          sessionId: session.id,
          title: title.trim(),
          pages: selectedFiles.map((file, index) => ({
            index: index + 1,
            blob: file,
            fileName: file.name
          }))
        });
      cloudDiagnostics = upload.diagnostics;
      if (upload.sourceManifest?.cloudSync.enabled) {
        sourceManifest = upload.sourceManifest;
      } else if (upload.diagnostics.bridgeUploadStatus === "success") {
        serverSideCloudUploadOnly = true;
      } else {
        cloudUploadFailed = true;
        cloudUploadError = formatCloudUploadDiagnostics(upload.diagnostics);
      }
    }
    let setSourceManifestCalled = false;
    let setSourceManifestStatus: "not_called" | "success" | "failure" = "not_called";
    if (!serverSideCloudUploadOnly) {
      setSourceManifestCalled = true;
      try {
        setImportProgress((current) => ({
          ...current,
          stage: "saving_manifest",
          sessionId: session?.id,
          paragraphCount: sourceManifest.paragraphCount ?? current.paragraphCount,
          sourceId: sourceManifest.sourceId,
          screen,
          message: "正在保存正文信息"
        }));
        await nextFrame();
        await callTool("set_source_manifest", {
          sessionId: session.id,
          sourceManifest
        });
        setSourceManifestStatus = "success";
      } catch {
        setSourceManifestStatus = "failure";
      }
    }
    if (serverSideCloudUploadOnly) {
      const status = await callTool("get_cloud_source_status", { sessionId: session.id }).catch(() => undefined);
      const cloudStatus =
        typeof status?.structuredContent?.status === "string"
          ? status.structuredContent.status
          : "unknown";
      cloudUploadFailed = cloudStatus !== "available";
      cloudUploadError = formatCloudUploadDiagnostics(cloudDiagnostics, {
        setSourceManifestCalled,
        setSourceManifestStatus,
        cloudStatus
      });
    } else if (cloudUploadFailed) {
      cloudUploadError = formatCloudUploadDiagnostics(cloudDiagnostics, {
        setSourceManifestCalled,
        setSourceManifestStatus
      });
    }
    session = { ...session, sourceManifest };
    setSourceAvailability("available_local");
    const bundle: SessionBundle = {
      session,
      quotes: sessionBundle?.quotes ?? [],
      reactions: sessionBundle?.reactions ?? [],
      bookmarks: sessionBundle?.bookmarks ?? []
    };
    setSessionBundle(bundle);
    setRecent((items) => [
      { ...bundle, sourceAvailability: "available_local" },
      ...items.filter((item) => item.session.id !== session!.id)
    ]);

    if (setupType === "novel") {
      setChunks(novelChunks);
      setRemembered(true);
      setScreen("novel");
      try {
        setImportProgress((current) => ({
          ...current,
          stage: "saving_cache",
          sessionId: session.id,
          paragraphCount: novelChunks.length,
          sourceId: sourceManifest.sourceId,
          indexedDbStatus: "not_started",
          screen: "novel",
          message: "正在保存本设备缓存"
        }));
        await nextFrame();
        await rememberNovel(session, sourceText, novelChunks, sourceManifest);
        setImportProgress((current) => ({
          ...current,
          stage: "done",
          indexedDbStatus: "success",
          screen: "novel",
          message: "导入完成"
        }));
      } catch {
        setRemembered(false);
        setImportProgress((current) => ({
          ...current,
          stage: "done",
          indexedDbStatus: "failure",
          screen: "novel",
          message: "本设备缓存写入失败，已进入阅读页"
        }));
        setToast(
          cloudUploadFailed
            ? `云端同步失败：${cloudUploadError}；本设备正文缓存写入失败，当前仍可继续阅读，请保留原文。`
            : "本设备正文缓存写入失败，当前仍可继续阅读；关闭后可从云端恢复。"
        );
        return;
      }
      if (cloudUploadFailed) {
        setToast(`云端同步失败：${cloudUploadError}；已保留本设备正文。`);
      }
    } else {
      const pages = selectedFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
      setMangaPages(pages);
      setRemembered(true);
      await rememberManga(session, selectedFiles, sourceManifest);
      if (cloudUploadFailed) {
        setToast(`云端同步失败：${cloudUploadError}；已保留本设备漫画。`);
      }
      setScreen("manga");
    }
  }

  async function submitReadingSetup() {
    if (startReadingInFlight) return;
    setStartReadingInFlight(true);
    try {
      await startReading();
    } catch {
      setToast("创建书房失败，请重试；正文仍保留在当前页面。");
    } finally {
      setStartReadingInFlight(false);
    }
  }

  async function changePosition(index: number) {
    if (!sessionBundle) return;
    setReaderScrollTop(0);
    const nextPosition = makePosition(sessionBundle.session.type, index, sessionBundle.session.type === "novel" ? chunks.length : mangaPages.length);
    setSessionBundle({
      ...sessionBundle,
      session: {
        ...sessionBundle.session,
        userCurrentPosition: nextPosition,
        updatedAt: new Date().toISOString()
      }
    });
    await callTool("update_reading_position", {
      sessionId: sessionBundle.session.id,
      userCurrentPosition: nextPosition
    });
  }

  async function lookAtNovel(
    currentText: string,
    selectedText: string,
    selectionNote = "",
    preferenceOverride?: Pick<SessionPreferences, "readingCommentMode" | "commentLength">
  ): Promise<boolean> {
    if (!sessionBundle) return false;
    if (syncRequestInFlight) return false;
    const permission = checkSourceSyncPermission({
      mode: "current_only",
      sourceAvailability,
      forceCurrentOnly: true
    });
    if (!permission.allowed) return false;
    setSyncRequestInFlight(true);
    try {
      const sourceContext = getSourceContext(sessionBundle.session.sourceManifest);
      const normalizedSelectedText = selectedText.trim();
      const normalizedSelectionNote = selectionNote.trim();
      if (normalizedSelectedText) {
        const result = await callTool("send_current_context", {
          sessionId: sessionBundle.session.id,
          currentPosition: sessionBundle.session.userCurrentPosition,
          mode: "current_only",
          currentText,
          selectedText: normalizedSelectedText,
          ...(sourceContext ? { sourceContext } : {}),
          ...(normalizedSelectionNote ? { userNote: normalizedSelectionNote } : {})
        });
        const context = result.structuredContent?.context as Record<string, unknown> | undefined;
        const modelContext = context
          ? buildSelectedTextModelContext({
              context,
              title: sessionBundle.session.title,
              position: sessionBundle.session.userCurrentPosition.index,
              selectedText: normalizedSelectedText,
              userNote: normalizedSelectionNote
            })
          : undefined;
        if (!modelContext) {
          setToast("这句没能递给盖尔，请再试一次。");
          return false;
        }
        const syncedToHiddenContext = await updateModelContext(modelContext);
        await askChatGpt(
          syncedToHiddenContext
            ? buildSelectedTextPrompt()
            : buildSelectedTextFallbackPrompt({
                selectedText: normalizedSelectedText,
                userNote: normalizedSelectionNote
              }),
          { scrollToBottom: false }
        );
        setToast(
          normalizedSelectionNote
            ? "这句和批注已经递给盖尔。"
            : "这句已经递给盖尔。"
        );
        return true;
      }
      const operationId = crypto.randomUUID();
      const activePreferences = preferenceOverride ?? sessionBundle.session.sessionPreferences;
      const userNote = [
        permission.userNote,
        selectionNote.trim() ? `用户对选中句子的批注：${selectionNote.trim()}` : ""
      ].filter(Boolean).join("\n");
      const policyPrompt = buildCurrentOnlyPrompt({
        sessionId: sessionBundle.session.id,
        title: sessionBundle.session.title,
        position: sessionBundle.session.userCurrentPosition.index,
        hasUnconfirmedGap:
          sessionBundle.session.userCurrentPosition.index >
          (sessionBundle.session.assistantSyncedPosition?.index ?? 0),
        mode: activePreferences.readingCommentMode,
        length: activePreferences.commentLength,
        operationId,
        autoSaveCompanionComments:
          sessionBundle.session.sessionPreferences.autoSaveCompanionComments
      });
      const result = await callTool("send_current_context", {
        sessionId: sessionBundle.session.id,
        currentPosition: sessionBundle.session.userCurrentPosition,
        mode: "current_only",
        currentText,
        readingCommentMode: activePreferences.readingCommentMode,
        commentLength: activePreferences.commentLength,
        ...(selectedText ? { selectedText } : {}),
        ...(sourceContext ? { sourceContext } : {}),
        ...(userNote ? { userNote } : {})
      });
      const context = result.structuredContent?.context as Record<string, unknown> | undefined;
      if (!context) {
        setToast("当前段落同步失败，请再试一次。");
        return false;
      }
      const fallbackPrompt = buildCurrentOnlyFallbackPrompt({
        sessionId: sessionBundle.session.id,
        title: sessionBundle.session.title,
        position: sessionBundle.session.userCurrentPosition.index,
        text: currentText,
        selectedText,
        userNote: selectionNote,
        hasUnconfirmedGap:
          sessionBundle.session.userCurrentPosition.index >
          (sessionBundle.session.assistantSyncedPosition?.index ?? 0),
        mode: activePreferences.readingCommentMode,
        length: activePreferences.commentLength,
        operationId,
        autoSaveCompanionComments:
          sessionBundle.session.sessionPreferences.autoSaveCompanionComments
      });
      const mode = await syncCurrentContext({
        context,
        successPrompt: policyPrompt,
        fallbackPrompt,
        updateModelContext,
        sendMessage: askChatGpt
      });
      rememberPendingCommentDraft({
        position: sessionBundle.session.userCurrentPosition,
        mode: activePreferences.readingCommentMode,
        length: activePreferences.commentLength,
        operationId
      });
      setToast(
        mode === "context"
          ? `已同步${sessionBundle.session.userCurrentPosition.label}，盖尔正在看这里。`
          : "已用兼容模式发送当前段落。"
      );
      return true;
    } catch {
      setToast(
        selectedText.trim()
          ? "这句还没有递送成功；原句和批注都保留着，请再试一次。"
          : "当前段落没有发送成功，请再试一次。"
      );
      return false;
    } finally {
      setSyncRequestInFlight(false);
    }
  }

  async function requestGaleHighlight(currentText: string) {
    if (!sessionBundle || syncRequestInFlight) return;
    const permission = checkSourceSyncPermission({
      mode: "current_only",
      sourceAvailability,
      forceCurrentOnly: true
    });
    if (!permission.allowed) {
      setToast(sourceSyncBlockedMessage(sourceAvailability));
      return;
    }
    setSyncRequestInFlight(true);
    try {
      const sourceContext = getSourceContext(sessionBundle.session.sourceManifest);
      const result = await callTool("send_current_context", {
        sessionId: sessionBundle.session.id,
        currentPosition: sessionBundle.session.userCurrentPosition,
        mode: "current_only",
        currentText,
        ...(sourceContext ? { sourceContext } : {})
      });
      const context = result.structuredContent?.context as Record<string, unknown> | undefined;
      const modelContext = context
        ? buildGaleHighlightModelContext({
            context,
            title: sessionBundle.session.title,
            position: sessionBundle.session.userCurrentPosition.index
          })
        : undefined;
      if (!modelContext || !(await updateModelContext(modelContext))) {
        setToast("本段没能静默递给盖尔，请再试一次。");
        return;
      }
      await askChatGpt(
        buildGaleHighlightPrompt({
          title: sessionBundle.session.title,
          position: sessionBundle.session.userCurrentPosition.index
        }),
        { scrollToBottom: false }
      );
      setToast("本段已经静默递给盖尔，他会回赠划线和完整批注。");
    } catch {
      setToast("盖尔的回赠划线没有发送成功，请再试一次。");
    } finally {
      setSyncRequestInFlight(false);
    }
  }

  async function requestNovelSync() {
    if (!sessionBundle) return;
    if (syncRequestInFlight || syncJobRef.current) return;
    const userIndex = sessionBundle.session.userCurrentPosition.index;
    const assistantIndex = sessionBundle.session.assistantSyncedPosition?.index ?? 0;
    if (userIndex <= assistantIndex) {
      setToast("盖尔已经同步到这里了；想看他的回赠划线，可以按“盖尔会划哪一句？”。");
      return;
    }
    if (!allowAutomaticSync("range_sync")) return;
    const batches = buildSyncBatches({
      chunks,
      rangeStart: assistantIndex + 1,
      rangeEnd: userIndex,
      idFactory: (ordinal) => `${sessionBundle.session.id}-${Date.now()}-${ordinal}`
    });
    if (userIndex - assistantIndex > 20 || batches.length > 2) {
      setSyncChoiceOpen(true);
      return;
    }
    await startFullCatchUp(batches);
  }

  async function startFullCatchUp(prebuilt?: ReturnType<typeof buildSyncBatches>) {
    if (!sessionBundle) return;
    if (syncJobRef.current) return;
    if (!allowAutomaticSync("range_sync")) return;
    const userIndex = sessionBundle.session.userCurrentPosition.index;
    const assistantIndex = sessionBundle.session.assistantSyncedPosition?.index ?? 0;
    const batches =
      prebuilt ??
      buildSyncBatches({
        chunks,
        rangeStart: assistantIndex + 1,
        rangeEnd: userIndex,
        idFactory: (ordinal) => `${sessionBundle.session.id}-${Date.now()}-${ordinal}`
      });
    const job: ReadingSyncJob = {
      sessionId: sessionBundle.session.id,
      title: sessionBundle.session.title,
      type: "novel",
      mode: "range_sync",
      targetPosition: sessionBundle.session.userCurrentPosition,
      confirmedThrough: sessionBundle.session.assistantSyncedPosition,
      batches,
      activeBatchIndex: 0,
      createdAt: new Date().toISOString()
    };
    setSyncChoiceOpen(false);
    storeSyncJob(job);
    await cache.putSyncJob(job).catch(() => undefined);
    await sendSyncBatch(job);
  }

  async function requestMangaSync() {
    if (!sessionBundle || sessionBundle.session.type !== "manga") return;
    if (syncRequestInFlight || syncJobRef.current) return;
    const userIndex = sessionBundle.session.userCurrentPosition.index;
    const assistantIndex = sessionBundle.session.assistantSyncedPosition?.index ?? 0;
    if (userIndex <= assistantIndex) {
      await lookAtManga();
      return;
    }
    if (!allowAutomaticSync("range_sync")) return;
    if (userIndex - assistantIndex > 10) {
      setSyncChoiceOpen(true);
      return;
    }
    await startMangaCatchUp(assistantIndex + 1);
  }

  async function startMangaCatchUp(rangeStart?: number, recentOnly = false) {
    if (!sessionBundle || sessionBundle.session.type !== "manga") return;
    if (syncJobRef.current) return;
    if (!allowAutomaticSync(recentOnly ? "recent_only" : "range_sync")) return;
    const end = sessionBundle.session.userCurrentPosition.index;
    const start = rangeStart ?? (sessionBundle.session.assistantSyncedPosition?.index ?? 0) + 1;
    const batches = Array.from({ length: end - start + 1 }, (_, offset) => {
      const index = start + offset;
      return {
        id: `${sessionBundle.session.id}-page-${index}-${Date.now()}`,
        ordinal: offset + 1,
        totalBatches: end - start + 1,
        rangeStart: index,
        rangeEnd: index,
        characterCount: 0,
        text: `第 ${index} 页图片`,
        isFinal: index === end,
        oversizedParagraph: false,
        status: "pending" as const
      };
    });
    const job: ReadingSyncJob = {
      sessionId: sessionBundle.session.id,
      title: sessionBundle.session.title,
      type: "manga",
      mode: recentOnly ? "recent_only" : "range_sync",
      targetPosition: sessionBundle.session.userCurrentPosition,
      confirmedThrough: sessionBundle.session.assistantSyncedPosition,
      batches,
      activeBatchIndex: 0,
      createdAt: new Date().toISOString()
    };
    setSyncChoiceOpen(false);
    storeSyncJob(job);
    await cache.putSyncJob(job).catch(() => undefined);
    await sendSyncBatch(job);
  }

  async function sendSyncBatch(job: ReadingSyncJob) {
    const batch = getActiveBatch(job);
    if (!batch) return;
    const permission = checkSourceSyncPermission({
      mode: job.mode,
      sourceAvailability
    });
    if (!permission.allowed) {
      setToast(sourceSyncBlockedMessage(sourceAvailability));
      return;
    }
    const sourceContext = getSourceContext(sessionBundle?.session.sourceManifest);
    try {
      if (job.type === "manga") {
        const page = mangaPages[batch.rangeEnd - 1];
        if (!page) throw new Error("Missing manga page");
        const prepared = await prepareCurrentPageContext({
          file: page.file,
          pageDescription: batch.rangeEnd === position?.index ? pageDescription : "",
          userNote,
          uploadFile: fileCapabilities.uploadFile()
        });
        const result = await callTool("send_current_context", {
          sessionId: job.sessionId,
          previousSyncedPosition: job.confirmedThrough,
          currentPosition: makePosition("manga", batch.rangeEnd, mangaPages.length),
          contextRange: { start: batch.rangeStart, end: batch.rangeEnd },
          ...(prepared.currentPageImage ? { currentPageImage: prepared.currentPageImage } : {}),
          ...(prepared.pageDescription ? { pageDescription: prepared.pageDescription } : {}),
          ...(prepared.userNote ? { userNote: prepared.userNote } : {}),
          ...(sourceContext ? { sourceContext } : {}),
          mode: job.mode,
          batch: {
            id: batch.id,
            ordinal: batch.ordinal,
            total: batch.totalBatches,
            rangeStart: batch.rangeStart,
            rangeEnd: batch.rangeEnd,
            hasMore: !batch.isFinal
          }
        });
        const context = result.structuredContent?.context as Record<string, unknown> | undefined;
        if (!context || !(await updateModelContext(context))) {
          throw new Error("Manga context could not be synced silently");
        }
        const sent = markBatchSent(job, batch.id);
        storeSyncJob(sent);
        await cache.putSyncJob(sent).catch(() => undefined);
        await confirmSyncBatch(sent);
        return;
      }
      const result = await callTool("send_current_context", {
        sessionId: job.sessionId,
        previousSyncedPosition: job.confirmedThrough,
        currentPosition: job.targetPosition,
        contextRange: { start: batch.rangeStart, end: batch.rangeEnd },
        includedText: batch.text,
        userNote: buildBatchUserNote(job, batch),
        ...(sourceContext ? { sourceContext } : {}),
        mode: job.mode,
        batch: {
          id: batch.id,
          ordinal: batch.ordinal,
          total: batch.totalBatches,
          rangeStart: batch.rangeStart,
          rangeEnd: batch.rangeEnd,
          hasMore: !batch.isFinal
        }
      });
      const context = result.structuredContent?.context as Record<string, unknown> | undefined;
      if (!context || !(await updateModelContext(context))) {
        throw new Error("Novel context could not be synced silently");
      }
      const sent = markBatchSent(job, batch.id);
      storeSyncJob(sent);
      await cache.putSyncJob(sent).catch(() => undefined);
      await confirmSyncBatch(sent);
    } catch {
      const failed = markBatchFailed(job, batch.id);
      storeSyncJob(failed);
      await cache.putSyncJob(failed).catch(() => undefined);
      setToast("静默同步没有完成，请重试本批；正文没有发到聊天区。");
    }
  }

  async function confirmSyncBatch(jobOverride?: ReadingSyncJob) {
    const activeJob = jobOverride ?? syncJob;
    if (!activeJob || !sessionBundle) return;
    const batch = getActiveBatch(activeJob);
    if (!batch || batch.status !== "sent-awaiting-confirmation") return;
    const confirmedPosition = makePosition(
      activeJob.type,
      batch.rangeEnd,
      activeJob.type === "novel" ? chunks.length : mangaPages.length
    );
    if (activeJob.mode !== "recent_only") {
      await callTool("confirm_assistant_synced_position", {
        sessionId: activeJob.sessionId,
        confirmedPosition,
        batchId: batch.id,
        operationId: `confirm-${batch.id}`
      });
    }
    const confirmed = markBatchConfirmed(activeJob, batch.id);
    if (activeJob.mode !== "recent_only") {
      setSessionBundle((current) =>
        current?.session.id === activeJob.sessionId
          ? {
              ...current,
              session: {
                ...current.session,
                assistantSyncedPosition: confirmedPosition,
                updatedAt: new Date().toISOString()
              }
            }
          : current
      );
    }
    if (batch.isFinal) {
      clearSyncJobState();
      await cache.removeSyncJob(activeJob.sessionId).catch(() => undefined);
      setToast(
        confirmed.mode === "recent_only"
          ? "最近内容已静默递给盖尔。"
          : `盖尔已静默同步到${confirmedPosition.label}。`
      );
      return;
    }
    storeSyncJob(confirmed);
    await cache.putSyncJob(confirmed).catch(() => undefined);
    await sendSyncBatch(confirmed);
  }

  async function sendRecentNovelContext() {
    if (!sessionBundle || syncRequestInFlight) return;
    if (!allowAutomaticSync("recent_only")) return;
    const end = sessionBundle.session.userCurrentPosition.index;
    const start = Math.max(1, end - 4);
    const text = chunks
      .slice(start - 1, end)
      .map((chunk, offset) => `【第 ${start + offset} 段】\n${chunk}`)
      .join("\n\n");
    setSyncChoiceOpen(false);
    setSyncRequestInFlight(true);
    try {
      const result = await callTool("send_current_context", {
        sessionId: sessionBundle.session.id,
        previousSyncedPosition: sessionBundle.session.assistantSyncedPosition,
        currentPosition: sessionBundle.session.userCurrentPosition,
        contextRange: { start, end },
        includedText: text,
        mode: "recent_only",
        readingCommentMode: sessionBundle.session.sessionPreferences.readingCommentMode,
        commentLength: sessionBundle.session.sessionPreferences.commentLength,
        ...(getSourceContext(sessionBundle.session.sourceManifest)
          ? { sourceContext: getSourceContext(sessionBundle.session.sourceManifest) }
          : {})
      });
      const context = result.structuredContent?.context as Record<string, unknown> | undefined;
      if (!context || !(await updateModelContext(context))) {
        setToast("最近段落没有静默同步成功，请再试一次。");
        return;
      }
      setToast(`第 ${start}–${end} 段已静默递给盖尔。`);
    } catch {
      setToast("最近段落没有静默同步成功，请再试一次。");
    } finally {
      setSyncRequestInFlight(false);
    }
  }

  async function cancelCurrentSync() {
    setSyncChoiceOpen(false);
    if (!syncJob) return;
    const cancelled = cancelSyncJob(syncJob);
    clearSyncJobState();
    await cache.putSyncJob(cancelled).catch(() => undefined);
  }

  const sendLiveReading = useCallback(
    async (index: number) => {
      if (
        !sessionBundle ||
        sessionBundle.session.type !== "novel" ||
        syncJob ||
        liveReadingInFlightRef.current
      ) return;
      const session = sessionBundle.session;
      if (
        session.assistantSyncedPosition?.kind === session.userCurrentPosition.kind &&
        session.assistantSyncedPosition.index >= index
      ) {
        return;
      }
      const permission = checkSourceSyncPermission({
        mode: "live_reading",
        sourceAvailability
      });
      if (!permission.allowed) return;
      const operationId = buildLiveReadingOperationId(
        session.id,
        session.userCurrentPosition.kind,
        index,
        session.sessionPreferences.readingCommentMode,
        session.sessionPreferences.commentLength
      );
      const sourceContext = getSourceContext(session.sourceManifest);
      const start = Math.max(1, index - 1);
      const targetPosition = makePosition("novel", index, chunks.length);
      const text = chunks
        .slice(start - 1, index)
        .map((chunk, offset) => `【第 ${start + offset} 段】\n${chunk}`)
        .join("\n\n");
      liveReadingInFlightRef.current = true;
      try {
        const result = await callTool("send_current_context", {
          sessionId: session.id,
          previousSyncedPosition: session.assistantSyncedPosition,
          currentPosition: targetPosition,
          contextRange: { start, end: index },
          includedText: text,
          ...(sourceContext ? { sourceContext } : {}),
          mode: "live_reading",
          batch: {
            id: operationId,
            ordinal: 1,
            totalBatches: 1,
            rangeStart: start,
            rangeEnd: index,
            hasMore: false
          }
        });
        const context = result.structuredContent?.context as Record<string, unknown> | undefined;
        if (!context || !(await updateModelContext(context))) {
          throw new Error("Live context could not be synced silently");
        }
        await callTool("confirm_assistant_synced_position", {
          sessionId: session.id,
          confirmedPosition: targetPosition,
          batchId: operationId,
          operationId: `confirm-${operationId}`
        });
        setSessionBundle((current) =>
          current?.session.id === session.id
            ? {
                ...current,
                session: {
                  ...current.session,
                  assistantSyncedPosition: targetPosition,
                  updatedAt: new Date().toISOString()
                }
              }
            : current
        );
      } catch {
        setToast("自动同步未能静默完成，请按“同步到这里”重试。");
      } finally {
        liveReadingInFlightRef.current = false;
      }
    },
    [chunks, sessionBundle, sourceAvailability, syncJob]
  );

  useLiveReading({
    enabled: sessionBundle?.session.liveReadingEnabled ?? false,
    userPositionIndex: sessionBundle?.session.userCurrentPosition.index ?? 1,
    isScrolling: false,
    hasPendingConfirmation: Boolean(syncJob),
    triggerKey: sessionBundle
      ? buildLiveReadingOperationId(
          sessionBundle.session.id,
          sessionBundle.session.userCurrentPosition.kind,
          sessionBundle.session.userCurrentPosition.index,
          sessionBundle.session.sessionPreferences.readingCommentMode,
          sessionBundle.session.sessionPreferences.commentLength
        )
      : undefined,
    hasUnconfirmedGap:
      Boolean(sessionBundle) &&
      (sessionBundle!.session.userCurrentPosition.index -
        (sessionBundle!.session.assistantSyncedPosition?.index ?? 0) >
        2),
    sourceVerified:
      sourceAvailability === "available_local" &&
      !(
        sessionBundle?.session.assistantSyncedPosition?.kind ===
          sessionBundle?.session.userCurrentPosition.kind &&
        (sessionBundle?.session.assistantSyncedPosition?.index ?? 0) >=
          (sessionBundle?.session.userCurrentPosition.index ?? 1)
      ),
    delayMs: 1_800,
    onStablePosition: sendLiveReading
  });

  async function changeLiveReading(enabled: boolean) {
    if (!sessionBundle) return;
    const result = await callTool("set_live_reading_mode", {
      sessionId: sessionBundle.session.id,
      enabled
    });
    setSessionBundle({
      ...sessionBundle,
      session: {
        ...sessionBundle.session,
        liveReadingEnabled:
          (result.structuredContent?.liveReadingEnabled as boolean | undefined) ?? enabled
      }
    });
  }

  async function lookAtManga(
    preferenceOverride?: Pick<SessionPreferences, "readingCommentMode" | "commentLength">
  ) {
    if (!sessionBundle || !position) return;
    if (syncRequestInFlight) return;
    const page = mangaPages[position.index - 1];
    if (!page) return;
    const permission = checkSourceSyncPermission({
      mode: "current_only",
      sourceAvailability,
      forceCurrentOnly: true
    });
    if (!permission.allowed) return;
    setSyncRequestInFlight(true);
    try {
      const prepared = await prepareCurrentPageContext({
        file: page.file,
        pageDescription,
        userNote,
        uploadFile: fileCapabilities.uploadFile()
      });
      const operationId = crypto.randomUUID();
      const activePreferences = preferenceOverride ?? sessionBundle.session.sessionPreferences;
      const policyPrompt = buildReadingCommentPrompt({
        sessionId: sessionBundle.session.id,
        mode: activePreferences.readingCommentMode,
        length: activePreferences.commentLength,
        title: sessionBundle.session.title,
        position,
        source: "current_only",
        operationId,
        autoSaveCompanionComments:
          sessionBundle.session.sessionPreferences.autoSaveCompanionComments
      });
      const result = await callTool("send_current_context", {
        sessionId: sessionBundle.session.id,
        currentPosition: position,
        mode: "current_only",
        readingCommentMode: activePreferences.readingCommentMode,
        commentLength: activePreferences.commentLength,
        ...(prepared.currentPageImage ? { currentPageImage: prepared.currentPageImage } : {}),
        ...(prepared.pageDescription ? { pageDescription: prepared.pageDescription } : {}),
        ...(prepared.userNote ? { userNote: prepared.userNote } : {}),
        ...(getSourceContext(sessionBundle.session.sourceManifest)
          ? { sourceContext: getSourceContext(sessionBundle.session.sourceManifest) }
          : {}),
        ...(permission.userNote
          ? {
              userNote: [prepared.userNote, permission.userNote].filter(Boolean).join("\n")
            }
          : {})
      });
      const context = result.structuredContent?.context as Record<string, unknown> | undefined;
      if (!context) {
        setToast("当前漫画页同步失败，请再试一次。");
        return;
      }
      if (prepared.warning) setToast(prepared.warning);
      const fallbackPrompt = [
        `我正在看《${sessionBundle.session.title}》的${position.label}。`,
        prepared.pageDescription ? `页面描述：${prepared.pageDescription}` : "",
        prepared.userNote ? `我的备注：${prepared.userNote}` : "",
        policyPrompt
      ].filter(Boolean).join("\n");
      const mode = await syncCurrentContext({
        context,
        successPrompt: policyPrompt,
        fallbackPrompt,
        updateModelContext,
        sendMessage: askChatGpt
      });
      rememberPendingCommentDraft({
        position,
        mode: activePreferences.readingCommentMode,
        length: activePreferences.commentLength,
        operationId
      });
      if (!prepared.warning) {
        setToast(mode === "context" ? `已同步${position.label}。` : "已用页面描述同步当前页。");
      }
    } finally {
      setSyncRequestInFlight(false);
    }
  }

  async function updateReadingPreferences(
    patch: Partial<
      Pick<
        SessionPreferences,
        | "readingCommentMode"
        | "commentLength"
        | "liveReadingStyle"
        | "autoSaveCompanionComments"
      >
    >
  ): Promise<SessionPreferences | null> {
    if (!sessionBundle) return null;
    const sessionId = sessionBundle.session.id;
    const previousPreferences = sessionBundle.session.sessionPreferences;
    const optimisticPreferences = { ...previousPreferences, ...patch };
    applySessionPreferences(sessionId, optimisticPreferences);
    setPreferenceSaving(true);
    try {
      const result = await callTool("update_session_preferences", {
        sessionId,
        preferences: patch
      });
      const sessionPreferences = result.structuredContent?.sessionPreferences as
        | SessionPreferences
        | undefined;
      if (!sessionPreferences) throw new Error("Missing session preferences");
      applySessionPreferences(sessionId, sessionPreferences);
      return sessionPreferences;
    } catch {
      applySessionPreferences(sessionId, previousPreferences);
      setToast("陪读偏好没有保存成功，请重试。");
      return null;
    } finally {
      setPreferenceSaving(false);
    }
  }

  function applySessionPreferences(
    sessionId: string,
    sessionPreferences: SessionPreferences
  ) {
    setSessionBundle((current) =>
      current?.session.id === sessionId
        ? {
            ...current,
            session: {
              ...current.session,
              sessionPreferences
            }
          }
        : current
    );
    setRecent((items) =>
      items.map((item) =>
        item.session.id === sessionId
          ? {
              ...item,
              session: {
                ...item.session,
                sessionPreferences
              }
            }
          : item
      )
    );
    setManagedBook((current) =>
      current?.session.id === sessionId
        ? {
            ...current,
            session: {
              ...current.session,
              sessionPreferences
            }
          }
        : current
    );
  }

  async function runReadingQuickAction(
    mode: ReadingCommentMode,
    length: CommentLength
  ) {
    if (!sessionBundle) return;
    const updated = {
      ...sessionBundle.session.sessionPreferences,
      readingCommentMode: mode,
      commentLength: length
    };
    void updateReadingPreferences({
      readingCommentMode: mode,
      commentLength: length
    });
    if (mode === "diary_summary") {
      await openDiary();
      return;
    }
    setOverlay(null);
    if (sessionBundle.session.type === "novel") {
      const currentText = chunks[sessionBundle.session.userCurrentPosition.index - 1] ?? "";
      await lookAtNovel(currentText, "", "", updated);
      return;
    }
    await lookAtManga(updated);
  }

  async function clearRecentCompanionComments() {
    if (!sessionBundle) return;
    try {
      await callTool("clear_companion_comments", {
        sessionId: sessionBundle.session.id,
        scope: "recent"
      });
      setCompanionComments([]);
      setCompanionError("");
      setToast("这本书最近的陪读短评已清除。");
    } catch {
      setToast("最近短评没有清除成功，请重试。");
    }
  }

  function rememberPendingCommentDraft(input: {
    position: ReadingPosition;
    mode: ReadingCommentMode;
    length: CommentLength;
    operationId: string;
  }) {
    setPendingCommentDraft({
      position: input.position,
      mode: input.mode,
      length: input.length,
      source: "manual_save",
      operationId: `manual-save-${input.operationId}`
    });
  }

  async function savePendingCompanionComment(text: string) {
    if (!sessionBundle || !companionDraftForSave || pendingCommentSaving) return;
    const normalizedText = text.replace(/\s+/g, " ").trim();
    if (/^已读到第\s*\d+\s*[段页][。.!！]?$/u.test(normalizedText)) {
      setToast("补课确认不适合作为短评。");
      return;
    }
    const duplicate = companionComments.some(
      (comment) =>
        comment.sessionId === sessionBundle.session.id &&
        comment.position.kind === companionDraftForSave.position.kind &&
        comment.position.index === companionDraftForSave.position.index &&
        comment.text.replace(/\s+/g, " ").trim() === normalizedText
    );
    if (duplicate) {
      setToast("这条短评已经保存过啦。");
      return;
    }
    setPendingCommentSaving(true);
    try {
      const operationId = `${companionDraftForSave.operationId}-${crypto.randomUUID()}`;
      const result = await callTool("publish_companion_comment", {
        sessionId: sessionBundle.session.id,
        position: companionDraftForSave.position,
        mode: companionDraftForSave.mode,
        length: companionDraftForSave.length,
        text,
        source: companionDraftForSave.source,
        operationId
      });
      const comment = result.structuredContent?.comment as CompanionComment | undefined;
      if (!comment) throw new Error("Missing companion comment");
      setCompanionComments((current) =>
        [comment, ...current.filter((item) => item.id !== comment.id)]
          .filter((item) => item.sessionId === comment.sessionId && item.inRecent)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 20)
      );
      if (comment.inHistory) {
        setHistoryComments((current) =>
          [comment, ...current.filter((item) => item.id !== comment.id)]
            .filter((item) => item.sessionId === comment.sessionId && item.inHistory)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        );
      }
      setPendingCommentDraft(null);
      setManualSaveRevision((value) => value + 1);
      void loadCompanionComments(sessionBundle.session.id, true);
      setToast("短评已经收入书房。");
    } catch (error) {
      console.warn("Companion comment save failed", error);
      setToast("短评保存失败，可重试。");
    } finally {
      setPendingCommentSaving(false);
    }
  }

  function allowAutomaticSync(mode: "range_sync" | "recent_only" | "live_reading") {
    const permission = checkSourceSyncPermission({ mode, sourceAvailability });
    if (permission.allowed) return true;
    setToast(sourceSyncBlockedMessage(sourceAvailability));
    return false;
  }

  function appendSessionRecord(
    sessionId: string,
    patch: Partial<Pick<SessionBundle, "quotes" | "reactions" | "bookmarks">>
  ) {
    const applyPatch = <T extends SessionBundle | BookshelfItem>(bundle: T): T => ({
      ...bundle,
      ...(patch.quotes ? { quotes: [...bundle.quotes, ...patch.quotes] } : {}),
      ...(patch.reactions ? { reactions: [...bundle.reactions, ...patch.reactions] } : {}),
      ...(patch.bookmarks ? { bookmarks: [...bundle.bookmarks, ...patch.bookmarks] } : {})
    });
    setSessionBundle((current) =>
      current?.session.id === sessionId ? applyPatch(current) : current
    );
    setRecent((items) =>
      items.map((item) => (item.session.id === sessionId ? applyPatch(item) : item))
    );
    setManagedBook((current) =>
      current?.session.id === sessionId ? applyPatch(current) : current
    );
  }

  async function saveQuote(content: string, note?: string) {
    if (!sessionBundle || !content.trim()) return;
    const result = await callTool("save_quote", {
      sessionId: sessionBundle.session.id,
      content,
      position: sessionBundle.session.userCurrentPosition,
      ...(note?.trim() ? { note: note.trim() } : {}),
      operationId: crypto.randomUUID()
    });
    const quote = result.structuredContent?.quote as any;
    if (quote) appendSessionRecord(sessionBundle.session.id, { quotes: [quote] });
    setToast("这句已经收进书房。");
  }

  async function saveReaction() {
    if (!sessionBundle || !userNote.trim()) return;
    const result = await callTool("save_reaction", {
      sessionId: sessionBundle.session.id,
      content: userNote.trim(),
      position: sessionBundle.session.userCurrentPosition,
      speaker: "user",
      operationId: crypto.randomUUID()
    });
    const reaction = result.structuredContent?.reaction as any;
    if (reaction) appendSessionRecord(sessionBundle.session.id, { reactions: [reaction] });
    setUserNote("");
    setToast("吐槽已经记下。");
  }

  async function finishToday() {
    if (!sessionBundle) return;
    await callTool("finish_today_reading", {
      sessionId: sessionBundle.session.id,
      position: sessionBundle.session.userCurrentPosition,
      createBookmark: true,
      operationId: crypto.randomUUID()
    });
    setToast(`今天看到${sessionBundle.session.userCurrentPosition.label}，下次继续。`);
    setScreen("home");
  }

  async function saveBookmark() {
    if (!sessionBundle) return;
    const result = await callTool("save_bookmark", {
      sessionId: sessionBundle.session.id,
      position: sessionBundle.session.userCurrentPosition,
      operationId: crypto.randomUUID()
    });
    const bookmark = result.structuredContent?.bookmark as any;
    if (bookmark) appendSessionRecord(sessionBundle.session.id, { bookmarks: [bookmark] });
    setOverlay(null);
    setToast("书签已经夹好。");
  }

  async function openDiary() {
    if (!sessionBundle) return;
    const result = await callTool("generate_diary_context", { sessionId: sessionBundle.session.id });
    setDiaryContext(result.structuredContent?.diaryContext ?? {
      ...sessionBundle,
      summaryHints: []
    });
    setOverlay("diary");
  }

  async function completeWork() {
    if (!sessionBundle) return;
    const result = await callTool("complete_reading_session", {
      sessionId: sessionBundle.session.id,
      finalPosition: sessionBundle.session.userCurrentPosition
    });
    const completed = result.structuredContent?.session as ReadingSession | undefined;
    if (completed) setSessionBundle({ ...sessionBundle, session: completed });
    setOverlay(null);
    setToast("这部作品已经标记为完成。");
    setScreen("home");
  }

  async function changeRemember(value: boolean) {
    setRemembered(value);
    if (!sessionBundle) return;
    if (!value) {
      await cache.remove(sessionBundle.session.id).catch(() => undefined);
      return;
    }
    const sourceManifest = sessionBundle.session.sourceManifest;
    if (!sourceManifest) {
      setToast("正文来源尚未验证，暂时无法保存本设备缓存。");
      return;
    }
    if (sessionBundle.session.type === "novel") {
      await rememberNovel(sessionBundle.session, sourceText, chunks, sourceManifest);
    } else {
      await rememberManga(
        sessionBundle.session,
        mangaPages.map((page) => page.file),
        sourceManifest
      );
    }
  }

  async function clearCache() {
    if (!sessionBundle) return;
    await cache.remove(sessionBundle.session.id).catch(() => undefined);
    setRemembered(false);
    setToast(sessionBundle.session.type === "novel" ? "正文缓存已清除。" : "漫画缓存已清除。");
    setOverlay(null);
  }

  const readerProps = useMemo(() => ({
    onBack: () => {
      setReaderImmersive(false);
      setScreen("home" as const);
    },
    onSettings: () => setOverlay("cache" as const),
    onMore: () => setOverlay("more" as const)
  }), []);

  useEffect(() => {
    if (restoreAttempted.current || !restoredWidgetState?.sessionId) return;
    const item = recent.find((candidate) => candidate.session.id === restoredWidgetState.sessionId);
    if (!item) return;
    restoreAttempted.current = true;
    setReaderScrollTop(restoredWidgetState.scrollTop ?? 0);
    void continueReading(item);
  }, [recent, restoredWidgetState]);

  const usingLargeNovelPreview =
    setupType === "novel" &&
    sourceText.length > LARGE_NOVEL_TEXTAREA_PREVIEW_CHARS &&
    (importProgress.fileSize ?? 0) > LARGE_NOVEL_TEXTAREA_PREVIEW_BYTES;
  const sourceTextInputValue = usingLargeNovelPreview
    ? `${sourceText.slice(0, LARGE_NOVEL_TEXTAREA_PREVIEW_CHARS)}\n\n（大文件已读取，输入框只显示预览；进入阅读时会使用完整正文。）`
    : sourceText;

  return (
    <div className="app">
      {screen === "home" ? (
        <Home
          bookshelf={recent}
          onNew={begin}
          onOpen={continueReading}
          onReimport={prepareReimport}
          onManage={(item) => void openBookManagement(item)}
          onOpenCasebook={props.onOpenCasebook ?? (() => undefined)}
        />
      ) : null}
      {screen === "setup" ? (
        <main className="setup-shell">
          <button className="back-link" onClick={() => setScreen("home")}>‹ 返回书房</button>
          <h1>{setupType === "novel" ? "小说共读" : "漫画共读"}</h1>
          <p>{existingSession ? `继续《${existingSession.title}》` : "准备好内容，我们就一起开始。"}</p>
          <label>作品名<input aria-label="作品名" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          {setupType === "novel" ? (
            <div className="novel-source-field">
              <label htmlFor="novel-source-text">小说正文</label>
              <textarea
                id="novel-source-text"
                className="source-input"
                value={sourceTextInputValue}
                readOnly={usingLargeNovelPreview}
                onChange={(e) => {
                  setSourceText(e.target.value);
                  setImportProgress({ stage: "idle" });
                }}
                placeholder="粘贴 TXT 或 Markdown 文本"
              />
              {usingLargeNovelPreview ? (
                <p className="source-preview-note">
                  大文件已读取，正文不在输入框里完整展开，避免 iPad 卡住；进入阅读后会使用完整内容。
                </p>
              ) : null}
              <div className="source-import-row">
                <label className="source-import-button">
                  上传 TXT / Markdown
                  <input
                    aria-label="上传 TXT / Markdown"
                    type="file"
                    accept=".txt,.md,.markdown,text/plain,text/markdown"
                    onChange={(event) => {
                      importNovelFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                <span>目前支持 TXT / Markdown，更多格式后续支持。</span>
              </div>
              <ImportProgressPanel progress={importProgress} />
            </div>
          ) : (
            <label className="file-drop">导入漫画图片<input type="file" accept="image/*" multiple onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))} /><span>{selectedFiles.length ? `已选择 ${selectedFiles.length} 张` : "点击选择多张图片"}</span></label>
          )}
          <label className="remember-row"><input type="checkbox" checked={remembered} onChange={(e) => setRemembered(e.target.checked)} />在本设备记住{setupType === "novel" ? "这本书" : "这部漫画"}</label>
          <p className="privacy-note">正文/图片只保存在本设备，用于下次继续阅读；服务器不会保存全文或漫画原图。</p>
          {existingSession ? (
            <section className="setup-companion-summary" aria-label="盖尔最近短评">
              <div>
                <strong>盖尔最近短评</strong>
                <span>重新导入正文后，陪读 Dock 会继续显示这些短评。</span>
              </div>
              {companionLoading ? <p>正在看看盖尔留下了什么……</p> : null}
              {!companionLoading && companionError ? <p>{companionError}</p> : null}
              {!companionLoading && !companionError && companionComments.length === 0 ? (
                <p>盖尔还没留下短评。</p>
              ) : null}
              {!companionLoading && !companionError
                ? companionComments.slice(0, 3).map((comment) => (
                    <article key={comment.id} className="setup-companion-comment">
                      <span>{comment.position.label}</span>
                      <p>
                        {comment.mode === "deep_analysis"
                          ? DEEP_ANALYSIS_DOCK_TEXT
                          : comment.text}
                      </p>
                    </article>
                  ))
                : null}
            </section>
          ) : null}
          <button
            className="action-primary wide-button"
            disabled={startReadingInFlight}
            onClick={() => void submitReadingSetup()}
          >
            {startReadingInFlight ? "正在进入…" : "进入书房"}
          </button>
        </main>
      ) : null}
      {screen === "novel" && sessionBundle ? (
        <NovelReader
          session={sessionBundle.session}
          chunks={chunks}
          onPosition={changePosition}
          onComment={lookAtNovel}
          onRequestGaleHighlight={requestGaleHighlight}
          onSync={() => void requestNovelSync()}
          onSaveQuote={saveQuote}
          onFinish={finishToday}
          onFullscreen={() => void openFullscreenReader()}
          fullscreenLabel={readerImmersive ? "收进浮窗" : "全屏阅读"}
          immersive={readerImmersive}
          companionComments={companionComments}
          companionLoading={companionLoading}
          companionError={companionError || undefined}
          companionLayout={hostLayout.layout}
          companionLayoutRevision={hostLayout.revision}
          syncRequestInFlight={syncRequestInFlight || Boolean(syncJob)}
          canRequestPip={hostLayout.canRequestPip}
          onRequestPip={() => void requestReaderPip()}
          pendingCommentDraft={companionDraftForSave}
          pendingCommentSaving={pendingCommentSaving}
          onSavePendingComment={(text) => void savePendingCompanionComment(text)}
          onClearCompanionComments={() => void clearRecentCompanionComments()}
          initialScrollTop={readerScrollTop}
          onScrollPosition={setReaderScrollTop}
          {...readerProps}
        />
      ) : null}
      {screen === "manga" && sessionBundle ? (
        <MangaReader
          session={sessionBundle.session}
          pages={mangaPages}
          description={pageDescription}
          note={userNote}
          onDescription={setPageDescription}
          onNote={setUserNote}
          onPosition={changePosition}
          onLook={requestMangaSync}
          onSaveReaction={saveReaction}
          onFinish={finishToday}
          onFullscreen={() => void openFullscreenReader()}
          fullscreenLabel={readerImmersive ? "收进浮窗" : "全屏阅读"}
          immersive={readerImmersive}
          companionComments={companionComments}
          companionLoading={companionLoading}
          companionError={companionError || undefined}
          companionLayout={hostLayout.layout}
          companionLayoutRevision={hostLayout.revision}
          syncRequestInFlight={syncRequestInFlight || Boolean(syncJob)}
          canRequestPip={hostLayout.canRequestPip}
          onRequestPip={() => void requestReaderPip()}
          pendingCommentDraft={companionDraftForSave}
          pendingCommentSaving={pendingCommentSaving}
          onSavePendingComment={(text) => void savePendingCompanionComment(text)}
          onClearCompanionComments={() => void clearRecentCompanionComments()}
          initialScrollTop={readerScrollTop}
          onScrollPosition={setReaderScrollTop}
          {...readerProps}
        />
      ) : null}
      {overlay === "cache" && sessionBundle ? <CacheSettings type={sessionBundle.session.type} remembered={remembered} liveReadingEnabled={sessionBundle.session.liveReadingEnabled} onRememberChange={changeRemember} onLiveReadingChange={(enabled) => void changeLiveReading(enabled)} onClear={clearCache} onClose={() => setOverlay(null)} /> : null}
      {overlay === "more" && sessionBundle ? (
        <MoreActions
          preferences={sessionBundle.session.sessionPreferences}
          liveReadingEnabled={sessionBundle.session.liveReadingEnabled}
          preferenceSaving={preferenceSaving}
          quickActionDisabled={syncRequestInFlight}
          onPreferencesChange={(patch) => void updateReadingPreferences(patch)}
          onQuickAction={(mode, length) => void runReadingQuickAction(mode, length)}
          onBookmark={saveBookmark}
          onDiary={openDiary}
          onComplete={completeWork}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === "diary" && diaryContext ? <DiaryPreview context={diaryContext} onWrite={() => askChatGpt("请根据刚刚整理的书房日记素材，写一篇温暖、可复制到 Notion 的今日共读日记。")} onClose={() => setOverlay(null)} /> : null}
      {overlay === "management" && managedBook ? (
        <BookManagementSheet
          bundle={managedBook}
          comments={historyComments}
          historyHasMore={Boolean(historyCursor)}
          historyLoading={historyLoading}
          onLoadMoreHistory={() => void loadMoreCommentHistory()}
          onRename={(title) => void renameManagedBook(title)}
          onStatus={(status) => void setManagedBookStatus(status)}
          onClearComments={(scope) => void clearManagedComments(scope)}
          onDelete={(options) => void deleteManagedBook(options)}
          onClose={() => {
            setManagedBook(null);
            setOverlay(null);
          }}
        />
      ) : null}
      {syncChoiceOpen && sessionBundle ? (
        <SyncChoiceSheet
          assistantLabel={sessionBundle.session.assistantSyncedPosition?.label ?? "开头"}
          userLabel={sessionBundle.session.userCurrentPosition.label}
          recentLabel={sessionBundle.session.type === "manga" ? "补最近 3 页" : "补最近 5 段"}
          onFull={() =>
            void (sessionBundle.session.type === "manga"
              ? startMangaCatchUp()
              : startFullCatchUp())
          }
          onCurrent={() => {
            setSyncChoiceOpen(false);
            void (sessionBundle.session.type === "manga"
              ? lookAtManga()
              : lookAtNovel(
                  chunks[sessionBundle.session.userCurrentPosition.index - 1] ?? "",
                  ""
                ));
          }}
          onRecent={() =>
            void (sessionBundle.session.type === "manga"
              ? startMangaCatchUp(
                  Math.max(1, sessionBundle.session.userCurrentPosition.index - 2),
                  true
                )
              : sendRecentNovelContext())
          }
          onCancel={() => setSyncChoiceOpen(false)}
        />
      ) : null}
      {syncJob ? (
        <SyncProgressSheet
          job={syncJob}
          onConfirm={() => void confirmSyncBatch()}
          onRetry={() => void sendSyncBatch(syncJob)}
          onCancel={() => void cancelCurrentSync()}
        />
      ) : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}

function createLocalSession(title: string, type: ReadingType): ReadingSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    type,
    status: "active",
    userCurrentPosition: makePosition(type, 1),
    assistantSyncedPosition: null,
    liveReadingEnabled: false,
    sessionPreferences: structuredClone(DEFAULT_SESSION_PREFERENCES),
    sourceManifest: null,
    createdAt: now,
    updatedAt: now,
    lastReadAt: now
  };
}

function formatCloudUploadDiagnostics(
  diagnostics: CloudUploadDiagnostics | undefined,
  extra: {
    setSourceManifestCalled?: boolean;
    setSourceManifestStatus?: "not_called" | "success" | "failure";
    cloudStatus?: string;
  } = {}
) {
  if (!diagnostics) return "云端正文请求失败";
  return [
    `bridgeToolAvailable=${diagnostics.bridgeToolAvailable ? "yes" : "no"}`,
    `bridgeUploadStarted=${diagnostics.bridgeUploadStarted ? "yes" : "no"}`,
    `bridgeUploadStatus=${diagnostics.bridgeUploadStatus}`,
    diagnostics.bridgeUploadError ? `bridgeUploadError=${diagnostics.bridgeUploadError}` : "",
    `returnedCloudSyncEnabled=${diagnostics.returnedCloudSyncEnabled ? "yes" : "no"}`,
    `directUploadStarted=${diagnostics.directUploadStarted ? "yes" : "no"}`,
    `directUploadStatus=${diagnostics.directUploadStatus}`,
    diagnostics.directUploadError ? `directUploadError=${diagnostics.directUploadError}` : "",
    `setSourceManifestCalled=${extra.setSourceManifestCalled ? "yes" : "no"}`,
    `setSourceManifestStatus=${extra.setSourceManifestStatus ?? "not_called"}`,
    extra.cloudStatus ? `cloudStatus=${extra.cloudStatus}` : ""
  ].filter(Boolean).join("；");
}

function ImportProgressPanel({ progress }: { progress: ImportProgress }) {
  if (progress.stage === "idle") return null;
  return (
    <section className="import-progress" aria-label="导入诊断">
      <strong>导入诊断</strong>
      <p>阶段：{importStageLabel(progress.stage)}</p>
      {progress.fileName ? <p>文件：{progress.fileName}</p> : null}
      {typeof progress.fileSize === "number" ? <p>File.size：{formatBytes(progress.fileSize)}</p> : null}
      {typeof progress.decodedTextLength === "number" ? <p>decodedTextLength：{progress.decodedTextLength}</p> : null}
      <p>sourceEndpointBase：{progress.sourceEndpointBasePresent ? "present" : "missing"}</p>
      {progress.uploadStatus ? <p>upload：{progress.uploadStatus}</p> : null}
      {progress.sourceId ? <p>sourceId：{progress.sourceId}</p> : null}
      {typeof progress.sizeBytes === "number" ? <p>sizeBytes：{progress.sizeBytes}</p> : null}
      {typeof progress.paragraphCount === "number" ? <p>paragraphCount：{progress.paragraphCount}</p> : null}
      {progress.sessionId ? <p>sessionId：{progress.sessionId}</p> : null}
      {progress.indexedDbStatus ? <p>IndexedDB：{progress.indexedDbStatus}</p> : null}
      {progress.screen ? <p>screen：{progress.screen}</p> : null}
      {progress.message ? <p>message：{progress.message}</p> : null}
    </section>
  );
}

function importStageLabel(stage: ImportProgress["stage"]) {
  const labels: Record<ImportProgress["stage"], string> = {
    idle: "等待",
    reading: "读取文件",
    ready: "读取完成",
    segmenting: "正在分段",
    creating_session: "创建 session",
    uploading: "上传云端",
    saving_manifest: "保存 manifest",
    saving_cache: "保存本机缓存",
    done: "完成",
    failed: "失败"
  };
  return labels[stage];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") return resolve();
    window.setTimeout(resolve, 0);
  });
}

function deriveSourceEndpointBase(): string {
  if (typeof window === "undefined") return "/source";
  const match = window.location.pathname.match(/\/mcp\/([^/]+)/);
  if (!match) return "/source";
  return `/source/${match[1]}`;
}

function buildLiveReadingOperationId(
  sessionId: string,
  positionKind: string,
  positionIndex: number,
  mode: string,
  length: string
): string {
  return `live-${sessionId}-${positionKind}-${positionIndex}-${mode}-${length}`;
}

async function restoreMangaPages(
  session: ReadingSession,
  cloudSourceClient: CloudSourceClient
): Promise<MangaPage[]> {
  const sourceManifest = session.sourceManifest;
  const pages = sourceManifest?.cloudSync.pages;
  if (!sourceManifest || !pages?.length) {
    throw new Error("Missing manga cloud page metadata");
  }
  const restoredPages = await Promise.all(
    [...pages]
      .sort((left, right) => left.index - right.index)
      .map(async (page) => {
        const restored = await cloudSourceClient.restoreMangaPage({
          sessionId: session.id,
          pageIndex: page.index
        });
        const file = new File([restored.blob], `page-${page.index}`, {
          type: restored.blob.type || page.mimeType
        });
        return {
          file,
          url: URL.createObjectURL(file)
        };
      })
  );
  return restoredPages;
}

function ensureSessionDefaults(session: ReadingSession): ReadingSession {
  return {
    ...session,
    sessionPreferences:
      session.sessionPreferences ?? structuredClone(DEFAULT_SESSION_PREFERENCES),
    sourceManifest: session.sourceManifest ?? null
  };
}

function makePosition(type: ReadingType, index: number, total?: number): ReadingPosition {
  return {
    kind: type === "novel" ? "paragraph" : "page",
    index,
    ...(total ? { total } : {}),
    label: type === "novel" ? `第 ${index} 段` : `第 ${index} 页`
  };
}

async function rememberNovel(
  session: ReadingSession,
  sourceText: string,
  chunks: string[],
  sourceManifest: SourceManifest
) {
  const value: NovelLocalCache = {
    metadata: {
      sessionId: session.id,
      type: "novel",
      title: session.title,
      cacheVersion: 2,
      remembered: true,
      itemCount: chunks.length,
      sourceManifest,
      approximateBytes: new Blob([sourceText]).size,
      updatedAt: new Date().toISOString()
    },
    sourceText,
    chunks
  };
  await cache.put(value);
}

async function rememberManga(
  session: ReadingSession,
  files: File[],
  sourceManifest: SourceManifest
) {
  const value: MangaLocalCache = {
    metadata: {
      sessionId: session.id,
      type: "manga",
      title: session.title,
      cacheVersion: 2,
      remembered: true,
      itemCount: files.length,
      sourceManifest,
      approximateBytes: files.reduce((sum, file) => sum + file.size, 0),
      updatedAt: new Date().toISOString()
    },
    pages: files.map((file, index) => ({
      index: index + 1,
      fileName: file.name,
      mimeType: file.type,
      blob: file
    }))
  };
  await cache.put(value);
}

function getSourceContext(sourceManifest: SourceManifest | null | undefined) {
  if (!sourceManifest) return undefined;
  return {
    contentHash: sourceManifest.contentHash,
    segmentationVersion: sourceManifest.segmentationVersion,
    ...(sourceManifest.paragraphCount !== undefined
      ? { paragraphCount: sourceManifest.paragraphCount }
      : {}),
    ...(sourceManifest.pageCount !== undefined
      ? { pageCount: sourceManifest.pageCount }
      : {})
  };
}

function sourceSyncBlockedMessage(sourceAvailability: SourceAvailability) {
  if (
    sourceAvailability === "local_only_missing" ||
    sourceAvailability === "cloud_missing" ||
    sourceAvailability === "cloud_restore_failed"
  ) {
    return "当前设备缺少正文缓存，请重新导入同一份内容后再同步。";
  }
  if (sourceAvailability === "mismatch") {
    return "当前正文版本与原 session 不一致，不能自动补课。";
  }
  if (sourceAvailability === "segmentation_mismatch") {
    return "当前正文分段与原 session 不一致，不能自动补课。";
  }
  return "正文来源尚未验证，暂时不能自动补课。";
}

function sourceReimportMessage(
  sourceAvailability: SourceAvailability,
  type: ReadingType
) {
  if (
    sourceAvailability === "local_only_missing" ||
    sourceAvailability === "cloud_missing" ||
    sourceAvailability === "cloud_restore_failed"
  ) {
    return type === "novel"
      ? "这本书的进度已同步，但当前设备还没有可用正文。请重新导入后同步到私人云端。"
      : "这部漫画的进度已同步，但当前设备还没有图片。请重新导入同一套漫画。";
  }
  if (sourceAvailability === "mismatch") {
    return "当前正文版本与原 session 不一致，可能导致段落错位。请重新导入正确版本。";
  }
  if (sourceAvailability === "segmentation_mismatch") {
    return "当前内容的分段版本不一致，请重新导入或重新分段。";
  }
  return "正文状态尚未验证，请在当前设备重新导入内容完成校验。";
}
