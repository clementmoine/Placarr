/**
 * Runtime data roots under ``data/`` (not ``public/``, not ``cache/``).
 * Override with ``PLACARR_DATA_DIR``.
 *
 * Foil binaries live at ``data/<pack>/foil/`` (served as ``/foil/<pack>/…``).
 * ``PLACARR_EFFECTS_DIR`` overrides the data-root used for foil packs only
 * (layout still ``<root>/<pack>/foil``).
 */
import path from "node:path";

export function dataRoot(): string {
  const override = process.env.PLACARR_DATA_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "data");
}

export function uploadsDir(): string {
  return path.join(dataRoot(), "uploads");
}

/** Data-root for foil packs (``PLACARR_EFFECTS_DIR`` or ``dataRoot()``). */
export function foilDataRoot(): string {
  const override = process.env.PLACARR_EFFECTS_DIR?.trim();
  if (override) return path.resolve(override);
  return dataRoot();
}

/** Binary foil assets for a pack — ``data/<pack>/foil``. */
export function foilPackDir(pack: string): string {
  return path.join(foilDataRoot(), pack, "foil");
}

/** Domain staging for a foil pack — ``data/<pack>`` (last-run, apks, logs, …). */
export function foilPackDataDir(pack: string): string {
  return path.join(dataRoot(), pack);
}

/** Private provider / scrape bytes — never HTTP. */
export function domainDataDir(domain: string): string {
  return path.join(dataRoot(), domain);
}

export function titleIdfDir(): string {
  return (
    process.env.TOKEN_CORPUS_CACHE_DIR?.trim() ||
    path.join(dataRoot(), "indexes", "title-idf")
  );
}
