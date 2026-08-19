export type ReadingType = "novel" | "manga";
export type BookGenre =
  | "novel"
  | "mystery"
  | "nonfiction"
  | "essay"
  | "poetry"
  | "manga"
  | "other";
export type SessionStatus = "active" | "completed";
export type ReadingCommentMode =
  | "light_chat"
  | "reaction_only"
  | "cp_talk"
  | "plot_guess"
  | "deep_analysis"
  | "diary_summary";
export type CommentLength = "short" | "normal" | "long";
export type LiveReadingStyle = "danmaku";
export type SourceKind = "pasted_text" | "file_import" | "manga_import";
export type SourceAvailability =
  | "available_local"
  | "available_cloud"
  | "restoring_from_cloud"
  | "cloud_missing"
  | "cloud_restore_failed"
  | "local_only_missing"
  | "mismatch"
  | "segmentation_mismatch"
  | "unknown";
export type CompanionCommentSource =
  | "live_reading"
  | "quick_action"
  | "catch_up_completion"
  | "current_context"
  | "manual_save";

export const NOVEL_SEGMENTATION_VERSION = 3;
export const MAX_RECENT_COMPANION_COMMENTS = 20;
export const MAX_HISTORY_COMPANION_COMMENTS = 500;

export interface SessionPreferences {
  readingCommentMode: ReadingCommentMode;
  commentLength: CommentLength;
  allowDeepAnalysisByDefault: false;
  liveReadingStyle: LiveReadingStyle;
  autoSaveCompanionComments: boolean;
}

export const DEFAULT_SESSION_PREFERENCES: SessionPreferences = {
  readingCommentMode: "light_chat",
  commentLength: "normal",
  allowDeepAnalysisByDefault: false,
  liveReadingStyle: "danmaku",
  autoSaveCompanionComments: false
};

export interface ReadingPosition {
  kind: "paragraph" | "page";
  index: number;
  total?: number;
  label: string;
}

export interface SourceManifest {
  sourceId: string;
  sourceKind: SourceKind;
  title?: string;
  contentHash: string;
  segmentationVersion: number;
  paragraphCount?: number;
  pageCount?: number;
  cloudSync: CloudSyncMetadata;
  createdOnDeviceId?: string;
  lastVerifiedAt?: string;
}

export interface CloudSyncMetadata {
  enabled: boolean;
  provider: "r2";
  objectKey?: string;
  manifestObjectKey?: string;
  uploadedAt?: string;
  sizeBytes?: number;
  mimeType?: string;
  pages?: CloudSourcePage[];
}

export interface CloudSourcePage {
  index: number;
  objectKey: string;
  contentHash: string;
  sizeBytes?: number;
  mimeType?: string;
}

export interface SourceContext {
  contentHash: string;
  segmentationVersion: number;
  paragraphCount?: number;
  pageCount?: number;
}

export interface ReadingSession {
  id: string;
  title: string;
  type: ReadingType;
  status: SessionStatus;
  userCurrentPosition: ReadingPosition;
  assistantSyncedPosition: ReadingPosition | null;
  liveReadingEnabled: boolean;
  sessionPreferences: SessionPreferences;
  sourceManifest: SourceManifest | null;
  author?: string;
  genre?: BookGenre;
  spoilerBoundary?: ReadingPosition;
  lastNotionSyncedAt?: string;
  lastAssistantConfirmation?: {
    operationId: string;
    batchId: string;
    confirmedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  completedAt?: string;
}

export type ThoughtAuthor = "tav" | "gale" | "shared";
export type ThoughtKind =
  | "reaction"
  | "interpretation"
  | "disagreement"
  | "question"
  | "prediction"
  | "connection"
  | "clue";
export type ThoughtStatus = "open" | "revised" | "resolved" | "rejected";

export interface DurableThought {
  id: string;
  sessionId: string;
  author: ThoughtAuthor;
  kind: ThoughtKind;
  content: string;
  position?: ReadingPosition;
  status: ThoughtStatus;
  relatedThoughtId?: string;
  operationId?: string;
  notionSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CaseEntityType = "person" | "place" | "object" | "organization" | "event";
export type CaseItemStatus = "suspected" | "confirmed" | "disproved" | "unknown";
export type CaseHypothesisStatus = "active" | "supported" | "rejected" | "solved";

export interface CaseEntity {
  id: string;
  name: string;
  type: CaseEntityType;
  aliases: string[];
  description?: string;
  firstSeenPosition?: ReadingPosition;
  status: CaseItemStatus;
  updatedAt: string;
}

export interface CaseRelation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  label: string;
  status: CaseItemStatus;
  evidence: string[];
  updatedAt: string;
}

export interface CaseClue {
  id: string;
  content: string;
  position?: ReadingPosition;
  entityIds: string[];
  status: CaseItemStatus;
  operationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseHypothesis {
  id: string;
  title: string;
  summary: string;
  status: CaseHypothesisStatus;
  confidence?: number;
  evidenceFor: string[];
  evidenceAgainst: string[];
  operationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseTimelineEntry {
  id: string;
  label: string;
  whenText: string;
  note?: string;
  position?: ReadingPosition;
  entityIds: string[];
  operationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseObservationTask {
  id: string;
  prompt: string;
  status: "open" | "done" | "discarded";
  position?: ReadingPosition;
  operationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MysteryCasebook {
  sessionId: string;
  entities: CaseEntity[];
  relations: CaseRelation[];
  clues: CaseClue[];
  hypotheses: CaseHypothesis[];
  timeline: CaseTimelineEntry[];
  observationTasks: CaseObservationTask[];
  updatedAt: string;
}

export interface Quote {
  id: string;
  sessionId: string;
  content: string;
  position: ReadingPosition;
  note?: string;
  operationId?: string;
  createdAt: string;
}

export interface Reaction {
  id: string;
  sessionId: string;
  content: string;
  position: ReadingPosition;
  speaker: "user";
  operationId?: string;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  sessionId: string;
  position: ReadingPosition;
  label?: string;
  operationId?: string;
  createdAt: string;
}

export interface CompanionComment {
  id: string;
  sessionId: string;
  position: ReadingPosition;
  mode: ReadingCommentMode;
  length: CommentLength;
  text: string;
  source: CompanionCommentSource;
  inRecent: boolean;
  inHistory: boolean;
  operationId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ReadingDatabase {
  schemaVersion: 5;
  sessions: ReadingSession[];
  quotes: Quote[];
  reactions: Reaction[];
  bookmarks: Bookmark[];
  companionComments: CompanionComment[];
  thoughts: DurableThought[];
  casebooks: MysteryCasebook[];
}

export type ReadingSyncMode =
  | "current_only"
  | "range_sync"
  | "recent_only"
  | "live_reading"
  | "selected_text";

export interface ReadingContextBatch {
  id: string;
  ordinal: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  hasMore: boolean;
}

export interface FileReference {
  file_id: string;
  download_url: string;
  mime_type?: string;
  file_name?: string;
}

export interface SessionBundle {
  session: ReadingSession;
  quotes: Quote[];
  reactions: Reaction[];
  bookmarks: Bookmark[];
}

export interface BookContext {
  session: ReadingSession;
  recentThoughts: DurableThought[];
  openQuestions: DurableThought[];
  unsyncedThoughtCount: number;
  casebook?: MysteryCasebook;
}

export interface LocalCacheMetadata {
  sessionId: string;
  type: ReadingType;
  title: string;
  cacheVersion: 2;
  remembered: boolean;
  itemCount: number;
  sourceManifest: SourceManifest;
  approximateBytes?: number;
  updatedAt: string;
}

export interface NovelLocalCache {
  metadata: LocalCacheMetadata & { type: "novel" };
  sourceText: string;
  chunks: string[];
}

export interface MangaLocalPage {
  index: number;
  fileName: string;
  mimeType: string;
  blob: Blob;
}

export interface MangaLocalCache {
  metadata: LocalCacheMetadata & { type: "manga" };
  pages: MangaLocalPage[];
}

export type ReadingLocalCache = NovelLocalCache | MangaLocalCache;
