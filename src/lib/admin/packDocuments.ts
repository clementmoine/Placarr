/**
 * Pack documents on disk — `data/<pack>/documents/{lang}/{kind}/{slug}.ext`
 * + `index.json` appendix. Sync harvest writes; admin reads.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  packDocumentsDir,
  packDocumentsIndexPath,
} from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import type { PackDocumentKind } from "@/lib/shared/packDocumentKinds";

export {
  isPackDocumentKind,
  PACK_DOCUMENT_KINDS,
  type PackDocumentKind,
} from "@/lib/shared/packDocumentKinds";

export type PackDocumentEntry = {
  id: string;
  title: string;
  lang: string;
  kind: PackDocumentKind;
  sourceUrl: string;
  fetchedAt: string | null;
  relativePath: string | null;
  /** Sibling preview under documents/ — `…/foo.thumb.webp` (page 1 for PDFs). */
  thumbRelativePath?: string | null;
  sha256: string | null;
  bytes: number | null;
};

export type PackDocumentsIndex = {
  version: 1;
  updatedAt: string;
  documents: PackDocumentEntry[];
};

export type CuratedPackDocument = {
  url: string;
  title?: string;
  lang?: string;
  kind?: PackDocumentKind;
  /** When false, index URL-only (no download) — brand portals, HTML hubs. */
  download?: boolean;
  /**
   * Bytes already on disk under the pack data dir (or another pack via `..`).
   * Relative path; harvest copies into `documents/{lang}/{kind}/` — no network.
   */
  localPath?: string;
  /**
   * Prefer this URL for the GET (e.g. Wayback `…/web/{ts}id_/…`) while
   * {@link url} stays the citable original.
   */
  waybackUrl?: string;
};

/** Sanitize a filename stem for disk (`swsh10_rulebook_en`). */
export function slugifyDocumentStem(raw: string): string {
  const decoded = decodeURIComponent(raw).trim();
  const base = decoded.replace(/\.[a-z0-9]+$/i, "");
  const slug = base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
  return slug.slice(0, 120) || "document";
}

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (match) return match[1]!.toLowerCase();
  } catch {
    /* ignore */
  }
  return "pdf";
}

/**
 * Infer lang + kind + slug from a public document URL (and optional curated hints).
 */
export function classifyPackDocument(
  url: string,
  hints: Pick<CuratedPackDocument, "title" | "lang" | "kind"> = {},
): {
  lang: string;
  kind: PackDocumentKind;
  slug: string;
  title: string;
  id: string;
  filename: string;
} {
  let pathname = url;
  let hash = "";
  try {
    const parsed = new URL(url);
    pathname = decodeURIComponent(parsed.pathname);
    hash = parsed.hash.replace(/^#/, "");
  } catch {
    /* keep raw */
  }
  const file = path.basename(pathname) || "document.pdf";
  // Brand-portal set assets share `/downloads` + distinct `#/set-assets/…` hashes.
  const stem = slugifyDocumentStem(hash ? `${file}-${hash}` : file);
  const lower = `${url} ${file}`.toLowerCase();

  const lang =
    hints.lang?.trim().toLowerCase() ||
    detectLang(url, file) ||
    "und";

  const kind = hints.kind ?? detectKind(lower, url);
  const title =
    hints.title?.trim() ||
    decodeURIComponent(file).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
  const ext = extFromUrl(url);
  const filename = `${stem}.${ext}`;
  const id = `${lang}-${kind}-${stem}`;

  return { lang, kind, slug: stem, title, id, filename };
}

function detectLang(url: string, file: string): string | null {
  const lowerUrl = url.toLowerCase();
  const cmsLocale = lowerUrl.match(/cms2?-([a-z]{2})-([a-z]{2})\//);
  if (cmsLocale) return cmsLocale[1]!;

  const fileLower = file.toLowerCase();
  // Trailing tag: `…_FR.pdf`, `…-en.pdf`, `…_DE.pdf`.
  const trailing = fileLower.match(
    /(?:^|[_\-.])(fr|en|nl|de|it|es|pt|ja)(?=\.[a-z0-9]+$)/,
  );
  if (trailing) return trailing[1]!;

  // Mid-stem locale segment: `CRUpdate_EN_Oct-2026.pdf`, `notes_fr_v2.pdf`.
  // Never match bare `de` here — `guide-de-demarrage` is French, not German.
  const mid = fileLower.match(
    /(?:^|[_\-.])(en|fr|nl|it|es|pt|ja)(?=[_\-.]|$)/,
  );
  if (mid) return mid[1]!;

  if (/[_\-]fran[cç]ais|_french/i.test(file)) return "fr";
  if (/[_\-]english|[_\-]us(?:[_\-.]|$)/i.test(file)) return "en";
  if (/[_\-]uk(?:[_\-.]|$)/i.test(file)) return "en";

  if (/\/fr\//i.test(lowerUrl) || /disneylorcana\.fr/i.test(lowerUrl))
    return "fr";
  if (/\/en\//i.test(lowerUrl)) return "en";
  if (/\/nl\//i.test(lowerUrl)) return "nl";

  if (/brand\.ravensburger/i.test(lowerUrl)) return "und";

  // Unmarked Pokémon CDN (`cms/` / `cms2/` without locale) = English default.
  if (/assets\.pokemon\.com/i.test(lowerUrl)) return "en";
  // Unmarked Disney Lorcana file host = English (FR siblings carry `_FR`).
  if (/files\.disneylorcana\.com/i.test(lowerUrl)) return "en";
  // Carddass FR site / Carddas JP mirrors.
  if (/carddass\.fr/i.test(lowerUrl)) return "fr";
  if (/carddas\.com/i.test(lowerUrl)) return "ja";

  return null;
}

function detectKind(lower: string, url: string): PackDocumentKind {
  if (/brand\.ravensburger/i.test(url)) return "brand";
  if (/penalty|play.?correction|correction.?guidelines/.test(lower))
    return "penalty";
  if (
    /set.?notes|set.?release.?notes|releasenotes|release.?notes|crupdate/.test(
      lower,
    )
  ) {
    return "set_notes";
  }
  if (/carddex|checklist/.test(lower)) return "checklist";
  if (
    /rulebook|comprehensive.?rules|quick.?rules|guide.?de.?demarrage|starterdeck.*rules|lore.?guide|core_2026|learn-to-play|tournament.?rules/.test(
      lower,
    )
  ) {
    return "rulebook";
  }
  if (
    /\/op\/|_op_|op[-_]|opkit|op.?kit|set.?champ|championships|event.?instructions|event.?term|hobby.?requirements|community.?code|diversity|results.?slip|decklist|registration.?sheet|play.?hub|resources\/?$/.test(
      lower,
    )
  ) {
    return "op";
  }
  if (/brochure|galar.?tour/.test(lower)) return "other";
  return "other";
}

export function emptyPackDocumentsIndex(): PackDocumentsIndex {
  return { version: 1, updatedAt: new Date(0).toISOString(), documents: [] };
}

export function readPackDocumentsIndex(pack: string): PackDocumentsIndex {
  const file = packDocumentsIndexPath(pack);
  if (!existsSync(file)) return emptyPackDocumentsIndex();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as PackDocumentsIndex;
    if (raw?.version !== 1 || !Array.isArray(raw.documents)) {
      return emptyPackDocumentsIndex();
    }
    return raw;
  } catch {
    return emptyPackDocumentsIndex();
  }
}

export function writePackDocumentsIndex(
  pack: string,
  index: PackDocumentsIndex,
): void {
  const dir = packDocumentsDir(pack);
  mkdirSync(dir, { recursive: true });
  const next: PackDocumentsIndex = {
    version: 1,
    updatedAt: new Date().toISOString(),
    documents: index.documents,
  };
  writeFileSync(
    packDocumentsIndexPath(pack),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );
}

/** Relative path under `documents/` — `en/rulebook/foo.pdf`. */
export function documentRelativePath(
  lang: string,
  kind: PackDocumentKind,
  filename: string,
): string {
  return path.posix.join(lang, kind, filename);
}

/** `fr/rulebook/foo.pdf` → `fr/rulebook/foo.thumb.webp` (or null). */
export function documentThumbRelativePath(
  relativePath: string,
): string | null {
  const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const match = cleaned.match(
    /^([a-z0-9_-]+\/[a-z0-9_-]+\/)(.+)\.([a-z0-9]{2,5})$/i,
  );
  if (!match) return null;
  const [, dir, stem] = match;
  if (!dir || !stem || stem.endsWith(".thumb")) return null;
  return `${dir}${stem}.thumb.webp`;
}

/**
 * Resolve a relative document path to an absolute file under the pack tree.
 * Rejects traversal.
 */
export function resolvePackDocumentFile(
  pack: string,
  relativePath: string,
): string | null {
  const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !cleaned ||
    cleaned.includes("..") ||
    cleaned.startsWith("/") ||
    !/^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-zA-Z0-9._-]+$/i.test(cleaned)
  ) {
    return null;
  }
  const root = packDocumentsDir(pack);
  const abs = path.resolve(root, cleaned);
  if (!abs.startsWith(path.resolve(root) + path.sep)) return null;
  if (!existsSync(abs)) return null;
  return abs;
}

export type ListPackDocumentsOpts = {
  pack?: string | null;
  lang?: string | null;
  kind?: string | null;
  q?: string | null;
};

/** Discover packs that already have a documents tree (by scanning data/). */
export function listDocumentPackIds(): string[] {
  const root = dataRoot();
  if (!existsSync(root)) return [];
  const out: string[] = [];

  const walk = (rel: string, depth: number) => {
    if (depth > 3) return;
    const abs = path.join(root, rel);
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return;
    }
    if (entries.includes("documents")) {
      const docs = path.join(abs, "documents");
      try {
        if (readdirSync(docs).length >= 0) {
          out.push(rel.replace(/\\/g, "/"));
        }
      } catch {
        /* ignore */
      }
    }
    for (const name of entries) {
      if (name === "documents" || name === "staging" || name === "logs")
        continue;
      if (name.startsWith(".")) continue;
      const child = path.join(abs, name);
      try {
        if (statSync(child).isDirectory()) {
          walk(rel ? `${rel}/${name}` : name, depth + 1);
        }
      } catch {
        /* ignore */
      }
    }
  };

  walk("", 0);
  return [...new Set(out)].sort();
}

export function listPackDocuments(
  opts: ListPackDocumentsOpts = {},
): Array<PackDocumentEntry & { packId: string }> {
  const packFilter = opts.pack?.trim() || null;
  const langFilter = opts.lang?.trim().toLowerCase() || null;
  const kindFilter = opts.kind?.trim().toLowerCase() || null;
  const q = opts.q?.trim().toLowerCase() || null;

  const packs = packFilter ? [packFilter] : listDocumentPackIds();
  const rows: Array<PackDocumentEntry & { packId: string }> = [];

  for (const packId of packs) {
    const index = readPackDocumentsIndex(packId);
    for (const doc of index.documents) {
      if (langFilter && doc.lang !== langFilter) continue;
      if (kindFilter && doc.kind !== kindFilter) continue;
      if (
        q &&
        !`${doc.title} ${doc.id} ${doc.sourceUrl}`.toLowerCase().includes(q)
      ) {
        continue;
      }
      // Prefer index, else discover sibling `*.thumb.webp` already on disk.
      let thumbRelativePath = doc.thumbRelativePath ?? null;
      if (!thumbRelativePath && doc.relativePath) {
        const candidate = documentThumbRelativePath(doc.relativePath);
        if (candidate && resolvePackDocumentFile(packId, candidate)) {
          thumbRelativePath = candidate;
        }
      }
      rows.push({ ...doc, packId, thumbRelativePath });
    }
  }

  rows.sort((a, b) => {
    const packCmp = a.packId.localeCompare(b.packId);
    if (packCmp) return packCmp;
    const langCmp = a.lang.localeCompare(b.lang);
    if (langCmp) return langCmp;
    const kindCmp = a.kind.localeCompare(b.kind);
    if (kindCmp) return kindCmp;
    return a.title.localeCompare(b.title);
  });
  return rows;
}

export function upsertPackDocumentEntry(
  index: PackDocumentsIndex,
  entry: PackDocumentEntry,
): PackDocumentsIndex {
  const documents = index.documents.filter((d) => d.id !== entry.id);
  documents.push(entry);
  documents.sort((a, b) => a.id.localeCompare(b.id));
  return { ...index, documents };
}
