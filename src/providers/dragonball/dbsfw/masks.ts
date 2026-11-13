/**
 * Fusion World client bundles → catalogue mask files.
 *
 * A card bundle is `packdata_assets_card_series_{set}_{set}-{number}[_{variant}].bundle`.
 * Holo, foil, effect and alpha textures in it are masks for that print.
 * The face, the text and the thumbnail are not.
 */

export type FwCardBundle = {
  set: string;
  number: string;
  /** Folder under `cards/{lang}/{set}/`. */
  folder: string;
  /**
   * `front` / `back` bundles are a split of the same print. They must not
   * replace a mask already written from the full bundle.
   */
  partial: boolean;
};

export type FwMaskTexture = {
  file: string;
  langs: readonly ("en" | "ja")[];
};

const BUNDLE_RE =
  /^packdata_assets_card_series_([a-z0-9]+)_([a-z0-9]+-.+)\.bundle$/i;

function strippedVariant(variant: string): string {
  if (variant === "front" || variant === "back") return "";
  if (variant.startsWith("front_")) return variant.slice("front_".length);
  if (variant.startsWith("back_")) return variant.slice("back_".length);
  return variant;
}

function folderForVariant(number: string, variant: string): string {
  const body = strippedVariant(variant);
  if (!body) return number;
  if (body === "para") return `${number}-p1`;
  return `${number}-${body.replaceAll("_", "-")}`;
}

export function fusionWorldCardBundle(fileName: string): FwCardBundle | null {
  const match = BUNDLE_RE.exec(fileName);
  if (!match) return null;
  const set = match[1]!.toLowerCase();
  const tail = match[2]!.toLowerCase();
  const prefix = `${set}-`;
  if (!tail.startsWith(prefix)) return null;
  const after = tail.slice(prefix.length);
  const cut = after.indexOf("_");
  const number = cut === -1 ? after : after.slice(0, cut);
  if (!number) return null;
  const variant = cut === -1 ? "" : after.slice(cut + 1);
  const partial =
    variant === "front" ||
    variant === "back" ||
    variant.startsWith("front_") ||
    variant.startsWith("back_");
  return {
    set,
    number,
    folder: folderForVariant(number, variant),
    partial,
  };
}

/** Mask file for one client texture, or null when the texture is not a mask. */
export function fusionWorldMaskTexture(name: string): FwMaskTexture | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized || /text|thumb/.test(normalized)) return null;
  if (!/holo|foil|ef_mask|alp/.test(normalized)) return null;

  let file = "mask.webp";
  const effect = /ef_mask(\d+)(_cf)?/.exec(normalized);
  if (effect) {
    file = `mask-ef-${effect[1]}${effect[2] ? "-cf" : ""}.webp`;
  } else if (normalized.includes("holo_field")) {
    file = "mask-field.webp";
  } else if (normalized.includes("holo")) {
    file = "mask.webp";
  } else if (normalized.includes("foil")) {
    file = "mask-foil.webp";
  } else if (normalized.includes("alp_to")) {
    file = "mask-alpha-to.webp";
  } else if (normalized.includes("alp")) {
    file = "mask-alpha.webp";
  }

  const langs: readonly ("en" | "ja")[] =
    /_ja(?:_|$)/.test(normalized)
      ? ["ja"]
      : /_en(?:_|$)/.test(normalized)
        ? ["en"]
        : ["en", "ja"];
  return { file, langs };
}

/**
 * Illustration, chrome and text beside a face. The back face has its own
 * trio so a double-sided leader does not wear the front plate.
 */
export function dbsFwLayerSurfaces(faceUrl: string): {
  frontUrl: string;
  frameUrl: string;
  inkUrl: string;
} | null {
  const back = /\/back\.[^/]+$/i.test(faceUrl);
  const picture = back ? "layer.back-picture.webp" : "layer.picture.webp";
  const frame = back ? "layer.back-frame.webp" : "layer.frame.webp";
  const ink = back ? "layer.back-text.webp" : "layer.text.webp";
  const frontUrl = dbsFwCatalogueMaskUrl(faceUrl, picture);
  const frameUrl = dbsFwCatalogueMaskUrl(faceUrl, frame);
  const inkUrl = dbsFwCatalogueMaskUrl(faceUrl, ink);
  if (!frontUrl || !frameUrl || !inkUrl) return null;
  return { frontUrl, frameUrl, inkUrl };
}

/** `…/cards/en/sb02/024/art.webp` → `…/cards/en/sb02/024/mask.webp`. */
export function dbsFwCatalogueMaskUrl(
  faceUrl: string,
  file: string,
): string | null {
  const match = /^(.*\/cards\/[^/]+\/[^/]+\/[^/]+)\/[^/]+$/.exec(faceUrl);
  if (!match) return null;
  return `${match[1]}/${file}`;
}

/** First coverage mask a print should wear, when that file is on disk. */
export function dbsFwCoverageMaskFile(
  present: (file: string) => boolean,
): string | null {
  if (present("mask.webp")) return "mask.webp";
  if (present("mask-foil.webp")) return "mask-foil.webp";
  return null;
}

let knownMaskUrls: Set<string> | null = null;

export function setDbsFwMaskUrls(urls: Iterable<string>): void {
  knownMaskUrls = new Set(urls);
}

export function dbsFwMasksReady(): boolean {
  return knownMaskUrls != null;
}

export function dbsFwKnownMaskUrl(faceUrl: string, file: string): string | null {
  if (!knownMaskUrls) return null;
  const url = dbsFwCatalogueMaskUrl(faceUrl, file);
  if (!url || !knownMaskUrls.has(url)) return null;
  return url;
}
