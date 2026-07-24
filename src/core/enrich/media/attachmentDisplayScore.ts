/**
 * Attachment display scoring facade — implementation in focused media leaves.
 */
export type {
  AttachmentImageMetrics,
  ScoredAttachmentInput,
  AttachmentDisplayScoreOptions,
  AttachmentDisplayScoreDetails,
} from "@/core/enrich/media/attachmentDisplayTypes";
export { DISPLAY_COVER_PRIORITY_ORDER } from "@/core/enrich/media/attachmentDisplayTypes";
export {
  isDiscOrSupportCoverCandidate,
  isDiscCoverAttachment,
  deriveAttachmentPlatformKeyFromUrl,
  isAttachmentCoverPlatformMismatch,
  coverListHasShelfPlatformSignal,
  coverListHasShelfCompatibleBoxCover,
  isCoverAmbiguousForShelfPlatform,
  shouldSuppressCoverOnPlatformShelf,
  shouldShowCoverAttachmentOnShelf,
} from "@/core/enrich/media/attachmentPlatformGate";
export {
  explainAttachmentScoreForDisplay,
  scoreAttachmentForDisplay,
  rankScoredAttachments,
  rankAttachmentsForDisplay,
  pickBestDisplayImageUrl,
  pickBestBackgroundFromAttachments,
} from "@/core/enrich/media/attachmentDisplayScoring";
export {
  MARKETPLACE_COVER_LOCALE_PENALTY,
  isMarketplaceCoverRole,
  coverLocaleRank,
  coverLocaleRankForAttachment,
  rankCoversForDisplay,
  pickBestAcceptableCoverFromAttachments,
  pickBestCoverFromAttachments,
  resolveStoredMetadataCoverUrl,
  rankCoverGalleryAttachments,
  reorderAttachmentsCoverFirst,
} from "@/core/enrich/media/coverDisplayRank";
