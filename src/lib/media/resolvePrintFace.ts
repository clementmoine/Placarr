/**
 * Pack-agnostic `/assets/<pack>/prints/{stem}/{role}` resolve.
 *
 * Stem = shelf item slug without finish (`s1-cl0001-fr`). Disk bytes stay
 * under `cards/{lang}/{set}/{id}/`. Naruto Carddass adds owned/borrowed
 * ranking; other packs resolve owned files only.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { parsePrintKey } from "@/core/identify/printKey";
import { catalogueCorpusPack } from "@/lib/admin/cataloguePacks";
import { canonicalAssetPack } from "@/lib/packAssetUrls";
import { packCardsDir } from "@/lib/packPaths";
import { providerModulesForPack } from "@/providers/shared/packOwner";
import {
  matchNarutoPrintsAssetRest,
  resolveNarutoPrintFace,
  type NarutoPrintFaceHit,
} from "@/providers/naruto/narutocarddass/printFaceResolve";

export type PrintFaceRole = "face" | "thumb" | "face-b";

export type PrintFaceHit = {
  filePath: string;
  artFile: string;
  source: "owned" | "borrowed";
  donorPrintKey?: string;
  disk: { lang: string; set: string; card: string };
};

/**
 * PrintKey `game:` segment for an assets pack id.
 * Taken from registry `printGames` on the pack's dataPack owner
 * (`naruto/kayou` → `kayou`); falls back to the first path segment.
 */
export function printKeyGameForPack(pack: string): string {
  const corpus = catalogueCorpusPack(pack) || canonicalAssetPack(pack);
  for (const mod of providerModulesForPack(corpus)) {
    const game = mod.printGames?.[0]?.trim();
    if (game) return game.toLowerCase();
  }
  return (corpus.split("/")[0] || corpus).toLowerCase();
}

const PRINT_ROLE = /^(face|thumb|face-b)$/;
const LANG_SEGMENT = /^[a-z]{2}([a-z]{2})?$/i;

function safeSegment(value: string): boolean {
  return Boolean(value) && !value.includes("..") && !value.includes("/");
}

function matchShelfStylePrintStem(
  stem: string,
  game: string,
): { printKey: string; lang: string } | null {
  const m = /^(.+)-([a-z]{2})$/i.exec(stem.trim());
  if (!m) return null;
  const head = m[1]!.trim().toLowerCase();
  const lang = m[2]!.toLowerCase();
  if (!safeSegment(head) || head.includes(":")) return null;
  return { printKey: `${game}:${head}`, lang };
}

/**
 * Preferred: `prints / {set}-{id}-{lang} / role`
 * Legacy: lang/set/card, lang/slug, or encoded printKey shapes.
 */
export function matchPrintsAssetRest(
  pack: string,
  rest: readonly string[],
): { printKey: string; lang: string; role: PrintFaceRole } | null {
  const game = printKeyGameForPack(pack);
  if (game === "naruto") {
    return matchNarutoPrintsAssetRest(rest);
  }

  if (rest[0] !== "prints") return null;

  if (rest.length === 3) {
    const stem = decodeURIComponent(rest[1] ?? "").trim();
    const roleRaw = (rest[2] ?? "").trim().toLowerCase();
    if (!PRINT_ROLE.test(roleRaw)) return null;
    const hit = matchShelfStylePrintStem(stem, game);
    if (!hit) return null;
    return { ...hit, role: roleRaw as PrintFaceRole };
  }

  if (rest.length === 5) {
    const lang = decodeURIComponent(rest[1] ?? "").trim().toLowerCase();
    const set = decodeURIComponent(rest[2] ?? "").trim().toLowerCase();
    const card = decodeURIComponent(rest[3] ?? "").trim().toLowerCase();
    const roleRaw = (rest[4] ?? "").trim().toLowerCase();
    if (!LANG_SEGMENT.test(lang) || !PRINT_ROLE.test(roleRaw)) return null;
    if (
      !safeSegment(set) ||
      !safeSegment(card) ||
      set.includes(":") ||
      card.includes(":")
    ) {
      return null;
    }
    return {
      printKey: `${game}:${set}-${card}`,
      lang,
      role: roleRaw as PrintFaceRole,
    };
  }

  if (rest.length !== 4) return null;
  const a = decodeURIComponent(rest[1] ?? "").trim();
  const b = decodeURIComponent(rest[2] ?? "").trim();
  const roleRaw = (rest[3] ?? "").trim().toLowerCase();
  if (!a || !b || !PRINT_ROLE.test(roleRaw)) return null;
  const role = roleRaw as PrintFaceRole;

  if (LANG_SEGMENT.test(a) && !a.includes(":") && safeSegment(b)) {
    const printKey = b.includes(":") ? b : `${game}:${b}`;
    return { printKey, lang: a.toLowerCase(), role };
  }

  const prefix = `${game}:`;
  if (a.toLowerCase().startsWith(prefix) && LANG_SEGMENT.test(b)) {
    return { printKey: a, lang: b.toLowerCase(), role };
  }
  return null;
}

function pickOwnedArtFile(
  cardDir: string,
  role: PrintFaceRole,
): string | null {
  if (!existsSync(cardDir) || !statSync(cardDir).isDirectory()) return null;
  let names: string[] = [];
  try {
    names = readdirSync(cardDir);
  } catch {
    return null;
  }
  if (role === "thumb") {
    const thumb = names.find((n) => /^thumb\.(jpe?g|png|webp|gif)$/i.test(n));
    if (thumb) return thumb;
  }
  if (role === "face-b") {
    return (
      names.find((n) => /^art\.[^/]*-b\.(jpe?g|png|webp|gif)$/i.test(n)) ?? null
    );
  }
  return (
    names.find((n) => /^art\.webp$/i.test(n)) ??
    names.find((n) => /^art\.(jpe?g|png|gif)$/i.test(n)) ??
    names.find((n) => /^art\./i.test(n)) ??
    null
  );
}

function resolveOwnedPrintFace(opts: {
  pack: string;
  printKey: string;
  lang: string;
  role: PrintFaceRole;
}): PrintFaceHit | null {
  const id = parsePrintKey(opts.printKey);
  if (!id) return null;
  const card = id.grouping ? `${id.number}-${id.grouping}` : id.number;
  const lang = opts.lang.trim().toLowerCase();
  const dir = path.join(packCardsDir(opts.pack), lang, id.set, card);
  const artFile = pickOwnedArtFile(dir, opts.role);
  if (!artFile) return null;
  const filePath = path.join(dir, artFile);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;
  return {
    filePath,
    artFile,
    source: "owned",
    disk: { lang, set: id.set, card },
  };
}

function fromNarutoHit(hit: NarutoPrintFaceHit): PrintFaceHit {
  return {
    filePath: hit.filePath,
    artFile: hit.artFile,
    source: hit.source,
    ...(hit.donorPrintKey ? { donorPrintKey: hit.donorPrintKey } : {}),
    disk: hit.disk,
  };
}

/**
 * Resolve print-role URL onto disk. Naruto Carddass uses borrow chains;
 * every other pack is owned-folder only.
 */
export function resolvePrintFace(opts: {
  pack: string;
  printKey: string;
  lang: string;
  role?: PrintFaceRole;
}): PrintFaceHit | null {
  const pack = canonicalAssetPack(opts.pack);
  const role = opts.role ?? "face";
  // Carddass: owned + artBorrowFrom. Other lines: owned folder only.
  if (pack === "naruto/carddass") {
    const hit = resolveNarutoPrintFace({
      printKey: opts.printKey,
      lang: opts.lang,
      role,
    });
    return hit ? fromNarutoHit(hit) : null;
  }
  return resolveOwnedPrintFace({
    pack,
    printKey: opts.printKey,
    lang: opts.lang,
    role,
  });
}
