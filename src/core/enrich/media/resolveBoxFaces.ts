import {
  resolveAttachmentDisplayKind,
  resolveAttachmentDisplayRegion,
  type AttachmentDisplayKind,
} from "@/core/enrich/media/attachmentDisplayLabels";
import {
  isAttachmentCoverPlatformMismatch,
  platformMatchRank,
} from "@/core/enrich/media/attachmentPlatformGate";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import type { LocaleRegion } from "@/core/locale/preference";

/**
 * Flat attachment-shaped input for assembling a CSS 3D game box.
 * Matches gallery / metadata attachment fields without pulling Prisma.
 */
export type BoxFaceAttachment = {
  url?: string | null;
  type?: string | null;
  role?: string | null;
  title?: string | null;
  source?: string | null;
  /** Persisted at enrichment — survives /uploads localization. */
  platformKey?: string | null;
};

export type ResolvedBoxFaces =
  | {
      complete: true;
      front: string;
      back: string;
      spine: string;
    }
  | {
      complete: false;
      front?: string;
      back?: string;
      spine?: string;
    };

const REGION_PREFERENCE: LocaleRegion[] = [
  "fr",
  "eu",
  "wor",
  "uk",
  "us",
  "jp",
];

type RankedCandidate = {
  url: string;
  region: LocaleRegion | null;
  attachment: BoxFaceAttachment;
};

function regionRank(
  region: LocaleRegion | null,
  preferred?: LocaleRegion | null,
): number {
  if (preferred && region === preferred) return -1;
  if (!region) return REGION_PREFERENCE.length + 1;
  const index = REGION_PREFERENCE.indexOf(region);
  return index === -1 ? REGION_PREFERENCE.length : index;
}

function faceKind(
  attachment: BoxFaceAttachment,
): "front" | "back" | "spine" | null {
  const kind: AttachmentDisplayKind = resolveAttachmentDisplayKind({
    type: attachment.type || "image",
    role: attachment.role,
    title: attachment.title,
    source: attachment.source,
  });
  // Pre-rendered packshots (cover3d / grids) are not unfoldable box faces.
  if (kind === "cover") return "front";
  if (kind === "back") return "back";
  if (kind === "spine") return "spine";
  return null;
}

/**
 * Prefer shelf-platform faces, then region. Explicit foreign platforms (PC spine
 * on a PS2 shelf) are dropped when a preferred platform is set — better an
 * incomplete box than a confidently wrong one.
 */
function pickBestUrl(
  candidates: RankedCandidate[],
  preferredRegion?: LocaleRegion | null,
  preferredPlatformKey?: string | null,
): string | undefined {
  const eligible = preferredPlatformKey
    ? candidates.filter(
        (c) =>
          !isAttachmentCoverPlatformMismatch(
            {
              type: c.attachment.type || "image",
              role: c.attachment.role,
              title: c.attachment.title,
              url: c.attachment.url,
              platformKey: c.attachment.platformKey,
            },
            preferredPlatformKey,
          ),
      )
    : candidates;
  if (eligible.length === 0) return undefined;

  const sorted = [...eligible].sort((a, b) => {
    const platformDelta =
      platformMatchRank(
        {
          type: a.attachment.type || "image",
          role: a.attachment.role,
          title: a.attachment.title,
          url: a.attachment.url,
          platformKey: a.attachment.platformKey,
        },
        preferredPlatformKey,
      ) -
      platformMatchRank(
        {
          type: b.attachment.type || "image",
          role: b.attachment.role,
          title: b.attachment.title,
          url: b.attachment.url,
          platformKey: b.attachment.platformKey,
        },
        preferredPlatformKey,
      );
    if (platformDelta !== 0) return platformDelta;
    return (
      regionRank(a.region, preferredRegion) -
      regionRank(b.region, preferredRegion)
    );
  });
  return sorted[0]?.url;
}

function toCandidate(attachment: BoxFaceAttachment): RankedCandidate | null {
  const url = attachment.url?.trim();
  if (!url) return null;
  return {
    url,
    region: resolveAttachmentDisplayRegion({
      type: attachment.type || "image",
      role: attachment.role,
      title: attachment.title,
    }),
    attachment,
  };
}

/**
 * Resolve front / back / spine URLs for a rotatable CSS game box.
 *
 * Completeness is honest: all three faces required. A lone cover stays a flat
 * cover — never invent depth from a single packshot.
 */
export function resolveBoxFaces(
  attachments: readonly BoxFaceAttachment[],
  options?: {
    /** Fallback when no typed cover attachment exists (item.imageUrl). */
    fallbackFrontUrl?: string | null;
    preferredRegion?: LocaleRegion | null;
    /** Shelf / metadata platform — drop foreign PC spines on a PS2 item, etc. */
    preferredPlatformKey?: string | null;
  },
): ResolvedBoxFaces {
  const fronts: RankedCandidate[] = [];
  const backs: RankedCandidate[] = [];
  const spines: RankedCandidate[] = [];
  const seen = new Set<string>();

  for (const attachment of attachments) {
    const candidate = toCandidate(attachment);
    if (!candidate || seen.has(candidate.url)) continue;
    const slot = faceKind(attachment);
    if (!slot) continue;
    seen.add(candidate.url);
    if (slot === "front") fronts.push(candidate);
    else if (slot === "back") backs.push(candidate);
    else spines.push(candidate);
  }

  const preferred = options?.preferredRegion ?? null;
  const platform = options?.preferredPlatformKey ?? null;
  let front = pickBestUrl(fronts, preferred, platform);
  const back = pickBestUrl(backs, preferred, platform);
  const spine = pickBestUrl(spines, preferred, platform);

  const fallback = options?.fallbackFrontUrl?.trim() || undefined;
  if (!front && fallback && back && spine) {
    front = fallback;
  }

  if (front && back && spine) {
    return { complete: true, front, back, spine };
  }
  return {
    complete: false,
    ...(front ? { front } : {}),
    ...(back ? { back } : {}),
    ...(spine ? { spine } : {}),
  };
}

/**
 * Best disc / support art URL for a loose Disc3D hero, or null when none.
 * When `preferredUrl` matches a disc attachment (user gallery pin), honor it
 * instead of re-ranking region/platform — same contract as getCoverImage pins.
 */
export function resolveDiscFace(
  attachments: readonly BoxFaceAttachment[],
  options?: {
    preferredRegion?: LocaleRegion | null;
    preferredPlatformKey?: string | null;
    preferredUrl?: string | null;
  },
): string | null {
  const candidates: RankedCandidate[] = [];
  const seen = new Set<string>();

  for (const attachment of attachments) {
    const candidate = toCandidate(attachment);
    if (!candidate || seen.has(candidate.url)) continue;
    const kind: AttachmentDisplayKind = resolveAttachmentDisplayKind({
      type: attachment.type || "image",
      role: attachment.role,
      title: attachment.title,
      source: attachment.source,
    });
    if (kind !== "disc") continue;
    seen.add(candidate.url);
    candidates.push(candidate);
  }

  const preferred = options?.preferredUrl?.trim() || null;
  if (preferred) {
    const pinned = candidates.find((candidate) =>
      urlsReferToSameLocalizedImage(candidate.url, preferred),
    );
    if (pinned) return pinned.url;
    // Pin may be a localized /uploads copy not yet mirrored on the attachment
    // url field — still prefer it when it is the user's selected disc image.
    for (const attachment of attachments) {
      const url = attachment.url?.trim();
      if (!url || !urlsReferToSameLocalizedImage(url, preferred)) continue;
      const kind: AttachmentDisplayKind = resolveAttachmentDisplayKind({
        type: attachment.type || "image",
        role: attachment.role,
        title: attachment.title,
        source: attachment.source,
      });
      if (kind === "disc") return preferred;
    }
  }

  return (
    pickBestUrl(
      candidates,
      options?.preferredRegion ?? null,
      options?.preferredPlatformKey ?? null,
    ) ?? null
  );
}
