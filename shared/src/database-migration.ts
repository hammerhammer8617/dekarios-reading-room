import {
  DEFAULT_SESSION_PREFERENCES,
  type Bookmark,
  type BookGenre,
  type DurableThought,
  type MysteryReadingCasebook,
  type ReadingEndSnapshot,
  type Quote,
  type Reaction,
  type ReadingDatabase,
  type ReadingPosition,
  type ReadingSession,
  type ReadingType,
  type SourceManifest,
  type CompanionComment,
  type SessionPreferences,
  type SessionStatus
} from "./models.js";

interface V1Session {
  id: string;
  title: string;
  type: ReadingType;
  status: SessionStatus;
  currentPosition: ReadingPosition;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  completedAt?: string;
}

interface V1Database {
  schemaVersion: 1;
  sessions: V1Session[];
  quotes: Quote[];
  reactions: Reaction[];
  bookmarks: Bookmark[];
}

type V2Session = Omit<ReadingSession, "sessionPreferences" | "sourceManifest">;

interface V2Database {
  schemaVersion: 2;
  sessions: V2Session[];
  quotes: Quote[];
  reactions: Reaction[];
  bookmarks: Bookmark[];
}

interface RepairableV3Database {
  schemaVersion: 3;
  sessions: Array<
    V2Session & {
      sessionPreferences?: Partial<SessionPreferences>;
      sourceManifest?: RepairableSourceManifest | null;
    }
  >;
  quotes: Quote[];
  reactions: Reaction[];
  bookmarks: Bookmark[];
  companionComments?: CompanionComment[];
}

interface RepairableV4Database extends Omit<RepairableV3Database, "schemaVersion"> {
  schemaVersion: 4;
}

interface V4Database {
  schemaVersion: 4;
  sessions: ReadingSession[];
  quotes: Quote[];
  reactions: Reaction[];
  bookmarks: Bookmark[];
  companionComments: CompanionComment[];
}

interface RepairableV5Database extends Omit<RepairableV4Database, "schemaVersion"> {
  schemaVersion: 5;
  cases?: ReadingDatabase["cases"];
  caseEntries?: ReadingDatabase["caseEntries"];
  caseEntities?: ReadingDatabase["caseEntities"];
  caseRelations?: ReadingDatabase["caseRelations"];
  caseHypotheses?: ReadingDatabase["caseHypotheses"];
  caseSyncOperations?: ReadingDatabase["caseSyncOperations"];
}

type V5Database = Omit<
  ReadingDatabase,
  "schemaVersion" | "caseObservationTasks" | "thoughts" | "readingRoomCasebooks"
> & {
  schemaVersion: 5;
};

interface RepairableV6Database extends Omit<RepairableV5Database, "schemaVersion"> {
  schemaVersion: 6;
  caseObservationTasks?: ReadingDatabase["caseObservationTasks"];
}

type V6Database = Omit<
  ReadingDatabase,
  "schemaVersion" | "thoughts" | "readingRoomCasebooks"
> & {
  schemaVersion: 6;
};

interface RepairableV7Database extends Omit<RepairableV6Database, "schemaVersion"> {
  schemaVersion: 7;
  thoughts?: DurableThought[];
  readingRoomCasebooks?: MysteryReadingCasebook[];
  readingEndSnapshots?: ReadingEndSnapshot[];
}

type RepairableSourceManifest = Omit<SourceManifest, "cloudSync"> & {
  cloudSync?: SourceManifest["cloudSync"];
};

const DISABLED_R2_CLOUD_SYNC: SourceManifest["cloudSync"] = {
  enabled: false,
  provider: "r2"
};

export function migrateReadingDatabase(input: unknown): ReadingDatabase {
  assertDatabaseCollections(input);
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (version === 1) {
    return migrateV6ToV7(
      migrateV5ToV6(
        migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(input as V1Database))))
      )
    );
  }
  if (version === 2) {
    return migrateV6ToV7(
      migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(input as V2Database))))
    );
  }
  if (version === 3) {
    return migrateV6ToV7(
      migrateV5ToV6(
        migrateV4ToV5(migrateV3ToV4(normalizeV3(input as RepairableV3Database)))
      )
    );
  }
  if (version === 4) {
    return migrateV6ToV7(
      migrateV5ToV6(migrateV4ToV5(normalizeV4(input as RepairableV4Database)))
    );
  }
  if (version === 5) {
    return migrateV6ToV7(migrateV5ToV6(normalizeV5(input as RepairableV5Database)));
  }
  if (version === 6) return migrateV6ToV7(normalizeV6(input as RepairableV6Database));
  if (version === 7) return normalizeV7(input as RepairableV7Database);
  throw new Error("Unsupported schemaVersion");
}

function migrateV1ToV2(database: V1Database): V2Database {
  return {
    schemaVersion: 2,
    sessions: database.sessions.map(({ currentPosition, ...session }) => ({
      ...session,
      userCurrentPosition: currentPosition,
      assistantSyncedPosition: null,
      liveReadingEnabled: false
    })),
    quotes: structuredClone(database.quotes),
    reactions: structuredClone(database.reactions),
    bookmarks: structuredClone(database.bookmarks)
  };
}

function migrateV2ToV3(database: V2Database): RepairableV3Database {
  assertV2Sessions(database.sessions);
  return {
    schemaVersion: 3,
    sessions: database.sessions.map((session) => ({
      ...structuredClone(session),
      sessionPreferences: structuredClone(DEFAULT_SESSION_PREFERENCES),
      sourceManifest: null
    })),
    quotes: structuredClone(database.quotes),
    reactions: structuredClone(database.reactions),
    bookmarks: structuredClone(database.bookmarks),
    companionComments: []
  };
}

function normalizeV3(database: RepairableV3Database): RepairableV3Database {
  assertV2Sessions(database.sessions);
  return {
    schemaVersion: 3,
    sessions: database.sessions.map((session) => ({
      ...structuredClone(session),
      sessionPreferences: normalizePreferences(session.sessionPreferences),
      sourceManifest: session.sourceManifest
        ? structuredClone(session.sourceManifest)
        : null
    })),
    quotes: structuredClone(database.quotes),
    reactions: structuredClone(database.reactions),
    bookmarks: structuredClone(database.bookmarks),
    companionComments: structuredClone(database.companionComments ?? [])
  };
}

function migrateV3ToV4(database: RepairableV3Database): V4Database {
  return normalizeV4({
    ...database,
    schemaVersion: 4
  });
}

function normalizeV4(database: RepairableV4Database): V4Database {
  assertV2Sessions(database.sessions);
  return {
    schemaVersion: 4,
    sessions: database.sessions.map((session) => ({
      ...structuredClone(session),
      sessionPreferences: normalizePreferences(session.sessionPreferences),
      sourceManifest: normalizeSourceManifest(session.sourceManifest)
    })),
    quotes: structuredClone(database.quotes),
    reactions: structuredClone(database.reactions),
    bookmarks: structuredClone(database.bookmarks),
    companionComments: structuredClone(database.companionComments ?? [])
  };
}

function migrateV4ToV5(database: RepairableV4Database): V5Database {
  return normalizeV5({
    ...database,
    schemaVersion: 5,
    cases: [],
    caseEntries: [],
    caseEntities: [],
    caseRelations: [],
    caseHypotheses: [],
    caseSyncOperations: []
  });
}

function normalizeV5(database: RepairableV5Database): V5Database {
  const reading = normalizeV4({ ...database, schemaVersion: 4 });
  return {
    ...reading,
    schemaVersion: 5,
    cases: structuredClone(database.cases ?? []),
    caseEntries: structuredClone(database.caseEntries ?? []),
    caseEntities: structuredClone(database.caseEntities ?? []),
    caseRelations: structuredClone(database.caseRelations ?? []),
    caseHypotheses: structuredClone(database.caseHypotheses ?? []),
    caseSyncOperations: structuredClone(database.caseSyncOperations ?? [])
  };
}

function migrateV5ToV6(database: V5Database): V6Database {
  return normalizeV6({
    ...database,
    schemaVersion: 6,
    caseObservationTasks: []
  });
}

function normalizeV6(database: RepairableV6Database): V6Database {
  const casebook = normalizeV5({ ...database, schemaVersion: 5 });
  return {
    ...casebook,
    schemaVersion: 6,
    caseObservationTasks: structuredClone(database.caseObservationTasks ?? [])
  };
}

function migrateV6ToV7(database: V6Database): ReadingDatabase {
  return normalizeV7({
    ...database,
    schemaVersion: 7,
    thoughts: [
      ...database.reactions.map((reaction) => ({
        id: `legacy-reaction:${reaction.id}`,
        sessionId: reaction.sessionId,
        author: "tav" as const,
        kind: "reaction" as const,
        content: reaction.content,
        position: structuredClone(reaction.position),
        status: "open" as const,
        ...(reaction.operationId ? { operationId: reaction.operationId } : {}),
        createdAt: reaction.createdAt,
        updatedAt: reaction.createdAt
      })),
      ...database.companionComments.map((comment) => ({
        id: `legacy-comment:${comment.id}`,
        sessionId: comment.sessionId,
        author: "gale" as const,
        kind: "reaction" as const,
        content: comment.text,
        position: structuredClone(comment.position),
        status: "open" as const,
        ...(comment.operationId ? { operationId: comment.operationId } : {}),
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt ?? comment.createdAt
      }))
    ],
    readingRoomCasebooks: []
  });
}

function normalizeV7(database: RepairableV7Database): ReadingDatabase {
  const v6 = normalizeV6({ ...database, schemaVersion: 6 });
  return {
    ...v6,
    schemaVersion: 7,
    sessions: v6.sessions.map(({ genre, ...session }) => {
      const normalizedGenre = normalizeGenre(genre);
      return {
        ...session,
        ...(normalizedGenre ? { genre: normalizedGenre } : {})
      };
    }),
    thoughts: structuredClone(database.thoughts ?? []),
    readingRoomCasebooks: structuredClone(database.readingRoomCasebooks ?? []),
    readingEndSnapshots: structuredClone(database.readingEndSnapshots ?? [])
  };
}

function assertDatabaseCollections(input: unknown): asserts input is
  | V1Database
  | V2Database
  | RepairableV3Database
  | RepairableV4Database
  | RepairableV5Database
  | RepairableV6Database
  | RepairableV7Database {
  if (!input || typeof input !== "object") throw new Error("Unsupported data shape");
  const value = input as Record<string, unknown>;
  if (
    !Array.isArray(value.sessions) ||
    !Array.isArray(value.quotes) ||
    !Array.isArray(value.reactions) ||
    !Array.isArray(value.bookmarks)
  ) {
    throw new Error("Unsupported data shape");
  }
}

function normalizeGenre(input: unknown): BookGenre | undefined {
  if (
    typeof input === "string" &&
    ["novel", "mystery", "nonfiction", "essay", "poetry", "manga", "other"].includes(input)
  ) {
    return input as BookGenre;
  }
  return undefined;
}

function normalizeSourceManifest(
  sourceManifest: RepairableSourceManifest | null | undefined
): SourceManifest | null {
  if (!sourceManifest) return null;
  return {
    ...structuredClone(sourceManifest),
    cloudSync: sourceManifest.cloudSync
      ? structuredClone(sourceManifest.cloudSync)
      : structuredClone(DISABLED_R2_CLOUD_SYNC)
  };
}

function assertV2Sessions(sessions: V2Session[]) {
  for (const session of sessions) {
    if (
      !session.userCurrentPosition ||
      !("assistantSyncedPosition" in session) ||
      typeof session.liveReadingEnabled !== "boolean"
    ) {
      throw new Error("Unsupported session shape");
    }
  }
}

function normalizePreferences(input: Partial<SessionPreferences> | undefined): SessionPreferences {
  if (
    !input ||
    ![
      "light_chat",
      "reaction_only",
      "cp_talk",
      "plot_guess",
      "deep_analysis",
      "diary_summary"
    ].includes(input.readingCommentMode ?? "") ||
    !["short", "normal", "long"].includes(input.commentLength ?? "") ||
    input.allowDeepAnalysisByDefault !== false ||
    input.liveReadingStyle !== "danmaku" ||
    (input.autoSaveCompanionComments !== undefined &&
      typeof input.autoSaveCompanionComments !== "boolean")
  ) {
    return structuredClone(DEFAULT_SESSION_PREFERENCES);
  }
  return {
    readingCommentMode: input.readingCommentMode as SessionPreferences["readingCommentMode"],
    commentLength: input.commentLength as SessionPreferences["commentLength"],
    allowDeepAnalysisByDefault: false,
    liveReadingStyle: "danmaku",
    autoSaveCompanionComments:
      input.autoSaveCompanionComments ??
      DEFAULT_SESSION_PREFERENCES.autoSaveCompanionComments
  };
}
