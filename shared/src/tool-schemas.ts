import { z } from "zod";

export const readingTypeSchema = z.enum(["novel", "manga"]);
export const readingSyncModeSchema = z.enum([
  "current_only",
  "range_sync",
  "recent_only",
  "live_reading",
  "selected_text"
]);
export const readingCommentModeSchema = z.enum([
  "light_chat",
  "reaction_only",
  "cp_talk",
  "plot_guess",
  "deep_analysis",
  "diary_summary"
]);
export const commentLengthSchema = z.enum(["short", "normal", "long"]);
export const liveReadingStyleSchema = z.literal("danmaku");
export const sourceKindSchema = z.enum(["pasted_text", "file_import", "manga_import"]);
export const sourceAvailabilitySchema = z.enum([
  "available_local",
  "available_cloud",
  "restoring_from_cloud",
  "cloud_missing",
  "cloud_restore_failed",
  "local_only_missing",
  "mismatch",
  "segmentation_mismatch",
  "unknown"
]);
export const companionCommentSourceSchema = z.enum([
  "live_reading",
  "quick_action",
  "catch_up_completion",
  "current_context",
  "manual_save"
]);
export const readingPositionSchema = z.object({
  kind: z.enum(["paragraph", "page"]),
  index: z.number().int().min(1),
  total: z.number().int().min(1).optional(),
  label: z.string().min(1).max(100)
});

export const fileReferenceSchema = z
  .object({
    file_id: z.string().min(1),
    download_url: z.url(),
    mime_type: z.string().min(1).optional(),
    file_name: z.string().min(1).optional()
  })
  .strict();

export const cloudSourcePageSchema = z
  .object({
    index: z.number().int().min(1),
    objectKey: z.string().min(1).max(500),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().min(0).optional(),
    mimeType: z.string().min(1).max(100).optional()
  })
  .strict();

export const cloudSyncMetadataSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.literal("r2"),
    objectKey: z.string().min(1).max(500).optional(),
    manifestObjectKey: z.string().min(1).max(500).optional(),
    uploadedAt: z.string().datetime().optional(),
    sizeBytes: z.number().int().min(0).optional(),
    mimeType: z.string().min(1).max(100).optional(),
    pages: z.array(cloudSourcePageSchema).optional()
  })
  .strict();

export const sourceManifestSchema = z
  .object({
    sourceId: z.string().min(1).max(200),
    sourceKind: sourceKindSchema,
    title: z.string().trim().min(1).max(200).optional(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    segmentationVersion: z.number().int().min(1),
    paragraphCount: z.number().int().min(1).optional(),
    pageCount: z.number().int().min(1).optional(),
    cloudSync: cloudSyncMetadataSchema,
    createdOnDeviceId: z.string().min(1).max(200).optional(),
    lastVerifiedAt: z.string().datetime().optional()
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.cloudSync.enabled) return;
    if (input.sourceKind === "manga_import") {
      if (!input.cloudSync.pages || input.cloudSync.pages.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["cloudSync", "pages"],
          message: "Enabled manga cloud sync requires page objects"
        });
      }
      return;
    }
    if (!input.cloudSync.objectKey) {
      context.addIssue({
        code: "custom",
        path: ["cloudSync", "objectKey"],
        message: "Enabled novel cloud sync requires objectKey"
      });
    }
  });

export const sourceContextSchema = z
  .object({
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    segmentationVersion: z.number().int().min(1),
    paragraphCount: z.number().int().min(1).optional(),
    pageCount: z.number().int().min(1).optional()
  })
  .strict();

export const openReadingNestInputSchema = z.object({}).strict();
export const startReadingSessionInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: readingTypeSchema
});
export const sessionIdSchema = z.string().min(1);
export const updateReadingPositionInputSchema = z.object({
  sessionId: sessionIdSchema,
  userCurrentPosition: readingPositionSchema
});
export const sendCurrentContextInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    currentPosition: readingPositionSchema.optional(),
    position: readingPositionSchema.optional(),
    previousSyncedPosition: readingPositionSchema.nullable().optional(),
    contextRange: z
      .object({
        start: z.number().int().min(1),
        end: z.number().int().min(1)
      })
      .optional(),
    includedText: z.string().max(20_000).optional(),
    currentText: z.string().max(20_000).optional(),
    selectedText: z.string().max(10_000).optional(),
    pageDescription: z.string().max(4_000).optional(),
    userNote: z.string().max(4_000).optional(),
    currentPageImage: fileReferenceSchema.optional(),
    mode: readingSyncModeSchema,
    readingCommentMode: readingCommentModeSchema.optional(),
    commentLength: commentLengthSchema.optional(),
    sourceContext: sourceContextSchema.optional(),
    batch: z
      .object({
        id: z.string().min(1).max(200),
        ordinal: z.number().int().min(1),
        total: z.number().int().min(1),
        rangeStart: z.number().int().min(1),
        rangeEnd: z.number().int().min(1),
        hasMore: z.boolean()
      })
      .optional()
  })
  .strict()
  .refine((input) => input.currentPosition || input.position, {
    message: "currentPosition is required"
  });
export const confirmAssistantSyncedPositionInputSchema = z.object({
  sessionId: sessionIdSchema,
  confirmedPosition: readingPositionSchema,
  batchId: z.string().min(1).max(200),
  operationId: z.string().min(1).max(200)
});
export const setLiveReadingModeInputSchema = z.object({
  sessionId: sessionIdSchema,
  enabled: z.boolean()
});
export const updateSessionPreferencesInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    preferences: z
      .object({
        readingCommentMode: readingCommentModeSchema.optional(),
        commentLength: commentLengthSchema.optional(),
        liveReadingStyle: liveReadingStyleSchema.optional(),
        autoSaveCompanionComments: z.boolean().optional()
      })
      .strict()
  })
  .strict();
export const setSourceManifestInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    sourceManifest: sourceManifestSchema
  })
  .strict();
export const getCloudSourceStatusInputSchema = z
  .object({
    sessionId: sessionIdSchema
  })
  .strict();
export const uploadCloudSourceInputSchema = z
  .discriminatedUnion("sourceKind", [
    z
      .object({
        sessionId: sessionIdSchema,
        sourceKind: z.enum(["pasted_text", "file_import"]),
        title: z.string().trim().min(1).max(200).optional(),
        sourceText: z.string().min(1)
      })
      .strict(),
    z
      .object({
        sessionId: sessionIdSchema,
        sourceKind: z.literal("manga_import"),
        title: z.string().trim().min(1).max(200).optional(),
        pages: z
          .array(
            z
              .object({
                index: z.number().int().min(1),
                bytesBase64: z.string().min(1),
                mimeType: z.string().min(1).max(100),
                fileName: z.string().min(1).max(300).optional()
              })
              .strict()
          )
          .min(1)
      })
      .strict()
  ]);
export const deleteCloudSourceInputSchema = z
  .object({
    sessionId: sessionIdSchema
  })
  .strict();
export const publishCompanionCommentInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    position: readingPositionSchema,
    mode: readingCommentModeSchema,
    length: commentLengthSchema,
    text: z.string().trim().min(1).max(500),
    source: companionCommentSourceSchema,
    operationId: z.string().min(1).max(200)
  })
  .strict()
  .superRefine((input, context) => {
    if (input.source === "live_reading" && input.text.length > 200) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Live reading comments must not exceed 200 characters"
      });
    }
    if (
      input.mode === "deep_analysis" &&
      input.text !== "已生成长评，可回聊天区查看。"
    ) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Deep analysis bodies cannot be stored as companion comments"
      });
    }
  });
export const listCompanionCommentsInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    scope: z.enum(["recent", "history"]),
    positionIndex: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(500).optional()
  })
  .strict();
export const clearCompanionCommentsInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    scope: z.enum(["recent", "history", "all"])
  })
  .strict();
export const renameReadingSessionInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    title: z.string().trim().min(1).max(200)
  })
  .strict();
export const setReadingSessionStatusInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    status: z.enum(["active", "completed"])
  })
  .strict();
export const deleteReadingSessionInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    operationId: z.string().min(1).max(200),
    deleteCloudSource: z.boolean().optional()
  })
  .strict();
export const saveQuoteInputSchema = z.object({
  sessionId: sessionIdSchema,
  content: z.string().trim().min(1).max(20_000),
  position: readingPositionSchema,
  note: z.string().trim().max(4_000).optional(),
  operationId: z.string().min(1).max(200).optional()
});
export const saveReactionInputSchema = z.object({
  sessionId: sessionIdSchema,
  content: z.string().trim().min(1).max(4_000),
  position: readingPositionSchema,
  speaker: z.literal("user"),
  operationId: z.string().min(1).max(200).optional()
});
export const saveBookmarkInputSchema = z.object({
  sessionId: sessionIdSchema,
  position: readingPositionSchema,
  label: z.string().trim().max(200).optional(),
  operationId: z.string().min(1).max(200).optional()
});
export const finishTodayReadingInputSchema = z.object({
  sessionId: sessionIdSchema,
  position: readingPositionSchema,
  createBookmark: z.boolean().optional().default(true),
  operationId: z.string().min(1).max(200).optional()
});
export const completeReadingSessionInputSchema = z.object({
  sessionId: sessionIdSchema,
  finalPosition: readingPositionSchema.optional()
});
export const generateDiaryContextInputSchema = z.object({
  sessionId: sessionIdSchema
});

export const caseSourceTypeSchema = z.enum(["novel", "video_game", "tabletop", "other"]);
export const caseAuthorSchema = z.enum(["tav", "gale", "joint"]);
export const caseEntryKindSchema = z.enum([
  "observation",
  "claim",
  "evidence",
  "question",
  "hypothesis"
]);
export const caseEntityTypeSchema = z.enum([
  "person",
  "place",
  "object",
  "organization",
  "event"
]);
export const caseGraphStatusSchema = z.enum(["confirmed", "suggested", "rejected"]);
export const caseHypothesisStatusSchema = z.enum([
  "active",
  "weakened",
  "rejected",
  "confirmed"
]);
export const caseObservationTaskStatusSchema = z.enum(["open", "completed", "dismissed"]);
export const caseIdSchema = z.string().min(1).max(200);

export const openCasebookInputSchema = z.object({}).strict();
export const createCaseInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    sourceType: caseSourceTypeSchema,
    sourceLabel: z.string().trim().min(1).max(300).optional()
  })
  .strict();
export const getCaseInputSchema = z.object({ caseId: caseIdSchema }).strict();
export const setCaseStatusInputSchema = z
  .object({ caseId: caseIdSchema, status: z.enum(["active", "archived"]) })
  .strict();
export const addCaseEntryInputSchema = z
  .object({
    caseId: caseIdSchema,
    author: caseAuthorSchema.default("tav"),
    kind: caseEntryKindSchema.default("observation"),
    content: z.string().trim().min(1).max(8_000),
    sourcePosition: z.string().trim().min(1).max(300).optional()
  })
  .strict();
export const addCaseEntriesInputSchema = z
  .object({
    caseId: caseIdSchema,
    author: caseAuthorSchema.default("tav"),
    entries: z
      .array(
        z
          .object({
            kind: caseEntryKindSchema.default("observation"),
            content: z.string().trim().min(1).max(8_000),
            sourcePosition: z.string().trim().min(1).max(300).optional()
          })
          .strict()
      )
      .min(1)
      .max(30)
  })
  .strict();
export const upsertCaseEntityInputSchema = z
  .object({
    caseId: caseIdSchema,
    entityId: z.string().min(1).max(200).optional(),
    entityType: caseEntityTypeSchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    status: caseGraphStatusSchema.optional(),
    createdBy: caseAuthorSchema,
    x: z.number().finite().min(0).max(4_000).optional(),
    y: z.number().finite().min(0).max(4_000).optional()
  })
  .strict();
export const upsertCaseRelationInputSchema = z
  .object({
    caseId: caseIdSchema,
    relationId: z.string().min(1).max(200).optional(),
    sourceEntityId: z.string().min(1).max(200),
    targetEntityId: z.string().min(1).max(200),
    relationType: z.string().trim().min(1).max(100),
    label: z.string().trim().max(500).optional(),
    status: caseGraphStatusSchema.optional(),
    createdBy: caseAuthorSchema,
    supportingEntryId: z.string().min(1).max(200).optional()
  })
  .strict();
export const upsertCaseHypothesisInputSchema = z
  .object({
    caseId: caseIdSchema,
    hypothesisId: z.string().min(1).max(200).optional(),
    author: caseAuthorSchema,
    claim: z.string().trim().min(1).max(4_000),
    status: caseHypothesisStatusSchema.optional(),
    confidence: z.number().int().min(0).max(100).optional()
  })
  .strict();
export const upsertCaseObservationTaskInputSchema = z
  .object({
    caseId: caseIdSchema,
    taskId: z.string().min(1).max(200).optional(),
    instruction: z.string().trim().min(1).max(1_000),
    createdBy: caseAuthorSchema,
    status: caseObservationTaskStatusSchema.optional().default("open")
  })
  .strict();
export const prepareCaseSyncInputSchema = z.object({ caseId: caseIdSchema }).strict();
export const confirmCaseSyncInputSchema = z
  .object({
    caseId: caseIdSchema,
    operationId: z.string().min(1).max(200)
  })
  .strict();

export const bookGenreSchema = z.enum([
  "novel",
  "mystery",
  "nonfiction",
  "essay",
  "poetry",
  "manga",
  "other"
]);
export const thoughtAuthorSchema = z.enum(["tav", "gale", "shared"]);
export const thoughtKindSchema = z.enum([
  "reaction",
  "interpretation",
  "disagreement",
  "question",
  "prediction",
  "connection",
  "clue"
]);
export const thoughtStatusSchema = z.enum(["open", "revised", "resolved", "rejected"]);

export const getOrStartBookContextInputSchema = z
  .object({
    bookId: sessionIdSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    author: z.string().trim().min(1).max(200).optional(),
    genre: bookGenreSchema.optional(),
    currentPosition: readingPositionSchema.optional(),
    sharedPosition: readingPositionSchema.optional(),
    spoilerBoundary: readingPositionSchema.optional(),
    createIfMissing: z.boolean().optional().default(true)
  })
  .strict();

export const recordReadingTurnInputSchema = z
  .object({
    bookId: sessionIdSchema,
    progress: z
      .object({
        tav: readingPositionSchema.optional(),
        shared: readingPositionSchema.optional(),
        spoilerBoundary: readingPositionSchema.optional()
      })
      .strict()
      .optional(),
    thoughts: z
      .array(
        z
          .object({
            author: thoughtAuthorSchema,
            kind: thoughtKindSchema,
            content: z.string().trim().min(1).max(4_000),
            position: readingPositionSchema.optional(),
            status: thoughtStatusSchema.optional().default("open"),
            relatedThoughtId: z.string().min(1).max(200).optional()
          })
          .strict()
      )
      .max(30)
      .optional()
      .default([]),
    endSnapshot: z
      .object({
        progressSummary: z
          .string()
          .trim()
          .min(1)
          .max(240)
          .refine((value) => !isBareReadingPositionSummary(value), {
            message: "progressSummary must describe story or argument progress, not only a page or chapter number"
          }),
        readingSummary: z.string().trim().min(1).max(600)
      })
      .strict()
      .optional(),
    operationId: z.string().min(1).max(200)
  })
  .strict()
  .refine((input) => input.progress || input.thoughts.length > 0 || input.endSnapshot, {
    message: "Record at least progress, one durable thought, or an end snapshot"
  });

export const getBookDetailsInputSchema = z.object({ bookId: sessionIdSchema }).strict();
export const openBookshelfInputSchema = z.object({}).strict();
const bookshelfThoughtSchema = z
  .object({
    id: z.string().min(1).max(200),
    sessionId: sessionIdSchema,
    author: thoughtAuthorSchema,
    kind: thoughtKindSchema,
    content: z.string().trim().min(1).max(4_000),
    position: readingPositionSchema.optional(),
    status: thoughtStatusSchema,
    relatedThoughtId: z.string().min(1).max(200).optional(),
    operationId: z.string().min(1).max(200).optional(),
    notionSyncedAt: z.string().datetime().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();
export const bookshelfItemSchema = z
  .object({
    bookId: sessionIdSchema,
    title: z.string().trim().min(1).max(200),
    author: z.string().trim().min(1).max(200).optional(),
    genre: bookGenreSchema,
    status: z.enum(["active", "completed"]),
    tavPosition: readingPositionSchema,
    sharedPosition: readingPositionSchema.nullable(),
    spoilerBoundary: readingPositionSchema.nullable(),
    lastReadAt: z.string().datetime(),
    lastNotionSyncedAt: z.string().datetime().nullable(),
    latestThought: bookshelfThoughtSchema.optional(),
    openQuestionCount: z.number().int().min(0),
    unsyncedThoughtCount: z.number().int().min(0),
    casebookInProgress: z.boolean(),
    casebookItemCount: z.number().int().min(0)
  })
  .strict();
export const openBookshelfOutputSchema = z
  .object({
    view: z.literal("bookshelf"),
    bookshelf: z.array(bookshelfItemSchema)
  })
  .strict();
export const renderReadingStatusInputSchema = z.object({ bookId: sessionIdSchema }).strict();
export const notionSyncStatusSchema = z.enum(["synced", "pending", "not_requested"]);
export const readingEndSnapshotSchema = z
  .object({
    id: z.string().min(1).max(200),
    bookId: sessionIdSchema,
    operationId: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
    title: z.string().trim().min(1).max(200),
    positionLabel: z.string().trim().min(1).max(100),
    progressSummary: z.string().trim().min(1).max(240),
    readingSummary: z.string().trim().min(1).max(600),
    tavThought: z.string().trim().min(1).max(400).optional(),
    galeThought: z.string().trim().min(1).max(400).optional(),
    openQuestion: z.string().trim().min(1).max(400).optional(),
    notionSyncStatus: notionSyncStatusSchema,
    thoughtCount: z.number().int().min(0).max(30)
  })
  .strict();
export const renderReadingEndCardInputSchema = z
  .object({ snapshotId: z.string().min(1).max(200) })
  .strict();
export const renderReadingEndCardOutputSchema = z
  .object({
    view: z.literal("reading_end"),
    snapshot: readingEndSnapshotSchema
  })
  .strict();
export const prepareNotionSyncInputSchema = z
  .object({
    bookId: sessionIdSchema,
    limit: z.number().int().min(1).max(100).optional().default(50)
  })
  .strict();
export const markNotionSyncedInputSchema = z
  .object({
    bookId: sessionIdSchema,
    thoughtIds: z.array(z.string().min(1).max(200)).min(1).max(100),
    syncedAt: z.string().datetime().optional()
  })
  .strict();

const readingRoomCaseItemStatusSchema = z.enum([
  "suspected",
  "confirmed",
  "disproved",
  "unknown"
]);
const readingRoomCasePositionSchema = readingPositionSchema.optional();
export const recordCasebookUpdateInputSchema = z
  .object({
    bookId: sessionIdSchema,
    entities: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            type: z.enum(["person", "place", "object", "organization", "event"]),
            aliases: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
            description: z.string().trim().max(1_000).optional(),
            firstSeenPosition: readingRoomCasePositionSchema,
            status: readingRoomCaseItemStatusSchema.optional().default("unknown")
          })
          .strict()
      )
      .max(30)
      .optional(),
    relations: z
      .array(
        z
          .object({
            from: z.string().trim().min(1).max(120),
            to: z.string().trim().min(1).max(120),
            label: z.string().trim().min(1).max(200),
            status: readingRoomCaseItemStatusSchema.optional().default("suspected"),
            evidence: z.array(z.string().trim().min(1).max(500)).max(20).optional()
          })
          .strict()
      )
      .max(50)
      .optional(),
    clues: z
      .array(
        z
          .object({
            content: z.string().trim().min(1).max(2_000),
            position: readingRoomCasePositionSchema,
            entityNames: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
            status: readingRoomCaseItemStatusSchema.optional().default("unknown")
          })
          .strict()
      )
      .max(50)
      .optional(),
    hypotheses: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            summary: z.string().trim().min(1).max(2_000),
            status: z.enum(["active", "supported", "rejected", "solved"]).optional().default("active"),
            confidence: z.number().min(0).max(1).optional(),
            evidenceFor: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
            evidenceAgainst: z.array(z.string().trim().min(1).max(500)).max(30).optional()
          })
          .strict()
      )
      .max(20)
      .optional(),
    timeline: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(200),
            whenText: z.string().trim().min(1).max(200),
            note: z.string().trim().max(1_000).optional(),
            position: readingRoomCasePositionSchema,
            entityNames: z.array(z.string().trim().min(1).max(120)).max(20).optional()
          })
          .strict()
      )
      .max(50)
      .optional(),
    observationTasks: z
      .array(
        z
          .object({
            prompt: z.string().trim().min(1).max(1_000),
            status: z.enum(["open", "done", "discarded"]).optional().default("open"),
            position: readingRoomCasePositionSchema
          })
          .strict()
      )
      .max(20)
      .optional(),
    operationId: z.string().min(1).max(200)
  })
  .strict();
export const getCasebookInputSchema = z.object({ bookId: sessionIdSchema }).strict();

export type SendCurrentContextInput = z.infer<typeof sendCurrentContextInputSchema>;
export type UploadCloudSourceInput = z.infer<typeof uploadCloudSourceInputSchema>;
export type GetOrStartBookContextInput = z.infer<typeof getOrStartBookContextInputSchema>;
export type RecordReadingTurnInput = z.infer<typeof recordReadingTurnInputSchema>;
export type RenderReadingEndCardInput = z.infer<typeof renderReadingEndCardInputSchema>;
export type RenderReadingEndCardOutput = z.infer<typeof renderReadingEndCardOutputSchema>;
export type RecordCasebookUpdateInput = z.infer<typeof recordCasebookUpdateInputSchema>;

function isBareReadingPositionSummary(value: string) {
  const normalized = value.trim().replace(/[。.!！]$/, "");
  return (
    /^(?:读到\s*)?第?\s*\d+\s*(?:页|章|节|段|卷)$/u.test(normalized) ||
    /^\d+\s*\/\s*\d+$/u.test(normalized)
  );
}
