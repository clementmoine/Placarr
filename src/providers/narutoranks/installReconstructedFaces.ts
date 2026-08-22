/**
 * Scans curés (`curated/cards/{set}/{lang}/{number}/art.reconstructed.*`) →
 * `art.reconstructed.webp` sous `data/naruto/ninja-ranks/cards/` + index SQLite.
 *
 * C'est **l'arbre qui commande**, comme au Carddass : poser un fichier suffit à
 * l'installer, verso compris (`back.reconstructed.*` à côté du recto). Le
 * ledger `curated/sources/reconstructed-faces.json` reste le registre
 * d'attestation (d'où vient le scan, quel numéro imprimé) — il enrichit une
 * face, il ne la conditionne plus. Une face posée sans ligne de ledger est
 * installée et signalée dans `unattested` : elle s'affiche, et il reste à
 * écrire d'où elle vient.
 *
 * Les fichiers étrangers au rôle (`source.webp`, `art.coleka.png`) sont ignorés
 * ici : ils appartiennent à d'autres installateurs.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { packCardsDir } from "@/lib/packPaths";
import { curatedDestStale } from "@/providers/shared/curatedCardsInstall";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

const LEDGER_FILE = "reconstructed-faces.json";
const ART_BASENAME = "art.reconstructed";
const BACK_BASENAME = "back.reconstructed";

/** `art.reconstructed.png`, `back.reconstructed.webp` — pas `source.webp`. */
const FACE_FILE = /^(art|back)\.reconstructed\.(png|webp|jpe?g)$/i;
const LANG_DIR = /^[a-z]{2}(?:[a-z]{2})?$/i;
/** Le master Figma d'abord ; le webp n'est qu'un export. */
const EXT_ORDER = ["png", "webp", "jpg", "jpeg"];

export type ReconstructedFaceLedgerRow = {
  setCode: string;
  number: string;
  printed?: string;
  lang?: string;
  sourceFile: string;
  backSourceFile?: string;
  note?: string;
};

export type ReconstructedFacesLedger = {
  sourceId: string;
  lang?: string;
  faces: ReconstructedFaceLedgerRow[];
};

/** Une carte à installer, après fusion de l'arbre et du ledger. */
export type ReconstructedFaceCandidate = {
  setCode: string;
  lang: string;
  number: string;
  artSource?: string;
  backSource?: string;
  /** Le ledger dit d'où vient ce scan. */
  attested: boolean;
  printed?: string;
};

export function reconstructedFacesLedgerPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function readReconstructedFacesLedger(): ReconstructedFacesLedger {
  return JSON.parse(
    readFileSync(reconstructedFacesLedgerPath(), "utf8"),
  ) as ReconstructedFacesLedger;
}

function isSafeSegment(name: string): boolean {
  return (
    Boolean(name) &&
    !name.startsWith(".") &&
    !name.includes("..") &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}

function isDir(abs: string): boolean {
  return existsSync(abs) && statSync(abs).isDirectory();
}

function candidateKey(setCode: string, lang: string, number: string): string {
  return `${setCode}|${lang}|${number}`;
}

/** Le master l'emporte quand recto et verso existent en plusieurs extensions. */
function preferExtension(files: readonly string[]): string | undefined {
  return [...files].sort((a, b) => {
    const ai = EXT_ORDER.indexOf(path.extname(a).slice(1).toLowerCase());
    const bi = EXT_ORDER.indexOf(path.extname(b).slice(1).toLowerCase());
    return (ai < 0 ? EXT_ORDER.length : ai) - (bi < 0 ? EXT_ORDER.length : bi);
  })[0];
}

/**
 * Toutes les faces reconstruites posées sous `curated/cards/`, sans ledger.
 * Arborescence Ninja Ranks : `{set}/{lang}/{number}/` (le Carddass, lui, range
 * en `{family}/{id}/{lang}/` — d'où deux scanners plutôt qu'un).
 */
export function listCuratedReconstructedFaces(
  curatedRoot = narutoRanksCuratedDir(),
): ReconstructedFaceCandidate[] {
  const cardsDir = path.join(curatedRoot, "cards");
  if (!isDir(cardsDir)) return [];
  const out: ReconstructedFaceCandidate[] = [];

  for (const setCode of readdirSync(cardsDir)) {
    if (!isSafeSegment(setCode)) continue;
    const setDir = path.join(cardsDir, setCode);
    if (!isDir(setDir)) continue;

    for (const lang of readdirSync(setDir)) {
      if (!LANG_DIR.test(lang)) continue;
      const langDir = path.join(setDir, lang);
      if (!isDir(langDir)) continue;

      for (const number of readdirSync(langDir)) {
        if (!isSafeSegment(number)) continue;
        const cardDir = path.join(langDir, number);
        if (!isDir(cardDir)) continue;

        const arts: string[] = [];
        const backs: string[] = [];
        for (const name of readdirSync(cardDir)) {
          const m = FACE_FILE.exec(name);
          if (!m) continue;
          const abs = path.join(cardDir, name);
          if (!statSync(abs).isFile()) continue;
          (m[1]!.toLowerCase() === "art" ? arts : backs).push(abs);
        }
        if (!arts.length && !backs.length) continue;

        out.push({
          setCode: setCode.toLowerCase(),
          lang: lang.toLowerCase(),
          number: number.toLowerCase(),
          artSource: preferExtension(arts),
          backSource: preferExtension(backs),
          attested: false,
        });
      }
    }
  }

  return out.sort((a, b) =>
    candidateKey(a.setCode, a.lang, a.number).localeCompare(
      candidateKey(b.setCode, b.lang, b.number),
    ),
  );
}

function resolveCuratedSource(curatedRoot: string, sourceFile: string): string {
  const rel = sourceFile.replace(/^curated\//, "");
  return path.join(curatedRoot, rel);
}

/**
 * L'arbre fournit les fichiers, le ledger l'attestation et le numéro imprimé.
 * Une ligne de ledger dont le fichier a disparu ne produit aucun candidat —
 * elle ressort en `skipped`.
 */
export function mergeReconstructedCandidates(
  ledger: ReconstructedFacesLedger,
  curatedRoot: string,
): { candidates: ReconstructedFaceCandidate[]; skipped: string[] } {
  const byKey = new Map<string, ReconstructedFaceCandidate>();
  for (const found of listCuratedReconstructedFaces(curatedRoot)) {
    byKey.set(candidateKey(found.setCode, found.lang, found.number), found);
  }

  const skipped: string[] = [];
  for (const row of ledger.faces) {
    const setCode = row.setCode.trim().toLowerCase();
    const number = row.number.trim().toLowerCase();
    const lang = (row.lang ?? ledger.lang ?? "en").trim().toLowerCase();
    const key = candidateKey(setCode, lang, number);
    const found = byKey.get(key);

    const art = resolveCuratedSource(curatedRoot, row.sourceFile);
    const artSource = existsSync(art) ? art : found?.artSource;
    const back = row.backSourceFile
      ? resolveCuratedSource(curatedRoot, row.backSourceFile)
      : undefined;
    const backSource =
      back && existsSync(back) ? back : found?.backSource;

    if (!artSource && !backSource) {
      skipped.push(row.printed ?? `${setCode}-${number}`);
      continue;
    }

    byKey.set(key, {
      setCode,
      lang,
      number,
      artSource,
      backSource,
      attested: true,
      printed: row.printed,
    });
  }

  return {
    candidates: [...byKey.values()].sort((a, b) =>
      candidateKey(a.setCode, a.lang, a.number).localeCompare(
        candidateKey(b.setCode, b.lang, b.number),
      ),
    ),
    skipped,
  };
}

async function writeFaceWebp(
  src: string,
  dest: string,
  force?: boolean,
): Promise<boolean> {
  if (!force && !curatedDestStale(src, dest)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  if (/\.webp$/i.test(src)) {
    copyFileSync(src, dest);
    return true;
  }
  await sharp(src).webp({ lossless: true, effort: 6 }).toFile(dest);
  return true;
}

export async function installReconstructedFaces(
  index: LocalPrintsIndex,
  opts: {
    force?: boolean;
    ledger?: ReconstructedFacesLedger;
    curatedRoot?: string;
  } = {},
): Promise<{
  faces: number;
  backs: number;
  skipped: string[];
  unattested: string[];
}> {
  const curatedRoot = opts.curatedRoot ?? narutoRanksCuratedDir();
  const ledger = opts.ledger ?? readReconstructedFacesLedger();
  const { candidates, skipped } = mergeReconstructedCandidates(
    ledger,
    curatedRoot,
  );
  const unattested: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art?: string;
    back?: string;
    sourceUrl?: string | null;
  }[] = [];
  let faces = 0;
  let backs = 0;

  for (const card of candidates) {
    const printKey = ninjaRanksPrintKey(card.setCode, card.number);
    if (!printKey) {
      skipped.push(card.printed ?? `${card.setCode}-${card.number}`);
      continue;
    }

    const destDir = path.join(
      packCardsDir(NARUTO_RANKS_PACK_ID),
      card.setCode,
      card.lang,
      card.number,
    );

    let artFile: string | undefined;
    if (card.artSource) {
      const artDest = path.join(destDir, `${ART_BASENAME}.webp`);
      if (await writeFaceWebp(card.artSource, artDest, opts.force)) faces += 1;
      artFile = `${ART_BASENAME}.webp`;
    }

    let backFile: string | undefined;
    if (card.backSource) {
      const backDest = path.join(destDir, `${BACK_BASENAME}.webp`);
      if (await writeFaceWebp(card.backSource, backDest, opts.force)) backs += 1;
      backFile = `${BACK_BASENAME}.webp`;
    }

    if (!card.attested) {
      unattested.push(card.printed ?? `${card.setCode}-${card.number}`);
    }

    assets.push({
      printKey,
      lang: card.lang,
      art: artFile,
      back: backFile,
      sourceUrl: null,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { faces, backs, skipped, unattested };
}
