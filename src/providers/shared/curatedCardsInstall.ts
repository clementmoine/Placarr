/**
 * Mirror `curated/cards/` → `data/<pack>/cards/`.
 *
 * The tree is the contract: pack verso at `back.*`, set verso at `{set}/back.*`
 * (sibling of `en/` / `fr/`, not inside them). Language-specific versos use
 * the filename `back.{lang}.*` at that same directory — the runtime already
 * resolves those via `backFilenameCandidates`. Markdown is not part of the
 * tree and is not copied.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";

const BACK_FILE = /^back(?:\.([a-z]{2}(?:[a-z]{2})?))?\.(webp|png|jpe?g)$/i;
const BACK_SIBLING = /^(back(?:\.[a-z]{2}(?:[a-z]{2})?)?)\.(webp|png|jpe?g)$/i;
const LANG_DIR = /^[a-z]{2}(?:[a-z]{2})?$/i;

export type CuratedBackInstall = {
  src: string;
  dest: string;
  installed: boolean;
};

export function curatedDestStale(srcPath: string, destPath: string): boolean {
  if (!existsSync(destPath)) return true;
  return statSync(srcPath).mtimeMs > statSync(destPath).mtimeMs;
}

export function curatedCardsDir(curatedRoot: string): string {
  return path.join(curatedRoot, "cards");
}

/** `back.png` → `back.webp`; `back.fr.png` → `back.fr.webp`. */
export function destBackWebpName(filename: string): string | null {
  const m = BACK_FILE.exec(filename);
  if (!m) return null;
  const lang = m[1]?.toLowerCase();
  return lang ? `back.${lang}.webp` : "back.webp";
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

export function listCuratedBackSources(
  cardsDir: string,
): { src: string; destRel: string }[] {
  if (!existsSync(cardsDir)) return [];
  const out: { src: string; destRel: string }[] = [];

  const collect = (dir: string, destDirRel: string) => {
    for (const name of readdirSync(dir)) {
      if (!isSafeSegment(name)) continue;
      const destName = destBackWebpName(name);
      if (!destName) continue;
      const src = path.join(dir, name);
      if (!statSync(src).isFile()) continue;
      const destRel = destDirRel ? `${destDirRel}/${destName}` : destName;
      out.push({ src, destRel });
    }
  };

  collect(cardsDir, "");

  for (const name of readdirSync(cardsDir)) {
    if (!isSafeSegment(name)) continue;
    const abs = path.join(cardsDir, name);
    if (!statSync(abs).isDirectory()) continue;
    collect(abs, name);
  }

  return out.sort((a, b) => a.destRel.localeCompare(b.destRel));
}

/** Faces live in `{set}/{lang}/`; a shared sleeve does not. */
function warnMisplacedLangBacksUnder(cardsDir: string): void {
  if (!existsSync(cardsDir)) return;
  for (const set of readdirSync(cardsDir)) {
    if (!isSafeSegment(set)) continue;
    const setDir = path.join(cardsDir, set);
    if (!statSync(setDir).isDirectory()) continue;
    for (const name of readdirSync(setDir)) {
      if (!LANG_DIR.test(name)) continue;
      const langDir = path.join(setDir, name);
      if (!statSync(langDir).isDirectory()) continue;
      for (const file of readdirSync(langDir)) {
        if (!destBackWebpName(file)) continue;
        console.warn(
          `   curated back ignored at cards/${set}/${name}/${file} — ` +
            `place a shared sleeve at cards/${set}/back.png ` +
            `(or cards/${set}/back.${name}.png for that locale only)`,
        );
      }
    }
  }
}

function unlinkLegacySiblings(destPath: string): void {
  const dir = path.dirname(destPath);
  const destName = path.basename(destPath);
  const stem = destName.replace(/\.webp$/i, "");
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === destName) continue;
    const m = BACK_SIBLING.exec(name);
    if (!m || m[1]!.toLowerCase() !== stem.toLowerCase()) continue;
    unlinkSync(path.join(dir, name));
  }
}

async function writeBackWebp(src: string, dest: string): Promise<void> {
  mkdirSync(path.dirname(dest), { recursive: true });
  if (/\.webp$/i.test(src)) {
    copyFileSync(src, dest);
    return;
  }
  await sharp(src).webp({ lossless: true, effort: 6 }).toFile(dest);
}

/**
 * Install every pack/set `back.*` under `curated/cards/` as lossless `back.webp`
 * at the same relative directory in `data/<pack>/cards/`.
 */
export async function installCuratedCardBacks(opts: {
  curatedCardsDir: string;
  destCardsDir: string;
  force?: boolean;
  dryRun?: boolean;
  /** Rewrite a pack-level `back.webp` (Naruto EN sleeve → `back.en.webp`). */
  packBackDestName?: string;
}): Promise<CuratedBackInstall[]> {
  warnMisplacedLangBacksUnder(opts.curatedCardsDir);
  const rows: CuratedBackInstall[] = [];
  for (const { src, destRel: rawDestRel } of listCuratedBackSources(
    opts.curatedCardsDir,
  )) {
    const destRel =
      opts.packBackDestName && rawDestRel === "back.webp"
        ? opts.packBackDestName
        : rawDestRel;
    const dest = path.join(opts.destCardsDir, destRel);
    const stale = opts.force || curatedDestStale(src, dest);
    if (!stale) {
      rows.push({ src, dest, installed: false });
      continue;
    }
    if (opts.dryRun) {
      rows.push({ src, dest, installed: true });
      continue;
    }
    await writeBackWebp(src, dest);
    unlinkLegacySiblings(dest);
    rows.push({ src, dest, installed: true });
  }
  return rows;
}
