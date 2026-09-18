/**
 * Action module: pipeline/audit.ts
 * Merged from: auditFaceCollisions.ts, foldUnsourcedNarutoArt.ts
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataRoot } from "@/lib/runtimeData";
import {
  listNarutoCardDirs,
  narutoFaceFilename,
  narutoFaceSourceOf,
  NARUTO_FACE_DECISION_FILE,
  parseNarutoFaceDecision,
  recordNarutoFaceDecision,
  type NarutoFaceSource,
} from "../disk";
import type { NarutoLangAppearances } from "../identity";
import { NARUTO_PACK_ID } from "../identity";

// --- from auditFaceCollisions.ts ---

/**
 * Deux tirages, une seule image : réimpression ou classement fautif ?
 *
 *   npx tsx src/providers/naruto/narutocarddass/pipeline/audit.ts
 *
 * Né de deux cartes signalées à la main — NI-069 portait une Strategia
 * italienne, NI-025 une 依-25. Les repérer une par une ne passe pas à
 * l'échelle : 13 409 faces sur le disque.
 *
 * Le signal est objectif : quand **les mêmes octets** sont classés sous deux
 * numéros, l'un des deux ment — sauf si les deux tirages portent le **même
 * titre**, auquel cas c'est une réimpression, et le jeu en est plein.
 *
 * Relevé du 2026-08-20 : 53 images partagées, dont **46 réimpressions** et
 * **7 classements fautifs**. Les sept impliquent `vintage` (10 fois) et
 * `drive` (4). Vérifié à l'œil sur `j1033 = j1043` : l'image porte 術 699 et
 * « Lightning Blade Single Slash », donc elle est à j1043 ; j1033 est
 * « Spatter's Rush », 術 1033, et son visuel `drive` le montre bien.
 *
 * Ce que l'outil ne fait pas : trancher. Il rend la paire et les deux titres ;
 * lire le numéro imprimé sur l'image reste la seule preuve.
 */




export type FaceRef = {
  card: string;
  lang: string;
  source: string;
  file: string;
};

export type FaceCollision = {
  cards: string[];
  titles: string[];
  sources: string[];
  /** Vrai quand tous les tirages portent le même titre : réimpression. */
  reprint: boolean;
};

/** Toutes les faces du pack, indexées par empreinte des octets. */
export function hashFaces(cardsRoot: string): Map<string, FaceRef[]> {
  const byHash = new Map<string, FaceRef[]>();
  const walk = (dir: string, parts: string[]): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs, [...parts, name]);
        continue;
      }
      const match = /^art\.([^.]+)\./.exec(name);
      if (!match) continue;
      const card = parts[parts.length - 2];
      const lang = parts[parts.length - 1];
      if (!card || !lang) continue;
      const hash = createHash("sha1").update(readFileSync(abs)).digest("hex");
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash)!.push({ card, lang, source: match[1]!, file: abs });
    }
  };
  walk(cardsRoot, []);
  return byHash;
}

/**
 * Une collision ne vaut alerte que si les titres divergent. Le même nom sous
 * deux numéros, c'est une carte rejouée d'un set à l'autre — courant ici.
 */
export function collisionsFrom(
  byHash: Map<string, FaceRef[]>,
  titleOf: (card: string) => string | null,
): FaceCollision[] {
  const out: FaceCollision[] = [];
  for (const refs of byHash.values()) {
    const cards = [...new Set(refs.map((r) => r.card))];
    if (cards.length < 2) continue;
    const titles = [...new Set(cards.map((c) => titleOf(c) ?? "?"))];
    out.push({
      cards,
      titles,
      sources: [...new Set(refs.map((r) => r.source))],
      reprint: titles.length === 1,
    });
  }
  return out.sort((a, b) => Number(a.reprint) - Number(b.reprint));
}

export type TitleMismatch = {
  card: string;
  lang: string;
  source: string;
  catalogue: string;
  sourceName: string;
};

/**
 * Deuxième passe, sans ouvrir une seule image : la face affichée vient d'un
 * relevé qui **nomme** la carte. Si ce nom et notre titre divergent, l'un des
 * deux se trompe.
 *
 * C'est la signature des treize erreurs du 2026-08-20 : toutes montraient un
 * nom qui ne collait pas au titre. Après correction, aucune face affichée ne
 * diverge — et ce contrôle-là coûte une lecture de JSON, pas treize images.
 *
 * Ce qu'il ne voit pas : deux tirages du **même personnage**. Les noms
 * concordent alors, et seul le numéro imprimé départage.
 */
export function titleMismatches(
  shown: ReadonlyArray<{ card: string; lang: string; source: string }>,
  catalogueTitle: (card: string) => string | null,
  sourceName: (source: string, card: string) => string | null,
): TitleMismatch[] {
  const out: TitleMismatch[] = [];
  for (const face of shown) {
    const catalogue = catalogueTitle(face.card);
    const name = sourceName(face.source, face.card);
    if (!catalogue || !name) continue;
    if (catalogue.trim().toLowerCase() === name.trim().toLowerCase()) continue;
    out.push({ ...face, catalogue, sourceName: name });
  }
  return out;
}

function main(): void {
  const root = path.join(dataRoot(), NARUTO_PACK_ID);
  const db = new DatabaseSync(path.join(root, "catalog.sqlite"), {
    readOnly: true,
  });
  const titles = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT p.number, t.full_name FROM print_titles t
       JOIN prints p ON p.print_key = t.print_key WHERE t.lang IN ('en','ja','fr')`,
    )
    .all() as { number: string; full_name: string }[]) {
    if (!titles.has(row.number)) titles.set(row.number, row.full_name);
  }
  db.close();

  const collisions = collisionsFrom(
    hashFaces(path.join(root, "cards")),
    (card) => titles.get(card) ?? null,
  );
  const wrong = collisions.filter((c) => !c.reprint);
  console.log(
    `${collisions.length} images partagées — ${collisions.length - wrong.length} réimpressions, ${wrong.length} à vérifier`,
  );
  for (const c of wrong) {
    console.log(
      `  ${c.cards.join(" = ")}  |  ${c.titles.join(" / ")}  |  ${c.sources.join(",")}`,
    );
  }
}

if (process.argv[1]?.endsWith("auditFaceCollisions.ts")) main();

// --- from foldUnsourcedNarutoArt.ts ---

/**
 * Fold leftover `art.jpg` (written before dumps were named) into
 * `art.<source>.<ext>`. Byte-identical to a named sibling → drop. Unique
 * files get a source when locale + size identify the host; the rest stay
 * `legacy` until that host is scraped.
 */


export const UNSOURCED_ART_NAME = /^art\.(jpe?g|png|gif|webp)$/i;

export type UnsourcedArtPlan =
  | { op: "delete"; keep: string }
  | { op: "rename"; source: NarutoFaceSource }
  | { op: "keep" };

function near(
  width: number,
  height: number,
  tw: number,
  th: number,
  dw = 8,
  dh = 8,
): boolean {
  return Math.abs(width - tw) <= dw && Math.abs(height - th) <= dh;
}

/** Who wrote this unsourced file, or null if we will not invent a host. */
export function inferUnsourcedNarutoSource(input: {
  lang: string;
  appearanceSet?: string | null;
  width: number;
  height: number;
}): NarutoFaceSource | null {
  const lang = input.lang.toLowerCase();
  const set = (input.appearanceSet ?? "").toLowerCase();
  const { width, height } = input;
  if (lang === "ja" && near(width, height, 340, 500, 6, 4)) return "nikita";
  if (lang === "it") return "coleka";
  if (lang === "fr") {
    if (set === "s28") return "coleka";
    if (near(width, height, 350, 495, 8, 8)) return "carddass";
    if (width >= 840 && width <= 860 && height >= 1195 && height <= 1215) {
      return "carddass";
    }
    return null;
  }
  if (lang === "en") {
    if (near(width, height, 750, 1050, 12, 12)) return "vintage";
    if (near(width, height, 350, 490, 8, 8)) {
      return set === "s28" ? "stop2shop" : "goat";
    }
    return null;
  }
  return null;
}

export function planUnsourcedNarutoArt(input: {
  unsourcedFile: string;
  unsourcedHash: string;
  named: readonly { source: NarutoFaceSource; file: string; hash: string }[];
  lang: string;
  appearanceSet?: string | null;
  width: number;
  height: number;
}): UnsourcedArtPlan {
  const twin = input.named.find((row) => row.hash === input.unsourcedHash);
  if (twin) return { op: "delete", keep: twin.file };
  const source = inferUnsourcedNarutoSource(input);
  if (!source) return { op: "keep" };
  if (input.named.some((row) => row.source === source)) return { op: "keep" };
  return { op: "rename", source };
}

function sha1(abs: string): string {
  return createHash("sha1").update(readFileSync(abs)).digest("hex");
}

function loadAppearances(root: string): Record<string, NarutoLangAppearances> {
  try {
    const raw = JSON.parse(
      readFileSync(path.join(root, "appearances.json"), "utf8"),
    ) as { appearances?: Record<string, NarutoLangAppearances> };
    return raw.appearances ?? {};
  } catch {
    return {};
  }
}

function retargetDecision(cardDir: string, from: string, to: string): void {
  try {
    const json = readFileSync(
      path.join(cardDir, NARUTO_FACE_DECISION_FILE),
      "utf8",
    );
    const named = parseNarutoFaceDecision(json, "art");
    if (named === from) recordNarutoFaceDecision(cardDir, "art", to);
  } catch {
    /* no decision */
  }
}

export async function foldUnsourcedNarutoArt(root: string): Promise<{
  deleted: number;
  renamed: number;
  kept: number;
}> {
  const cardsDir = path.join(root, "cards");
  const appearances = loadAppearances(root);
  const { default: sharp } = await import("sharp");
  let deleted = 0;
  let renamed = 0;
  let kept = 0;
  for (const hit of listNarutoCardDirs(cardsDir, appearances)) {
    let files: string[];
    try {
      files = readdirSync(hit.abs);
    } catch {
      continue;
    }
    const unsourced = files.filter((name) => UNSOURCED_ART_NAME.test(name));
    if (!unsourced.length) continue;
    const named: { source: NarutoFaceSource; file: string; hash: string }[] =
      files.flatMap((file) => {
        const source = narutoFaceSourceOf(file);
        if (!source || source === "legacy") return [];
        return [
          {
            source,
            file,
            hash: sha1(path.join(hit.abs, file)),
          },
        ];
      });
    for (const file of unsourced) {
      const abs = path.join(hit.abs, file);
      let width = 0;
      let height = 0;
      try {
        const meta = await sharp(abs).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
      } catch {
        kept += 1;
        continue;
      }
      const plan = planUnsourcedNarutoArt({
        unsourcedFile: file,
        unsourcedHash: sha1(abs),
        named,
        lang: hit.lang,
        appearanceSet: hit.appearanceSet,
        width,
        height,
      });
      if (plan.op === "delete") {
        unlinkSync(abs);
        retargetDecision(hit.abs, file, plan.keep);
        deleted += 1;
        continue;
      }
      if (plan.op === "rename") {
        const ext = path.extname(file).replace(/^\./, "").toLowerCase();
        const destName = narutoFaceFilename(
          plan.source,
          "art",
          ext === "jpeg" ? "jpg" : ext,
        );
        const dest = path.join(hit.abs, destName);
        if (existsSync(dest)) {
          kept += 1;
          continue;
        }
        renameSync(abs, dest);
        retargetDecision(hit.abs, file, destName);
        named.push({ source: plan.source, file: destName, hash: sha1(dest) });
        renamed += 1;
        continue;
      }
      kept += 1;
    }
  }
  return { deleted, renamed, kept };
}
