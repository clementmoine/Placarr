import { decode as decodeHTMLEntities } from "html-entities";

/** Shared HTML / JSON-LD helpers for retailer scrapers (Decitre-class). */

export const BROWSER_HTML_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
} as const;

export type JsonLdSchema = Record<string, unknown>;

export function cleanHtmlText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = decodeHTMLEntities(String(value))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

export function absoluteUrlFromBase(
  baseUrl: string,
  pathOrUrl?: string | null,
): string | undefined {
  if (!pathOrUrl) return undefined;
  try {
    return new URL(pathOrUrl, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export function parseJsonLdBlocks(html: string): JsonLdSchema[] {
  const blocks: JsonLdSchema[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(decodeHTMLEntities(match[1].trim()));
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && typeof parsed === "object") blocks.push(parsed);
    } catch {
      // Ignore malformed schema snippets.
    }
  }
  return blocks;
}

export function schemaTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

export function firstSchemaStringValue(value: unknown): string | undefined {
  if (typeof value === "string") return cleanHtmlText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = firstSchemaStringValue(item);
      if (parsed) return parsed;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      firstSchemaStringValue(record.name) ||
      firstSchemaStringValue(record.title) ||
      firstSchemaStringValue(record["@value"])
    );
  }
  return undefined;
}
