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
 * `/assets/…/cards/{family}/{diskId}/{lang}/{file}` → retail diskId segment
 * when the URL still carries `-promo` / `-prerelease` / `-cdf` grouping.
 *
 * Stale Metadata rows store the stub path; the bytes live under retail.
 * Returns a rewritten `rest` for {@link resolveAssetsDiskRoot}, or null.
 */
export function narutoRetailAssetsRest(rest: readonly string[]): string[] | null {
  // cards / family / diskId / lang / file
  if (rest.length < 5 || rest[0] !== "cards") return null;
  const diskId = rest[2];
  if (!diskId) return null;
  const retail = narutoRetailDiskNumber(diskId);
  if (!retail || retail.toLowerCase() === diskId.toLowerCase()) return null;
  return [rest[0]!, rest[1]!, retail, ...rest.slice(3)];
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
  /** When set, require this exact filename under the candidate folder. */
  artFile?: string | null;
  cardsRoot?: string;
}): string {
  const cardsRoot = opts.cardsRoot ?? packCardsDir(NARUTO_PACK_ID);
  const lang = opts.lang;
  const artFile = opts.artFile?.trim() || null;
  const candidates = [opts.number];
  const retail = narutoRetailDiskNumber(opts.number);
  if (retail && retail.toLowerCase() !== opts.number.toLowerCase()) {
    candidates.push(retail);
  }
  for (const candidate of candidates) {
    const pathId = narutoCardPathFromCollector(candidate, lang);
    if (!pathId) continue;
    const dir = path.join(
      cardsRoot,
      pathId.folder,
      pathId.diskId,
      pathId.lang,
    );
    if (artFile) {
      if (existsSync(path.join(dir, artFile))) return candidate;
      continue;
    }
    if (resolveNarutoDiskArtFilename(dir)) return candidate;
  }
  return opts.number;
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
  const diskNumber = resolveNarutoArtDiskNumber({
    number: opts.number,
    lang: opts.lang,
    cardsRoot,
  });
  const pathId = narutoCardPathFromCollector(diskNumber, opts.lang);
  if (!pathId) return { attachments: [], defaultUrl: null };

  const cardDir = path.join(
    cardsRoot,
    pathId.folder,
    pathId.diskId,
    pathId.lang,
  );
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
