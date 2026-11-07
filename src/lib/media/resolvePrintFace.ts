/**
 * Pack-agnostic `/assets/<pack>/prints/{stem}/{role}` resolve.
 *
 * Stem = shelf item slug without finish (`s1-cl0001-fr`). Disk bytes stay
 * under `cards/{lang}/{set}/{id}/`. Naruto Carddass adds owned/borrowed
 * ranking; other packs resolve owned files (+ face.json / locale borrow).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { parsePrintKey } from "@/core/identify/printKey";
import { catalogueFaceRankScore } from "@/core/enrich/media/catalogueFaceRank";
import { catalogueCorpusPack } from "@/lib/admin/cataloguePacks";
import { canonicalAssetPack } from "@/lib/packAssetUrls";
import { packCardsDir } from "@/lib/packPaths";
import { CARD_FACE_DECISION_FILE } from "@/providers/shared/cardFaces";
import { probeFaceFileDimensionsSync } from "@/providers/shared/faceFileDimensions";
import {
  providerModuleProviding,
  providerModulesForPack,
} from "@/providers/shared/packOwner";
// (Naruto-specific resolution is now provided via the `resolvePrintFace` /
// `matchPrintsAssetRest` hooks on the narutocarddass module — see packOwner.)

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
  const hookMod = providerModuleProviding(canonicalAssetPack(pack), "matchPrintsAssetRest");
  if (hookMod?.matchPrintsAssetRest) {
    return hookMod.matchPrintsAssetRest(rest);
  }

  const game = printKeyGameForPack(pack);
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

/** `face.json` art basename when the file exists — no directory listing. */
function readFaceJsonArtFast(cardDir: string): string | null {
  const decisionPath = path.join(cardDir, CARD_FACE_DECISION_FILE);
  if (!existsSync(decisionPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(decisionPath, "utf8")) as {
      art?: string;
    };
    const named = raw.art?.trim();
    if (!named || !/^art\./i.test(named)) return null;
    if (named.includes("/") || named.includes("..")) return null;
    return existsSync(path.join(cardDir, named)) ? named : null;
  } catch {
    return null;
  }
}

/**
 * Owned face basename — `face.json` wins (no readdir), else best `art.*` by
 * {@link catalogueFaceRankScore} (probed pixels + pack provenance stamp).
 * Same criteria as Catalogue → Cards — no provider-name lists / byte proxy.
 */
function pickOwnedArtFile(
  cardDir: string,
  role: PrintFaceRole,
  pack: string,
): string | null {
  if (!existsSync(cardDir) || !statSync(cardDir).isDirectory()) return null;
  /*
    Hot path (catalogue /assets grid): honor face.json without listing the
    folder. Thumb / face-b still need a directory listing when no decision.
  */
  if (role === "face") {
    const decided = readFaceJsonArtFast(cardDir);
    if (decided) return decided;
  }
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
  const arts = names.filter(
    (n) => /^art\./i.test(n) && /\.(jpe?g|png|webp|gif)$/i.test(n),
  );
  if (!arts.length) return null;
  if (arts.length === 1) return arts[0]!;
  const corpus = catalogueCorpusPack(pack) || canonicalAssetPack(pack);
  const provenanceOf = providerModuleProviding(
    corpus,
    "coverProvenanceForArtFile",
  )?.coverProvenanceForArtFile;
  arts.sort((a, b) => {
    const pathA = path.join(cardDir, a);
    const pathB = path.join(cardDir, b);
    const dimsA = probeFaceFileDimensionsSync(pathA);
    const dimsB = probeFaceFileDimensionsSync(pathB);
    return (
      catalogueFaceRankScore({
        artFile: b,
        width: dimsB?.width,
        height: dimsB?.height,
        coverProvenance: provenanceOf?.(b),
      }) -
        catalogueFaceRankScore({
          artFile: a,
          width: dimsA?.width,
          height: dimsA?.height,
          coverProvenance: provenanceOf?.(a),
        }) || a.localeCompare(b)
    );
  });
  return arts[0] ?? null;
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
  const cardsRoot = packCardsDir(opts.pack);
  const tryLang = (code: string): PrintFaceHit | null => {
    const dir = path.join(cardsRoot, code, id.set, card);
    const artFile = pickOwnedArtFile(dir, opts.role, opts.pack);
    if (!artFile) return null;
    const filePath = path.join(dir, artFile);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;
    return {
      filePath,
      artFile,
      source: code === lang ? "owned" : "borrowed",
      ...(code === lang ? {} : { donorPrintKey: opts.printKey }),
      disk: { lang: code, set: id.set, card },
    };
  };

  const owned = tryLang(lang);
  if (owned) return owned;

  // Locale borrow — same print, another *language* folder (IT←EN…).
  // Skip set-first legacy dirs (`sd`, `nr`, …) sitting next to `fr`/`en`.
  let langs: string[] = [];
  try {
    langs = readdirSync(cardsRoot).filter((name) => {
      if (!LANG_SEGMENT.test(name)) return false;
      try {
        return statSync(path.join(cardsRoot, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }
  for (const code of langs) {
    if (code.toLowerCase() === lang) continue;
    const hit = tryLang(code.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/**
 * Resolve print-role URL onto disk. Delegates to the pack's provider when it
 * declares `resolvePrintFace` (e.g. Naruto Carddass borrow chains); otherwise
 * owned-folder only.
 */
export function resolvePrintFace(opts: {
  pack: string;
  printKey: string;
  lang: string;
  role?: PrintFaceRole;
}): PrintFaceHit | null {
  const pack = canonicalAssetPack(opts.pack);
  const role = opts.role ?? "face";
  // Delegate to the pack's provider when it declares a custom resolver
  // (e.g. Naruto Carddass borrow chains). Otherwise owned-folder only.
  const hookMod = providerModuleProviding(pack, "resolvePrintFace");
  if (hookMod?.resolvePrintFace) {
    const hit = hookMod.resolvePrintFace({
      printKey: opts.printKey,
      lang: opts.lang,
      role,
    });
    return hit ?? null;
  }
  return resolveOwnedPrintFace({
    pack,
    printKey: opts.printKey,
    lang: opts.lang,
    role,
  });
}
