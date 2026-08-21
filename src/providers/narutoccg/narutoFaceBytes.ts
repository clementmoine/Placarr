/**
 * Shared bytes helpers for catalogue face installs.
 *
 * Each dump is `art.<source>.<ext>` — never overwrite another source. The
 * displayed file is chosen afterwards (`promoteNarutoFace` → `face.json`).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  NARUTO_FACE_DECISION_FILE,
  narutoFaceFilename,
  narutoFaceSourceOf,
  pickBestNarutoDumpFace,
  recordNarutoFaceDecision,
  type NarutoFaceSource,
  type NarutoStoredFace,
} from "./faceChoice";
import { listNarutoCardDirs } from "./narutoCardDisk";

export function extFromMagic(buf: Buffer): string {
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return ".jpg";
  }
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return ".gif";
  if (buf.length >= 8 && buf.subarray(1, 4).toString("ascii") === "PNG") {
    return ".png";
  }
  if (buf.length >= 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return ".bin";
}

function extForFaceFile(buf: Buffer): string {
  const ext = extFromMagic(buf);
  return ext === ".jpeg" ? ".jpg" : ext;
}

export function existingNarutoArtForSource(
  cardDir: string,
  source: NarutoFaceSource,
): string | null {
  if (!existsSync(cardDir)) return null;
  const hit = readdirSync(cardDir).find(
    (name) => narutoFaceSourceOf(name) === source,
  );
  return hit ?? null;
}

export function writeNarutoArtFile(
  cardDir: string,
  buf: Buffer,
  source: NarutoFaceSource,
): string {
  const ext = extForFaceFile(buf);
  const destName = narutoFaceFilename(source, "art", ext.slice(1));
  mkdirSync(cardDir, { recursive: true });
  for (const name of readdirSync(cardDir)) {
    if (name === destName) continue;
    if (narutoFaceSourceOf(name) === source) {
      unlinkSync(path.join(cardDir, name));
    }
  }
  writeFileSync(path.join(cardDir, destName), buf);
  return destName;
}

const SPECIAL_FACE = /^art\.(reconstructed|corrected)\.(jpe?g|png|webp|gif)$/i;

export async function promoteNarutoFace(
  cardDir: string,
  lang: string,
): Promise<string | null> {
  if (!existsSync(cardDir)) return null;
  const files = readdirSync(cardDir);
  const reconstructed = files.find((name) =>
    /^art\.reconstructed\.(jpe?g|png|webp|gif)$/i.test(name),
  );
  if (reconstructed) {
    recordNarutoFaceDecision(cardDir, "art", reconstructed);
    return reconstructed;
  }
  const corrected = files.find((name) =>
    /^art\.corrected\.(jpe?g|png|webp|gif)$/i.test(name),
  );
  if (corrected) {
    recordNarutoFaceDecision(cardDir, "art", corrected);
    return corrected;
  }
  const { default: sharp } = await import("sharp");
  const stored: NarutoStoredFace[] = [];
  for (const name of files) {
    if (SPECIAL_FACE.test(name)) continue;
    const source = narutoFaceSourceOf(name);
    if (!source) continue;
    try {
      const meta = await sharp(path.join(cardDir, name)).metadata();
      stored.push({
        source,
        file: name,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      });
    } catch {
      stored.push({ source, file: name, width: 0, height: 0 });
    }
  }
  const best = pickBestNarutoDumpFace(stored, lang);
  if (!best) return null;
  const winner = stored.find((face) => face.source === best);
  const filename = winner?.file ?? narutoFaceFilename(best);
  recordNarutoFaceDecision(cardDir, "art", filename);
  return filename;
}

export async function promoteAllNarutoFaces(root: string): Promise<number> {
  const cardsDir = path.join(root, "cards");
  let rewritten = 0;
  for (const hit of listNarutoCardDirs(cardsDir)) {
    const before = existsSync(path.join(hit.abs, NARUTO_FACE_DECISION_FILE))
      ? readFileSync(path.join(hit.abs, NARUTO_FACE_DECISION_FILE), "utf8")
      : "";
    const named = await promoteNarutoFace(hit.abs, hit.lang);
    if (!named) continue;
    const after = existsSync(path.join(hit.abs, NARUTO_FACE_DECISION_FILE))
      ? readFileSync(path.join(hit.abs, NARUTO_FACE_DECISION_FILE), "utf8")
      : "";
    if (after !== before) rewritten += 1;
  }
  return rewritten;
}

export async function saveNarutoFace(opts: {
  cardDir: string;
  buf: Buffer;
  source: NarutoFaceSource;
  lang: string;
  force?: boolean;
}): Promise<"ok" | "skip"> {
  const had = existingNarutoArtForSource(opts.cardDir, opts.source);
  if (!opts.force && had) {
    await promoteNarutoFace(opts.cardDir, opts.lang);
    return "skip";
  }
  writeNarutoArtFile(opts.cardDir, opts.buf, opts.source);
  await promoteNarutoFace(opts.cardDir, opts.lang);
  return "ok";
}
