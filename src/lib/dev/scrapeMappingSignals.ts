/**
 * Discoverable field/image signals on scraped pages or intermediate fetch
 * objects — used by the provider mapping audit to detect under-extraction.
 */

import type { Capability } from "@/types/providerRegistry";

const IMAGE_URL =
  /^https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif|avif)(?:[?#][^\s"'<>]*)?$/i;

function normalizeSignal(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function pushUnique(target: Set<string>, ...values: string[]) {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) target.add(trimmed);
  }
}

export function collectCapabilityExpectedSignals(
  capabilities: Capability[] = [],
): string[] {
  const signals = new Set<string>();
  for (const capability of capabilities) {
    switch (capability) {
      case "cover":
        pushUnique(signals, "image:cover", "field:imageurl", "field:cover");
        break;
      case "screenshots":
        pushUnique(
          signals,
          "image:gallery",
          "image:screenshot",
          "field:screenshots",
        );
        break;
      case "description":
        pushUnique(
          signals,
          "field:description",
          "field:synopsis",
          "field:overview",
        );
        break;
      case "price":
        pushUnique(
          signals,
          "field:price",
          "field:pricecents",
          "field:pricenew",
        );
        break;
      case "rating":
        pushUnique(signals, "field:rating", "field:ratingvalue");
        break;
      case "ageRating":
        pushUnique(signals, "field:agerating", "field:certification");
        break;
      case "releaseDate":
        pushUnique(
          signals,
          "field:releasedate",
          "field:year",
          "field:released",
        );
        break;
      case "people":
        pushUnique(signals, "field:authors", "field:people", "field:director");
        break;
      case "players":
        pushUnique(signals, "field:players", "field:maxplayers");
        break;
      case "duration":
        pushUnique(
          signals,
          "field:duration",
          "field:playtime",
          "field:runtime",
        );
        break;
      case "identify":
        pushUnique(signals, "field:title", "field:name", "field:barcode");
        break;
      default:
        break;
    }
  }
  return [...signals].sort((a, b) => a.localeCompare(b, "fr"));
}

export function collectHtmlMappingSignals(html: string): string[] {
  const signals = new Set<string>();
  if (!html.trim()) return [];

  for (const match of html.matchAll(
    /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']+)["']/gi,
  )) {
    const key = match[1]?.toLowerCase();
    if (key?.includes("image"))
      pushUnique(signals, "image:cover", `meta:${key}`);
    if (key?.includes("description"))
      pushUnique(signals, "field:description", `meta:${key}`);
    if (key?.includes("title"))
      pushUnique(signals, "field:title", `meta:${key}`);
  }

  for (const match of html.matchAll(
    /<input[^>]+type=["']hidden["'][^>]+id=["']([^"']+)["'][^>]+value=["']([^"']*)["']/gi,
  )) {
    const id = match[1]?.trim();
    const value = match[2]?.trim();
    if (!id || !value) continue;
    pushUnique(
      signals,
      `field:${normalizeSignal(id)}`,
      `hidden:${normalizeSignal(id)}`,
    );
    if (/ean|isbn|barcode/i.test(id))
      pushUnique(signals, "field:barcode", "field:ean");
    if (/couverture|cover/i.test(id)) pushUnique(signals, "image:cover");
    if (/page/i.test(id)) pushUnique(signals, "field:pagecount");
  }

  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(match[1].trim());
      for (const key of collectObjectMappingSignals(parsed, 0, 3)) {
        pushUnique(signals, key);
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  }

  const mediaKinds = [
    "Couvertures",
    "Versos",
    "Planches",
    "Autres",
    "4emes",
    "Quatriemes",
  ];
  for (const kind of mediaKinds) {
    if (new RegExp(`/media/${kind}/[^"'\\s?)]+`, "i").test(html)) {
      pushUnique(signals, `image:${normalizeSignal(kind)}`, "image:gallery");
    }
  }

  if (/book_cover\//i.test(html)) {
    pushUnique(signals, "image:cover", "image:gallery");
    const coverCount = (html.match(/book_cover\//gi) || []).length;
    if (coverCount > 1) pushUnique(signals, `image:gallery×${coverCount}`);
  }

  if (/itemprop=["']ratingValue["']/i.test(html)) {
    pushUnique(signals, "field:rating", "field:ratingvalue");
  }
  if (/class=['"][^'"]*editeur[^'"]*['"]/i.test(html)) {
    pushUnique(signals, "field:publisher", "field:editeur");
  }
  if (/class=['"][^'"]*annee[^'"]*['"]/i.test(html)) {
    pushUnique(signals, "field:releaseyear", "field:releasedate");
  }
  if (/liste-auteurs|\/auteur\//i.test(html)) {
    pushUnique(signals, "field:authors", "field:people");
  }
  if (/\/theme\//i.test(html) || /Th[eè]mes/i.test(html)) {
    pushUnique(signals, "field:genres", "field:themes");
  }
  if (/R[ée]sum[ée]|synopsis|overview/i.test(html)) {
    pushUnique(signals, "field:description");
  }
  if (/\/editeur\//i.test(html)) {
    pushUnique(signals, "field:publisher");
  }
  if (/\/covers\b/i.test(html)) {
    pushUnique(signals, "image:gallery", "page:covers");
  }

  return [...signals].sort((a, b) => a.localeCompare(b, "fr"));
}

export function collectMarkdownMappingSignals(markdown: string): string[] {
  const signals = new Set(collectHtmlMappingSignals(markdown));

  for (const match of markdown.matchAll(
    /!\[[^\]]*\]\((https:\/\/cdn1\.booknode\.com\/book_cover\/[^)\s]+)\)/gi,
  )) {
    pushUnique(signals, "image:cover", "image:gallery");
    if (match[1]?.includes("/full/")) pushUnique(signals, "image:cover-full");
  }

  const coversLink = markdown.match(
    /Couver[^\]]+\]\([^)]+\/covers[^)]*"([^"]+)"/i,
  );
  if (coversLink) {
    const count = coversLink[1]?.match(/(\d+)/)?.[1];
    pushUnique(signals, "page:covers", "image:gallery");
    if (count) pushUnique(signals, `image:gallery×${count}`);
  }

  if (/\b\d[\d\s]*\s+notes?\b/i.test(markdown)) {
    pushUnique(signals, "field:ratingcount", "field:rating");
  }
  if (/\b\d[\d\s]*\s+commentaires?\b/i.test(markdown)) {
    pushUnique(signals, "field:reviewcount");
  }

  return [...signals].sort((a, b) => a.localeCompare(b, "fr"));
}

export function collectObjectMappingSignals(
  value: unknown,
  depth = 0,
  maxDepth = 2,
): string[] {
  if (value == null || depth > maxDepth) return [];

  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const mediaLike = value.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        ("url" in entry || "type" in entry || "fileName" in entry),
    );
    if (mediaLike) {
      const signals = new Set<string>(["image:gallery"]);
      for (const entry of value) {
        const record = entry as Record<string, unknown>;
        const type = String(record.type || record.kind || "image").trim();
        if (type) signals.add(`image:${normalizeSignal(type)}`);
        const url = String(record.url || record.fileName || "").trim();
        if (IMAGE_URL.test(url)) signals.add("image:cover");
      }
      return [...signals];
    }
    return collectObjectMappingSignals(value[0], depth + 1, maxDepth);
  }

  if (typeof value !== "object") {
    if (typeof value === "string" && IMAGE_URL.test(value))
      return ["image:cover"];
    return [];
  }

  const record = value as Record<string, unknown>;
  const signals = new Set<string>();

  for (const [key, raw] of Object.entries(record)) {
    if (raw == null || raw === "") continue;
    const normalized = normalizeSignal(key);
    pushUnique(signals, normalized, `field:${normalized}`);

    if (typeof raw === "string") {
      if (IMAGE_URL.test(raw)) pushUnique(signals, "image:cover");
      if (/^\d{8,14}$/.test(raw.replace(/\D/g, ""))) {
        pushUnique(signals, "field:barcode", "field:ean");
      }
    }

    if (typeof raw === "object") {
      for (const nested of collectObjectMappingSignals(
        raw,
        depth + 1,
        maxDepth,
      )) {
        pushUnique(signals, nested);
      }
    }
  }

  return [...signals].sort((a, b) => a.localeCompare(b, "fr"));
}

export function mergeMappingSignalSets(
  ...groups: Array<string[] | undefined | null>
): string[] {
  const merged = new Set<string>();
  for (const group of groups) {
    for (const signal of group || []) {
      if (signal) merged.add(signal);
    }
  }
  return [...merged].sort((a, b) => a.localeCompare(b, "fr"));
}
