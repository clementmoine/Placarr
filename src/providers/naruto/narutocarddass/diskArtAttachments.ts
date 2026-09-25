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

import { NARUTO_PACK_ID } from "./packs";
import {
  NARUTO_FACE_DECISION_FILE,
  narutoAssetsCardUrl,
  narutoCardPathFromCollector,
  narutoFaceSourceOf,
  parseNarutoFaceDecision,
} from "./disk";

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

function resolveDefaultArtFilename(cardDir: string): string | null {
  const arts = listNarutoArtFiles(cardDir);
  if (arts.length === 0) return null;

  const decisionPath = path.join(cardDir, NARUTO_FACE_DECISION_FILE);
  if (existsSync(decisionPath)) {
    try {
      const named = parseNarutoFaceDecision(
        readFileSync(decisionPath, "utf8"),
        "art",
      );
      if (named && arts.includes(named)) return named;
    } catch {
      /* fall through */
    }
  }
  return arts[0] ?? null;
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

  const pathId = narutoCardPathFromCollector(opts.number, opts.lang);
  if (!pathId) return { attachments: [], defaultUrl: null };

  const cardsRoot = opts.cardsRoot ?? packCardsDir(NARUTO_PACK_ID);
  const cardDir = path.join(
    cardsRoot,
    pathId.folder,
    pathId.diskId,
    pathId.lang,
  );
  const arts = listNarutoArtFiles(cardDir);
  if (arts.length === 0) return { attachments: [], defaultUrl: null };

  const defaultArt = resolveDefaultArtFilename(cardDir);
  const defaultUrl = defaultArt
    ? narutoAssetsCardUrl(NARUTO_PACK_ID, pathId, defaultArt)
    : null;

  const ordered = defaultArt
    ? [defaultArt, ...arts.filter((a) => a !== defaultArt)]
    : arts;

  const attachments: MetadataAttachment[] = ordered.map((file) => {
    const faceSource = narutoFaceSourceOf(file) ?? "legacy";
    return {
      type: "cover",
      url: narutoAssetsCardUrl(NARUTO_PACK_ID, pathId, file),
      title: opts.title?.trim() || faceSource,
      role: `naruto-face-${faceSource}`,
      source: opts.source,
      coverProvenance: "catalog",
    };
  });

  return { attachments, defaultUrl };
}
