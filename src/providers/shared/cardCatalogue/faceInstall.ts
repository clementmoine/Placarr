/**
 * Installation d'une face de carte depuis une URL — le boilerplate que chaque
 * provider recopiait : télécharger (UA navigateur, seuil anti-placeholder),
 * réutiliser **cette** source déjà en place, convertir en webp, écrire le fichier.
 *
 * Contrat TCG : on n'ignore jamais un hôte parce qu'une autre illustration est
 * déjà là. Resume = `artName` présent sur disque. Le classement d'affichage
 * appartient à `faceChoice` / le moteur de pack, pas à cet helper.
 *
 * Durabilité : avant d'appeler cet helper, les harvests consultent
 * {@link catalogUrlRequiresLocalConservation}. URL durableCdn peut rester
 * distante en base ; URL éphémère → conservation locale obligatoire ici.
 *
 * Le mapping ledger → printKey reste chez le provider (c'est son identité) ;
 * seul le tuyau octets → disque est commun. Les pipelines réellement plus
 * riches (dbscg/dbsfw `fetchFaces` : fallback multi-URL + détection throttle)
 * gardent leur propre download. `saveNarutoFace` reste Naruto (magic bytes).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { httpGet } from "@/lib/http/httpClient";
import {
  catalogUrlMayStayRemote,
  catalogUrlRequiresLocalConservation,
} from "@/providers/shared/catalogDurableCdn";

/** UA navigateur partagé pour les téléchargements de faces. */
export const CARD_FACE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Réexport contrat — harvests décident remote vs local avant install. */
export {
  catalogUrlMayStayRemote,
  catalogUrlRequiresLocalConservation,
};

/**
 * Après promote d'un fichier staging → data/ : enregistre le hash puis purge.
 * Skip re-fetch au sync suivant si {@link catalogArtefactIsFresh}.
 */
export { recordCatalogPromoteAndPurgeStaging, catalogArtefactIsFresh } from "@/providers/shared/catalogIngestLedger";

export type DownloadCardFaceOptions = {
  referer?: string;
  /** En dessous, c'est un placeholder / une erreur HTML — rejeté. */
  minBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
};

/** Télécharge les octets d'une face. `null` = échec ou trop petit. */
export async function downloadCardFaceBytes(
  url: string,
  opts: DownloadCardFaceOptions = {},
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": CARD_FACE_UA,
        Accept: "image/*,*/*;q=0.8",
        ...(opts.referer ? { Referer: opts.referer } : {}),
      },
      responseType: "arraybuffer",
      timeout: opts.timeoutMs ?? 40_000,
      ...(opts.maxRedirects != null ? { maxRedirects: opts.maxRedirects } : {}),
      validateStatus: (s) => s === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    return buf.byteLength >= (opts.minBytes ?? 800) ? buf : null;
  } catch {
    return null;
  }
}

export type InstallCardFaceOptions = {
  destDir: string;
  /** Nom du fichier à écrire, ex. `art.nikita.jpg` / `art.scanflip.webp`. */
  artName: string;
  url: string;
  /** Retélécharge même si `artName` existe. */
  force?: boolean;
  /**
   * Rotation clock-wise en degrés après téléchargement (sharp).
   * 270 = paysage scanné en portrait (CCW 90).
   */
  rotateDegrees?: number;
  /** Convertit en webp (rotate EXIF + qualité). Absent = octets bruts. */
  webpQuality?: number;
  referer?: string;
  minBytes?: number;
  timeoutMs?: number;
  /** Couture de test — remplace le fetch mercdn/CDN réel. */
  fetchImage?: (url: string) => Promise<Buffer | null>;
};

export type InstallCardFaceOutcome = {
  /** Fichier à référencer dans `writeAssets` (existant réutilisé ou écrit). */
  art: string;
  downloaded: boolean;
};

/**
 * Installe une face : réutilise `artName` s'il est déjà là, sinon télécharge,
 * convertit si demandé, écrit. `null` = rien d'utilisable (échec réseau).
 *
 * Ne court-circuite **jamais** sur un autre `art.<source>` — chaque dump reste.
 */
export async function installCardFace(
  opts: InstallCardFaceOptions,
): Promise<InstallCardFaceOutcome | null> {
  mkdirSync(opts.destDir, { recursive: true });

  if (!opts.force && existsSync(path.join(opts.destDir, opts.artName))) {
    return { art: opts.artName, downloaded: false };
  }

  const fetchImage =
    opts.fetchImage ??
    ((url: string) =>
      downloadCardFaceBytes(url, {
        referer: opts.referer,
        minBytes: opts.minBytes,
        timeoutMs: opts.timeoutMs,
      }));
  const buf = await fetchImage(opts.url);
  if (!buf) return null;

  const needsProcess =
    opts.webpQuality != null || (opts.rotateDegrees ?? 0) !== 0;
  if (!needsProcess) {
    writeFileSync(path.join(opts.destDir, opts.artName), buf);
    return { art: opts.artName, downloaded: true };
  }

  let pipeline = sharp(buf).rotate(); // EXIF first
  if (opts.rotateDegrees) {
    pipeline = pipeline.rotate(opts.rotateDegrees);
  }
  const out =
    opts.webpQuality != null
      ? await pipeline.webp({ quality: opts.webpQuality }).toBuffer()
      : await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  writeFileSync(path.join(opts.destDir, opts.artName), out);
  return { art: opts.artName, downloaded: true };
}
