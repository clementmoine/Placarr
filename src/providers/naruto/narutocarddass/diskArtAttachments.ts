/**
 * One cover attachment per `art.<source>.*` on disk for a Naruto Carddass print.
 * Same contract as Pokémon `buildPokemonDiskArtAttachments` — ItemModal / enrich
 * stay provider-blind; they just rank attachments.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { parsePrintKey } from "@/core/identify/printKey";
import { packCardsDir } from "@/lib/packPaths";
import type { MetadataAttachment } from "@/types/metadataProvider";

import { narutoRetailDiskNumber } from "./identity";
import { NARUTO_PACK_ID } from "./packs";
import {
  NARUTO_FACE_DECISION_FILE,
  narutoAssetsCardUrl,
  narutoCardPathFromCollector,
  narutoFaceCoverProvenance,
  narutoFaceSourceOf,
  parseNarutoFaceDecision,
} from "./disk";
import { pickPreferredFaceArtFilename } from "./parse/bandai";

const SPECIAL_ART = /^art\.(reconstructed|corrected)\.(jpe?g|png|webp|gif)$/i;

export function listNarutoArtFiles(cardDir: string): string[] {
  if (!existsSync(cardDir) || !statSync(cardDir).isDirectory()) return [];
  return readdirSync(cardDir).filter((name) => {
    const low = name.toLowerCase();
    if (!low.startsWith("art.")) return false;
    if (SPECIAL_ART.test(name)) return false;
    return narutoFaceSourceOf(name) != null;
  });
}

/**
 * Winner shown as the card face: `face.json` (incl. reconstructed/corrected),
 * else highest `faceArtRank` among files on disk.
 */
export function resolveNarutoDiskArtFilename(cardDir: string): string | null {
  if (!existsSync(cardDir) || !statSync(cardDir).isDirectory()) return null;
  const files = readdirSync(cardDir);

  const decisionPath = path.join(cardDir, NARUTO_FACE_DECISION_FILE);
  if (existsSync(decisionPath)) {
    try {
      const named = parseNarutoFaceDecision(
        readFileSync(decisionPath, "utf8"),
        "art",
      );
      if (
        named &&
        files.includes(named) &&
        (SPECIAL_ART.test(named) || narutoFaceSourceOf(named) != null)
      ) {
        return named;
      }
    } catch {
      /* fall through */
    }
  }

  return (
    pickPreferredFaceArtFilename(files) ?? listNarutoArtFiles(cardDir)[0] ?? null
  );
}

function faceRoleOf(file: string): string {
  if (/^art\.reconstructed\./i.test(file)) return "reconstructed";
  if (/^art\.corrected\./i.test(file)) return "corrected";
  return narutoFaceSourceOf(file) ?? "legacy";
}

function faceProvenanceOf(file: string): "catalog" | "listing_photo" {
  if (SPECIAL_ART.test(file)) return "catalog";
  const source = narutoFaceSourceOf(file);
  if (!source) return "catalog";
  return narutoFaceCoverProvenance(source);
}

/**
 * `/assets/…/cards/{lang}/{set}/{diskId}/{file}` → retail diskId segment
 * when the URL still carries `-promo` / `-prerelease` / `-cdf` grouping.
 *
 * Stale Metadata rows store the stub path; the bytes live under retail.
 * Returns a rewritten `rest` for {@link resolveAssetsDiskRoot}, or null.
 */
export function narutoRetailAssetsRest(rest: readonly string[]): string[] | null {
  // cards / lang / set / diskId / file
  if (rest.length < 5 || rest[0] !== "cards") return null;
  const diskId = rest[3];
  if (!diskId) return null;
  const retail = narutoRetailDiskNumber(diskId);
  if (!retail || retail.toLowerCase() === diskId.toLowerCase()) return null;
  return [rest[0]!, rest[1]!, rest[2]!, retail, ...rest.slice(4)];
}

const NARUTO_ASSET_LANGS = new Set(["fr", "en", "it", "ja"]);
/** Pre–lang-first family folders (`cards/ninja/ni0001/fr/…`). */
const NARUTO_LEGACY_FAMILY_FOLDERS = new Set([
  "ninja",
  "jutsu",
  "mission",
  "client",
  "clients",
  "knight",
  "character",
  "coin",
]);

function isNarutoAssetLang(seg: string): boolean {
  return NARUTO_ASSET_LANGS.has(seg.trim().toLowerCase());
}

function isNarutoSeriesFolder(seg: string): boolean {
  const s = seg.trim().toLowerCase();
  return (
    /^s\d+$/.test(s) ||
    /^maki\d+$/.test(s) ||
    /^tp\d+$/.test(s) ||
    /^tin\d+$/.test(s) ||
    s === "promo" ||
    s === "prerelease"
  );
}

/**
 * Rewrite stale Item/Metadata asset paths onto lang-first disk layout.
 *
 * - `cards/{family}/{card}/{lang}/{file}` → `cards/{lang}/{set}/{card}/{file}`
 * - `cards/{set}/{lang}/{card}/{file}` → `cards/{lang}/{set}/{card}/{file}`
 *
 * Returns null when `rest` is already lang-first or cannot be resolved on disk.
 */
export function narutoLangFirstAssetsRest(
  rest: readonly string[],
  cardsRoot?: string,
): string[] | null {
  if (rest.length < 5 || rest[0] !== "cards") return null;
  const a = rest[1]!;
  const b = rest[2]!;
  const c = rest[3]!;
  const file = rest[4];
  if (!file) return null;

  // Already lang-first: cards / lang / set / card / file
  if (isNarutoAssetLang(a) && isNarutoSeriesFolder(b)) return null;

  // Intermediate set/lang/card (brief dual layout during migrate).
  if (isNarutoSeriesFolder(a) && isNarutoAssetLang(b)) {
    return ["cards", b.toLowerCase(), a.toLowerCase(), c, ...rest.slice(4)];
  }

  // Legacy family/card/lang.
  if (
    NARUTO_LEGACY_FAMILY_FOLDERS.has(a.toLowerCase()) &&
    isNarutoAssetLang(c)
  ) {
    const lang = c.toLowerCase();
    const diskId = b;
    const set = resolveNarutoArtDiskSet({
      number: diskId,
      lang,
      artFile: file,
      cardsRoot,
    });
    if (!set) return null;
    return ["cards", lang, set, diskId, ...rest.slice(4)];
  }

  return null;
}

/**
 * Disk folder that actually holds the face file.
 *
 * Promo / prerelease stubs often inherit retail `art.*` in sqlite while the
 * bytes stay under `ta0081/fr/` (not `ta0081-promo/fr/`). Prefer the path that
 * exists so `/assets/.../ta0081-promo/...` never 404s.
 */
export function resolveNarutoArtDiskNumber(opts: {
  number: string;
  lang: string;
  /** Series folder to prefer (`s1`, `promo`, …). */
  set?: string | null;
  /** When set, require this exact filename under the candidate folder. */
  artFile?: string | null;
  cardsRoot?: string;
}): string {
  const cardsRoot = opts.cardsRoot ?? packCardsDir(NARUTO_PACK_ID);
  const lang = opts.lang.trim().toLowerCase();
  const artFile = opts.artFile?.trim() || null;
  const candidates = [opts.number];
  const retail = narutoRetailDiskNumber(opts.number);
  if (retail && retail.toLowerCase() !== opts.number.toLowerCase()) {
    candidates.push(retail);
  }
  const langDir = path.join(cardsRoot, lang);
  const setHint = opts.set?.trim().toLowerCase();
  const listed = existsSync(langDir)
    ? readdirSync(langDir).filter((name) => {
        if (name.startsWith(".")) return false;
        try {
          return statSync(path.join(langDir, name)).isDirectory();
        } catch {
          return false;
        }
      })
    : [];
  // Prefer the print's set, then every other set under the locale (promo→retail).
  const sets = [
    ...new Set([...(setHint ? [setHint] : []), ...listed]),
  ];
  for (const candidate of candidates) {
    for (const set of sets) {
      const dir = path.join(langDir, set, candidate);
      if (artFile) {
        if (existsSync(path.join(dir, artFile))) return candidate;
        continue;
      }
      if (resolveNarutoDiskArtFilename(dir)) return candidate;
    }
  }
  return opts.number;
}

/** Which set folder under `{lang}/` actually holds this disk id. */
export function resolveNarutoArtDiskSet(opts: {
  number: string;
  lang: string;
  set?: string | null;
  artFile?: string | null;
  cardsRoot?: string;
}): string | null {
  const cardsRoot = opts.cardsRoot ?? packCardsDir(NARUTO_PACK_ID);
  const lang = opts.lang.trim().toLowerCase();
  const langDir = path.join(cardsRoot, lang);
  if (!existsSync(langDir)) return null;
  const setHint = opts.set?.trim().toLowerCase();
  const listed = readdirSync(langDir).filter((name) => {
    if (name.startsWith(".")) return false;
    try {
      return statSync(path.join(langDir, name)).isDirectory();
    } catch {
      return false;
    }
  });
  const sets = [...new Set([...(setHint ? [setHint] : []), ...listed])];
  const diskNumber = resolveNarutoArtDiskNumber(opts);
  const artFile = opts.artFile?.trim() || null;
  for (const set of sets) {
    const dir = path.join(langDir, set, diskNumber);
    if (artFile) {
      if (existsSync(path.join(dir, artFile))) return set;
      continue;
    }
    if (resolveNarutoDiskArtFilename(dir)) return set;
  }
  return setHint ?? null;
}

export function buildNarutoDiskArtAttachments(opts: {
  printKey: string;
  /** Catalogue row number (collector id). */
  number: string;
  lang: string;
  source: string;
  title?: string | null;
  /** Override cards root (tests). */
  cardsRoot?: string;
}): { attachments: MetadataAttachment[]; defaultUrl: string | null } {
  const id = parsePrintKey(opts.printKey);
  if (!id || id.game !== "naruto") {
    return { attachments: [], defaultUrl: null };
  }

  const cardsRoot = opts.cardsRoot ?? packCardsDir(NARUTO_PACK_ID);
  const setHint = id.set.toLowerCase();
  const diskNumber = resolveNarutoArtDiskNumber({
    number: opts.number,
    lang: opts.lang,
    set: setHint,
    cardsRoot,
  });
  const artSet =
    resolveNarutoArtDiskSet({
      number: opts.number,
      lang: opts.lang,
      set: setHint,
      cardsRoot,
    }) ?? setHint;
  const pathId = narutoCardPathFromCollector(diskNumber, opts.lang, artSet);
  if (!pathId) return { attachments: [], defaultUrl: null };

  const cardDir = path.join(cardsRoot, pathId.lang, pathId.set, pathId.diskId);
  const defaultArt = resolveNarutoDiskArtFilename(cardDir);
  const arts = listNarutoArtFiles(cardDir);
  if (!defaultArt && arts.length === 0) {
    return { attachments: [], defaultUrl: null };
  }

  const defaultUrl = defaultArt
    ? narutoAssetsCardUrl(NARUTO_PACK_ID, pathId, defaultArt)
    : null;

  const ordered = defaultArt
    ? [defaultArt, ...arts.filter((a) => a !== defaultArt)]
    : arts;

  const attachments: MetadataAttachment[] = ordered.map((file) => {
    const faceSource = faceRoleOf(file);
    return {
      type: "cover",
      url: narutoAssetsCardUrl(NARUTO_PACK_ID, pathId, file),
      title: opts.title?.trim() || faceSource,
      role: `naruto-face-${faceSource}`,
      source: opts.source,
      coverProvenance: faceProvenanceOf(file),
    };
  });

  return { attachments, defaultUrl };
}
