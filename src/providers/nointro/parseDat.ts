/**
 * Logiqx / No-Intro (and Redump-compatible) DAT XML parser.
 * First cut: typed rows only — no SQLite index, registry, or scan wiring.
 */
export type NoIntroDatHeader = {
  name?: string;
  description?: string;
  version?: string;
  date?: string;
  author?: string;
  homepage?: string;
  url?: string;
};

export type NoIntroDatRom = {
  name: string;
  size?: number;
  crc?: string;
  md5?: string;
  sha1?: string;
  status?: string;
};

export type NoIntroDatGame = {
  name: string;
  description?: string;
  cloneOf?: string;
  roms: NoIntroDatRom[];
};

export type NoIntroDatFile = {
  header: NoIntroDatHeader;
  games: NoIntroDatGame[];
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&");
}

function cleanText(value?: string | null): string | undefined {
  if (value == null) return undefined;
  const cleaned = decodeXmlEntities(value).replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function readTag(block: string, tag: string): string | undefined {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return cleanText(match?.[1]);
}

function readAttr(tagOpen: string, attr: string): string | undefined {
  const match = tagOpen.match(
    new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return cleanText(match?.[1] ?? match?.[2]);
}

function parsePositiveInt(raw?: string): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw.replace(/[^\d]/g, ""));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Parse `<header>…</header>` from a Logiqx datafile. */
export function parseNoIntroDatHeader(xml: string): NoIntroDatHeader {
  const headerMatch = xml.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i);
  const block = headerMatch?.[1] ?? "";
  return {
    name: readTag(block, "name"),
    description: readTag(block, "description"),
    version: readTag(block, "version"),
    date: readTag(block, "date"),
    author: readTag(block, "author"),
    homepage: readTag(block, "homepage"),
    url: readTag(block, "url"),
  };
}

function parseRomTags(block: string): NoIntroDatRom[] {
  const roms: NoIntroDatRom[] = [];
  for (const match of block.matchAll(/<rom\b([^>]*)\/?\s*>/gi)) {
    const attrs = match[1] ?? "";
    const name = readAttr(attrs, "name");
    if (!name) continue;
    roms.push({
      name,
      size: parsePositiveInt(readAttr(attrs, "size")),
      crc: readAttr(attrs, "crc")?.toLowerCase(),
      md5: readAttr(attrs, "md5")?.toLowerCase(),
      sha1: readAttr(attrs, "sha1")?.toLowerCase(),
      status: readAttr(attrs, "status")?.toLowerCase(),
    });
  }
  return roms;
}

/**
 * Parse one `<game>…</game>` (or self-closing open tag + body) block.
 * Accepts the full element including the opening `<game …>` tag.
 */
export function parseNoIntroDatGameBlock(block: string): NoIntroDatGame | null {
  const open = block.match(/<(?:game|machine)\b([^>]*)>/i);
  if (!open) return null;
  const name = readAttr(open[1] ?? "", "name");
  if (!name) return null;
  return {
    name,
    description: readTag(block, "description"),
    cloneOf: readAttr(open[1] ?? "", "cloneof"),
    roms: parseRomTags(block),
  };
}

/** Parse a full Logiqx / No-Intro / Redump-compatible DAT XML string. */
export function parseNoIntroDatXml(xml: string): NoIntroDatFile {
  const header = parseNoIntroDatHeader(xml);
  const games: NoIntroDatGame[] = [];
  for (const match of xml.matchAll(
    /<(?:game|machine)\b[^>]*>[\s\S]*?<\/(?:game|machine)>/gi,
  )) {
    const game = parseNoIntroDatGameBlock(match[0]);
    if (game) games.push(game);
  }
  return { header, games };
}
