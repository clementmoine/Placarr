/**
 * Runtime data roots under ``data/`` (not ``public/``, not ``cache/``).
 * Override with ``PLACARR_DATA_DIR``.
 *
 * Pack render kit: ``data/<pack>/foil/`` served under ``/assets/<pack>/…``
 * (catalogue faces live in ``data/<pack>/cards/``).
 * ``PLACARR_EFFECTS_DIR`` overrides the data-root used for pack assets only
 * (layout still ``<root>/<pack>/foil`` + ``<root>/<pack>/cards``).
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

/** Data-root for pack assets (``PLACARR_EFFECTS_DIR`` or ``dataRoot()``). */
export function foilDataRoot(): string {
  const override = process.env.PLACARR_EFFECTS_DIR?.trim();
  if (override) return path.resolve(override);
  return dataRoot();
}

/** Render kit for a pack — ``data/<pack>/foil``. */
export function foilPackDir(pack: string): string {
  return path.join(foilDataRoot(), pack, "foil");
}

/** Catalogue faces — ``data/<pack>/cards``. */
export function packCardsDir(pack: string): string {
  return path.join(foilDataRoot(), pack, "cards");
}

/** Domain staging for a pack — ``data/<pack>`` (last-run, staging, logs, …). */
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
