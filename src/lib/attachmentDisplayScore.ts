import type { AttachmentType } from "@prisma/client";

import {
  localeBonusForAttachmentRole,
  parseRegionFromRole,
} from "@/lib/localePreference";

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
  const role = (attachment.role || "").toLowerCase();
  const url = (attachment.url || "").toLowerCase();
  const signal = `${role} ${url}`;
  const localeBonus = localeBonusForAttachmentRole(attachment.role);
  if (localeBonus !== 0) {
    addSignal(
      localeBonus,
      `locale ${parseRegionFromRole(attachment.role) || role || "unknown"}`,
    );
  }

  if (COVER_FRIENDLY_TYPES.has(attachment.type)) {
    if (
      /(front|cover|box[-_\s]?art|box[-_\s]?2d|jaquette|poster|keyart|official)/.test(
        signal,
      )
    ) {
      addSignal(90, "front/cover signal");
    }
    if (/(back|rear|verso|spine|disc|media|inside)/.test(signal)) {
      addSignal(-220, "back/disc signal");
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
    { attachment: T; score: number; index: number }
  >();

  for (const entry of scoredEntries) {
    if (!entry.attachment.url) continue;
    const existing = bestByUrl.get(entry.attachment.url);
    if (
      !existing ||
      entry.score > existing.score ||
      (entry.score === existing.score && entry.index < existing.index)
    ) {
      bestByUrl.set(entry.attachment.url, entry);
    }
  }

  return Array.from(bestByUrl.values())
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

export function pickBestCoverFromAttachments<T extends ScoredAttachmentInput>(
  attachments: T[],
): string | null {
  const ranked = rankAttachmentsForDisplay(attachments);
  return pickBestDisplayImageUrl(ranked) || null;
}
