import { detectPlatformKey } from "@/lib/barcode/query";

const CDN_BASE = "https://coverproject.sfo2.cdn.digitaloceanspaces.com";
const CDN_REFERER = "https://www.thecoverproject.net/";

type PlatformSpec = { folder: string; prefix: string };

const PLATFORM_SPECS: Record<string, PlatformSpec[]> = {
  wii: [{ folder: "nintendo_wii", prefix: "wii_" }],
  wiiu: [
    { folder: "nintendo_wii_u", prefix: "wiiu_" },
    { folder: "wii_u", prefix: "wiiu_" },
  ],
  switch: [{ folder: "nintendo_switch", prefix: "switch_" }],
  ds: [{ folder: "nintendo_ds", prefix: "ds_" }],
  "3ds": [{ folder: "nintendo_3ds", prefix: "3ds_" }],
  ps1: [
    { folder: "playstation", prefix: "ps_" },
    { folder: "playstation_1", prefix: "ps1_" },
  ],
  ps2: [{ folder: "playstation_2", prefix: "ps2_" }],
  ps3: [{ folder: "playstation_3", prefix: "ps3_" }],
  ps4: [{ folder: "playstation_4", prefix: "ps4_" }],
  ps5: [{ folder: "playstation_5", prefix: "ps5_" }],
  gamecube: [
    { folder: "gamecube", prefix: "gc_" },
    { folder: "nintendo_gamecube", prefix: "gc_" },
  ],
  xbox: [{ folder: "xbox", prefix: "xbox_" }],
  xbox360: [{ folder: "xbox_360", prefix: "xbox360_" }],
  gba: [{ folder: "gameboy_advance", prefix: "gba_" }],
  gb: [{ folder: "gameboy", prefix: "gb_" }],
  gbc: [{ folder: "gameboy_color", prefix: "gbc_" }],
  n64: [{ folder: "nintendo_64", prefix: "n64_" }],
  snes: [{ folder: "super_nintendo", prefix: "snes_" }],
  nes: [{ folder: "nintendo", prefix: "nes_" }],
};

const REGION_SUFFIXES = ["", "_us", "_eu", "_pal", "_jp", "_wor", "_ntsc"];
const IMAGE_SUFFIXES = ["cover", "thumb"] as const;

export function slugCoverProjectTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function stripLeadingArticles(value: string): string {
  return value
    .replace(/\b(the|a|an|le|la|les|l')\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveCoverProjectPlatformKey(
  name: string,
  platformName: string,
): string | null {
  return (
    detectPlatformKey(platformName) ||
    detectPlatformKey(name) ||
    detectPlatformKey(`${name} ${platformName}`)
  );
}

export function buildCoverProjectCdnCandidates(
  name: string,
  platformName: string,
): string[] {
  const platformKey = resolveCoverProjectPlatformKey(name, platformName);
  const specs = platformKey ? PLATFORM_SPECS[platformKey] || [] : [];
  if (specs.length === 0) return [];

  const titleSlugs = Array.from(
    new Set(
      [name, stripLeadingArticles(name)]
        .map(slugCoverProjectTitle)
        .filter(Boolean),
    ),
  );

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    for (const titleSlug of titleSlugs) {
      for (const region of REGION_SUFFIXES) {
        for (const imageSuffix of IMAGE_SUFFIXES) {
          const fileName = `${spec.prefix}${titleSlug}${region}_${imageSuffix}.jpg`;
          const url = `${CDN_BASE}/${spec.folder}/${fileName}`;
          if (seen.has(url)) continue;
          seen.add(url);
          urls.push(url);
        }
      }
    }
  }

  return urls;
}

async function cdnAssetExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: CDN_REFERER,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchCoverFromCoverProjectCdn(
  name: string,
  platformName: string,
): Promise<string | null> {
  const candidates = buildCoverProjectCdnCandidates(name, platformName);
  for (const url of candidates) {
    if (await cdnAssetExists(url)) {
      return url;
    }
  }
  return null;
}
