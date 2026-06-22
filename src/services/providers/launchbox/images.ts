import type { MetadataAttachment } from "@/types/metadataProvider";
import { resolveLocaleRegion } from "@/lib/localePreference";

import { decodeLaunchBoxTitle } from "./matchScore";
import type { LaunchBoxImageRecord } from "./parse";

export const LAUNCHBOX_IMAGE_BASE_URL = "https://images.launchbox-app.com/";

const REGION_PRIORITY = [
  "europe",
  "france",
  "world",
  "north america",
  "australia",
  "japan",
  "germany",
  "spain",
  "italy",
  "canada",
  "brazil",
  "korea",
];

const COVER_TYPE_PRIORITY = [
  "Box - Front",
  "Box - Front - Reconstructed",
  "Cart - Front",
  "Fanart - Box - Front",
  "Box - 3D",
  "Square",
];

const BACKGROUND_TYPE_PRIORITY = ["Fanart - Background"];

const LOGO_TYPE_PRIORITY = ["Clear Logo"];

const SCREENSHOT_TYPE_PRIORITY = [
  "Screenshot - Gameplay",
  "Screenshot - Game Title",
  "Screenshot - Game Select",
];

const BACK_TYPE_PRIORITY = [
  "Box - Back",
  "Box - Back - Reconstructed",
  "Fanart - Box - Back",
  "Cart - Back",
  "Advertisement Flyer - Back",
];

const SPINE_TYPE_PRIORITY = ["Box - Spine"];

const DISC_TYPE_PRIORITY = ["Disc", "Fanart - Disc"];

const HANDLED_IMAGE_TYPES = new Set([
  ...COVER_TYPE_PRIORITY,
  ...BACKGROUND_TYPE_PRIORITY,
  ...LOGO_TYPE_PRIORITY,
  ...SCREENSHOT_TYPE_PRIORITY,
  ...BACK_TYPE_PRIORITY,
  ...SPINE_TYPE_PRIORITY,
  ...DISC_TYPE_PRIORITY,
]);

function normalizeRegion(region?: string | null): string {
  return region?.trim().toLowerCase() || "";
}

function regionScore(region?: string | null): number {
  const normalized = normalizeRegion(region);
  if (!normalized) return REGION_PRIORITY.length;
  const index = REGION_PRIORITY.indexOf(normalized);
  return index === -1 ? REGION_PRIORITY.length - 1 : index;
}

function imageUrl(fileName: string): string {
  return `${LAUNCHBOX_IMAGE_BASE_URL}${fileName}`;
}

function localizedRegionRole(region?: string | null): string | undefined {
  const normalized = normalizeRegion(region);
  if (!normalized) return undefined;
  return resolveLocaleRegion(normalized) || normalized;
}

function mapBackRole(region?: string | null): string {
  const locale = localizedRegionRole(region);
  return locale ? `back-${locale}` : "back";
}

function mapDiscRole(region?: string | null): string {
  const locale = localizedRegionRole(region);
  return locale ? `disc-${locale}` : "disc";
}

function mapSpineRole(region?: string | null): string {
  const locale = localizedRegionRole(region);
  return locale ? `spine-${locale}` : "spine";
}

function pickBestImage(
  images: LaunchBoxImageRecord[],
  typePriority: string[],
): LaunchBoxImageRecord | null {
  const allowed = new Set(typePriority);
  const candidates = images.filter((image) => allowed.has(image.type));
  if (candidates.length === 0) return null;

  return candidates
    .slice()
    .sort(
      (a, b) =>
        typePriority.indexOf(a.type) - typePriority.indexOf(b.type) ||
        regionScore(a.region) - regionScore(b.region),
    )[0];
}

function mapAttachmentType(
  imageType: string,
): MetadataAttachment["type"] {
  if (COVER_TYPE_PRIORITY.includes(imageType)) return "cover";
  if (BACKGROUND_TYPE_PRIORITY.includes(imageType)) return "background";
  if (LOGO_TYPE_PRIORITY.includes(imageType)) return "logo";
  if (SCREENSHOT_TYPE_PRIORITY.includes(imageType)) return "screenshot";
  if (imageType.startsWith("Fanart")) return "artwork";
  return "image";
}

export function buildLaunchBoxAttachments(
  images: LaunchBoxImageRecord[],
): MetadataAttachment[] {
  const attachments: MetadataAttachment[] = [];
  const seenUrls = new Set<string>();

  const pushImage = (
    image: LaunchBoxImageRecord | null,
    options: {
      forcedType?: MetadataAttachment["type"];
      role?: string;
    } = {},
  ) => {
    if (!image) return;
    const url = imageUrl(image.fileName);
    if (seenUrls.has(url)) return;
    seenUrls.add(url);

    attachments.push({
      type: options.forcedType ?? mapAttachmentType(image.type),
      title: decodeLaunchBoxTitle(image.type),
      url,
      role:
        options.role ??
        (image.region ? localizedRegionRole(image.region) : undefined),
      source: "launchbox",
    });
  };

  const bestCover = pickBestImage(images, COVER_TYPE_PRIORITY);
  const bestBack = pickBestImage(images, BACK_TYPE_PRIORITY);
  const bestSpine = pickBestImage(images, SPINE_TYPE_PRIORITY);
  const bestDisc = pickBestImage(images, DISC_TYPE_PRIORITY);

  pushImage(bestCover, { forcedType: "cover" });
  pushImage(bestBack, {
    forcedType: "image",
    role: mapBackRole(bestBack?.region),
  });
  pushImage(bestSpine, {
    forcedType: "image",
    role: mapSpineRole(bestSpine?.region),
  });
  pushImage(bestDisc, {
    forcedType: "image",
    role: mapDiscRole(bestDisc?.region),
  });
  pushImage(pickBestImage(images, BACKGROUND_TYPE_PRIORITY), {
    forcedType: "background",
  });
  pushImage(pickBestImage(images, LOGO_TYPE_PRIORITY), { forcedType: "logo" });

  const screenshots = images
    .filter((image) => SCREENSHOT_TYPE_PRIORITY.includes(image.type))
    .sort(
      (a, b) =>
        SCREENSHOT_TYPE_PRIORITY.indexOf(a.type) -
          SCREENSHOT_TYPE_PRIORITY.indexOf(b.type) ||
        regionScore(a.region) - regionScore(b.region),
    )
    .slice(0, 4);

  for (const screenshot of screenshots) {
    pushImage(screenshot, { forcedType: "screenshot" });
  }

  const extras = images
    .filter((image) => !HANDLED_IMAGE_TYPES.has(image.type))
    .sort(
      (a, b) =>
        regionScore(a.region) - regionScore(b.region) ||
        a.type.localeCompare(b.type),
    )
    .slice(0, 6);

  for (const extra of extras) {
    pushImage(extra);
  }

  return attachments;
}

export function pickLaunchBoxCoverUrl(
  images: LaunchBoxImageRecord[],
): string | undefined {
  const cover = pickBestImage(images, COVER_TYPE_PRIORITY);
  return cover ? imageUrl(cover.fileName) : undefined;
}
