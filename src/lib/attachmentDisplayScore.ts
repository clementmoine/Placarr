import type { AttachmentType } from "@prisma/client";

import {
  isCoverCandidateKind,
  isPhysicalNonCoverKind,
  resolveAttachmentSemantics,
} from "@/lib/attachmentDisplayLabels";
import {
  localeBonusForAttachmentRole,
  regionRank,
} from "@/lib/localePreference";

const REAL_BOX_COVER_SOURCES = new Set([
  "bgg",
  "boardgamegeek",
  "screenscraper",
  "thegamesdb",
  "launchbox",
  "coverproject",
  "apriloshop",
  "freakxy",
  "philibert",
]);

function isRealBoxCoverSource(source?: string | null): boolean {
  if (!source) return false;
  const id = source.toLowerCase().trim();
  return REAL_BOX_COVER_SOURCES.has(id);
}

// When the very same image URL is contributed by several independent sources,
// that agreement is a strong signal it really depicts the product, so it earns
// a display-ranking bonus. Counted per distinct source and capped so it breaks
// ties between comparable images without overriding type/quality semantics.
const CROSS_SOURCE_CONSENSUS_BONUS = 40;
const MAX_CONSENSUS_SOURCES = 4;

function normalizeAttachmentSource(source?: string | null): string | null {
  if (!source) return null;
  // Image sources are provider ids; drop any "· region" / "/ variant" suffix so
  // the same provider is not double-counted.
  const normalized = source.split(/[·/]/)[0].toLowerCase().trim();
  return normalized || null;
}

function crossSourceConsensusBonus(distinctSourceCount: number): number {
  if (distinctSourceCount <= 1) return 0;
  const extraSources = Math.min(distinctSourceCount, MAX_CONSENSUS_SOURCES) - 1;
  return extraSources * CROSS_SOURCE_CONSENSUS_BONUS;
}

export interface AttachmentImageMetrics {
  width?: number;
  height?: number;
  format?: string;
}

export type ScoredAttachmentInput = {
  type: AttachmentType;
  url: string;
  role?: string | null;
  source?: string | null;
  title?: string | null;
};

export interface AttachmentDisplayScoreDetails {
  score: number;
  signals: string[];
  width?: number;
  height?: number;
  aspectRatio?: number;
  format?: string;
}

const DISPLAY_ATTACHMENT_BASE_SCORE: Partial<Record<AttachmentType, number>> = {
  cover: 620,
  artwork: 430,
  image: 330,
  screenshot: 230,
  background: 190,
  logo: 120,
  audio: 20,
};

export const DISPLAY_COVER_PRIORITY_ORDER: AttachmentType[] = [
  "cover",
  "artwork",
  "image",
  "screenshot",
  "background",
  "logo",
];

const COVER_FRIENDLY_TYPES = new Set<AttachmentType>([
  "cover",
  "artwork",
  "image",
]);

function attachmentSemantics(attachment: ScoredAttachmentInput) {
  return resolveAttachmentSemantics({
    type: attachment.type,
    role: attachment.role,
    title: attachment.title,
    source: attachment.source,
  });
}

export function isDiscOrSupportCoverCandidate(
  attachment: ScoredAttachmentInput,
): boolean {
  const { kind } = attachmentSemantics(attachment);
  if (isPhysicalNonCoverKind(kind)) return true;

  const role = (attachment.role || "").toLowerCase();
  const url = (attachment.url || "").toLowerCase();
  const signal = `${role} ${url}`;
  return /\b(support|texture)\b/.test(signal);
}

function buildAttachmentDisplayScoreDetails(
  attachment: ScoredAttachmentInput,
  imageMetrics?: AttachmentImageMetrics | null,
): AttachmentDisplayScoreDetails {
  let score = DISPLAY_ATTACHMENT_BASE_SCORE[attachment.type] ?? 80;
  const signals: string[] = [];
  const addSignal = (delta: number, label: string) => {
    score += delta;
    signals.push(`${delta >= 0 ? "+" : ""}${delta} ${label}`);
  };

  signals.push(`base ${score} (${attachment.type})`);
  const semantics = attachmentSemantics(attachment);
  const role = (attachment.role || "").toLowerCase();
  const url = (attachment.url || "").toLowerCase();
  const signal = `${role} ${url}`;
  const localeBonus = localeBonusForAttachmentRole(semantics.region);
  if (localeBonus !== 0) {
    addSignal(
      localeBonus,
      `locale ${semantics.region || role || "unknown"}`,
    );
  }

  if (isPhysicalNonCoverKind(semantics.kind)) {
    addSignal(-320, `${semantics.kind} media`);
  } else if (isDiscOrSupportCoverCandidate(attachment)) {
    addSignal(-320, "disc/support media");
  }

  if (COVER_FRIENDLY_TYPES.has(attachment.type)) {
    if (semantics.kind === "cover3d") {
      addSignal(-60, "3D cover penalty");
    }
    if (attachment.source?.toLowerCase().trim() === "coverproject") {
      addSignal(-250, "CoverProject full wrap penalty");
    }
    if (
      isCoverCandidateKind(semantics.kind) &&
      attachment.type === "cover" &&
      isRealBoxCoverSource(attachment.source)
    ) {
      addSignal(220, "real box cover source");
    }
    if (
      isCoverCandidateKind(semantics.kind) &&
      /(front|cover|box[-_\s]?art|box[-_\s]?2d|jaquette|poster|keyart|official)/.test(
        signal,
      )
    ) {
      addSignal(90, "front/cover signal");
    }
    if (
      !isPhysicalNonCoverKind(semantics.kind) &&
      /\b(?:back|rear|verso|spine|disc|inside)\b/.test(signal)
    ) {
      addSignal(-220, "back/disc signal");
    }
    if (/\bmedia\b(?!=)/.test(signal)) {
      addSignal(-220, "back/disc media signal");
    }
    if (
      /(thumb|tiny|small|icon|avatar|capsule|header|banner|preview|sprite)/.test(
        signal,
      )
    ) {
      addSignal(-170, "thumbnail-like signal");
    }
    if (/(full|large|original|highres|hires|1080|1440|2160|4k)/.test(signal)) {
      addSignal(35, "high-resolution hint");
    }
    if (/(background|wallpaper|fanart)/.test(signal)) {
      addSignal(-55, "background-like signal");
    }
  } else if (
    attachment.type === "screenshot" ||
    attachment.type === "background"
  ) {
    if (/(thumb|tiny|small|icon)/.test(signal))
      addSignal(-60, "small screenshot");
    if (/(full|large|1080|1440|2160|4k)/.test(signal)) {
      addSignal(20, "large screenshot");
    }
  }

  const width = imageMetrics?.width;
  const height = imageMetrics?.height;
  const format = imageMetrics?.format;
  if (width && height) {
    const area = width * height;
    if (area >= 2_000_000) addSignal(120, ">=2MP");
    else if (area >= 1_000_000) addSignal(80, ">=1MP");
    else if (area >= 500_000) addSignal(45, ">=0.5MP");
    else if (area >= 200_000) addSignal(10, ">=0.2MP");
    else addSignal(-120, "<0.2MP");

    if (Math.min(width, height) < 240) addSignal(-140, "small shortest edge");

    const ratio = width / height;
    if (COVER_FRIENDLY_TYPES.has(attachment.type)) {
      const targetRatio = 0.7;
      const ratioDistance = Math.abs(ratio - targetRatio);
      addSignal(
        Math.max(-120, 140 - ratioDistance * 260),
        "cover aspect ratio fit",
      );
      if (height > width) addSignal(25, "portrait orientation");
      else addSignal(-65, "landscape orientation");
    } else if (
      attachment.type === "screenshot" ||
      attachment.type === "background"
    ) {
      const targetRatio = 16 / 9;
      const ratioDistance = Math.abs(ratio - targetRatio);
      addSignal(
        Math.max(-70, 70 - ratioDistance * 90),
        "screenshot aspect ratio fit",
      );
    }
  }

  return {
    score: Math.round(score),
    signals,
    width: width || undefined,
    height: height || undefined,
    aspectRatio:
      width && height ? Number((width / height).toFixed(3)) : undefined,
    format: format || undefined,
  };
}

export function explainAttachmentScoreForDisplay(
  attachment: ScoredAttachmentInput,
  imageMetrics?: AttachmentImageMetrics | null,
): AttachmentDisplayScoreDetails {
  return buildAttachmentDisplayScoreDetails(attachment, imageMetrics);
}

export function scoreAttachmentForDisplay(
  attachment: ScoredAttachmentInput,
  imageMetrics?: AttachmentImageMetrics | null,
): number {
  return explainAttachmentScoreForDisplay(attachment, imageMetrics).score;
}

export function rankScoredAttachments<T extends ScoredAttachmentInput>(
  scoredEntries: Array<{ attachment: T; score: number; index: number }>,
): T[] {
  const bestByUrl = new Map<
    string,
    { attachment: T; score: number; index: number; sources: Set<string> }
  >();

  for (const entry of scoredEntries) {
    if (!entry.attachment.url) continue;
    const source = normalizeAttachmentSource(entry.attachment.source);
    const existing = bestByUrl.get(entry.attachment.url);
    if (!existing) {
      bestByUrl.set(entry.attachment.url, {
        attachment: entry.attachment,
        score: entry.score,
        index: entry.index,
        sources: new Set(source ? [source] : []),
      });
    } else {
      const mergedRole = existing.attachment.role || entry.attachment.role || null;
      const mergedSource = existing.attachment.source || entry.attachment.source || null;
      const mergedTitle = existing.attachment.title || entry.attachment.title || null;

      const mergedAttachment: T = {
        ...existing.attachment,
        role: mergedRole,
        source: mergedSource,
        title: mergedTitle,
      };

      const keepExisting =
        existing.score > entry.score ||
        (existing.score === entry.score && existing.index < entry.index);

      if (source) existing.sources.add(source);

      bestByUrl.set(entry.attachment.url, {
        attachment: mergedAttachment,
        score: keepExisting ? existing.score : entry.score,
        index: keepExisting ? existing.index : entry.index,
        sources: existing.sources,
      });
    }
  }

  return Array.from(bestByUrl.values())
    .map((entry) => ({
      attachment: entry.attachment,
      index: entry.index,
      score: entry.score + crossSourceConsensusBonus(entry.sources.size),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.attachment);
}

export function rankAttachmentsForDisplay<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
): T[] {
  return rankScoredAttachments(
    attachments.map((attachment, index) => ({
      attachment,
      index,
      score: scoreAttachmentForDisplay(
        attachment,
        imageMetricsByUrl?.get(attachment.url),
      ),
    })),
  );
}

export function pickBestDisplayImageUrl(
  attachments: Array<Pick<ScoredAttachmentInput, "type" | "url">>,
): string | undefined {
  for (const type of DISPLAY_COVER_PRIORITY_ORDER) {
    const candidate = attachments.find(
      (attachment) => attachment.type === type && Boolean(attachment.url),
    );
    if (candidate?.url) return candidate.url;
  }
  return attachments.find((attachment) => Boolean(attachment.url))?.url;
}

export function rankCoversForDisplay<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
): T[] {
  const scored = attachments.map((attachment, index) => {
    const semantics = attachmentSemantics(attachment);
    const is3d = semantics.kind === "cover3d";
    const isCoverProject =
      attachment.source?.toLowerCase().trim() === "coverproject";
    const isFrontCover =
      isCoverCandidateKind(semantics.kind) &&
      !isPhysicalNonCoverKind(semantics.kind);

    let typeRank = 3; // default for non-front covers (back, disc, spine, etc.)
    if (isFrontCover) {
      if (is3d) {
        typeRank = 1; // 3D
      } else if (isCoverProject) {
        typeRank = 2; // CoverProject full wrap
      } else {
        typeRank = 0; // 2D Standard
      }
    }

    return {
      attachment,
      index,
      typeRank,
      regionRankValue: regionRank(semantics.region),
      score: scoreAttachmentForDisplay(
        attachment,
        imageMetricsByUrl?.get(attachment.url),
      ),
    };
  });

  const bestByUrl = new Map<
    string,
    {
      attachment: T;
      score: number;
      index: number;
      typeRank: number;
      regionRankValue: number;
      sources: Set<string>;
    }
  >();

  for (const entry of scored) {
    if (!entry.attachment.url) continue;
    const source = normalizeAttachmentSource(entry.attachment.source);
    const existing = bestByUrl.get(entry.attachment.url);
    if (!existing) {
      bestByUrl.set(entry.attachment.url, {
        ...entry,
        sources: new Set(source ? [source] : []),
      });
    } else {
      const mergedRole =
        existing.attachment.role || entry.attachment.role || null;
      const mergedSource =
        existing.attachment.source || entry.attachment.source || null;
      const mergedTitle =
        existing.attachment.title || entry.attachment.title || null;

      const mergedAttachment: T = {
        ...existing.attachment,
        role: mergedRole,
        source: mergedSource,
        title: mergedTitle,
      };

      const keepExisting =
        existing.typeRank < entry.typeRank ||
        (existing.typeRank === entry.typeRank &&
          (existing.regionRankValue < entry.regionRankValue ||
            (existing.regionRankValue === entry.regionRankValue &&
              (existing.score > entry.score ||
                (existing.score === entry.score &&
                  existing.index < entry.index)))));

      if (source) existing.sources.add(source);

      bestByUrl.set(entry.attachment.url, {
        attachment: mergedAttachment,
        sources: existing.sources,
        score: keepExisting ? existing.score : entry.score,
        index: keepExisting ? existing.index : entry.index,
        typeRank: keepExisting ? existing.typeRank : entry.typeRank,
        regionRankValue: keepExisting
          ? existing.regionRankValue
          : entry.regionRankValue,
      });
    }
  }

  return Array.from(bestByUrl.values())
    .map((entry) => ({
      ...entry,
      score: entry.score + crossSourceConsensusBonus(entry.sources.size),
    }))
    .sort(
      (a, b) =>
        a.typeRank - b.typeRank ||
        a.regionRankValue - b.regionRankValue ||
        b.score - a.score ||
        a.index - b.index,
    )
    .map((entry) => entry.attachment);
}

export function pickBestCoverFromAttachments<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
): string | null {
  const localizedCovers = attachments.filter((attachment) => {
    if (!attachment.url) return false;
    const semantics = attachmentSemantics(attachment);
    return (
      isCoverCandidateKind(semantics.kind) &&
      semantics.region &&
      !isPhysicalNonCoverKind(semantics.kind)
    );
  });

  if (localizedCovers.length > 0) {
    const ranked = rankCoversForDisplay(localizedCovers, imageMetricsByUrl);
    if (ranked.length > 0 && ranked[0].url) {
      return ranked[0].url;
    }
  }

  const ranked = rankAttachmentsForDisplay(attachments, imageMetricsByUrl);
  const coverCandidates = ranked.filter((attachment) => {
    const semantics = attachmentSemantics(attachment);
    return isCoverCandidateKind(semantics.kind);
  });
  return pickBestDisplayImageUrl(coverCandidates) || null;
}
