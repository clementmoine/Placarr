/**
 * Non-replayable Naruto ledgers / faces live under `curated/` (git).
 * Recoverable scrape output stays under `data/naruto/carddass/`.
 *
 * Tree:
 *   curated/cards/back.{lang}.png
 *   curated/cards/{family}/{ni0001}/{lang}/art.reconstructed.png
 *   curated/cards/{family}/{ni0001}/{lang}/source.jpg
 *   curated/sources/*.json
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDER_DIR = path.dirname(fileURLToPath(import.meta.url));

export function narutoCuratedDir(): string {
  return path.join(PROVIDER_DIR, "curated");
}

/**
 * Visuels de produit faits à la main : badges de série découpés, logo du jeu,
 * emballages photographiés, et les retouches d'un visuel qu'une source sert
 * mal cadré.
 *
 * Ils vivent ici et **pas dans `staging/`** : le staging se reconstruit par
 * script depuis un relevé, donc tout ce qu'on y pose à la main disparaît à la
 * prochaine moisson, sans bruit.
 */
export function narutoCuratedProductsDir(): string {
  return path.join(narutoCuratedDir(), "products");
}

export function narutoCuratedSourcesDir(): string {
  return path.join(narutoCuratedDir(), "sources");
}

export function narutoCuratedReconstructedProvenancePath(): string {
  return path.join(narutoCuratedSourcesDir(), "reconstructed-provenance.json");
}
