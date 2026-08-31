/**
 * Détecte les composites marketing des marketplaces, pas des faces de carte.
 *
 * Mercari Shops (et Rakuma pour les boutiques) génère une version « réseaux
 * sociaux » de la photo vendeur : image paddée sur fond menthe uniforme, logo
 * de catégorie (トレカ) et watermark de la boutique — la carte n'occupe plus
 * que ~50 % du cadre. C'est l'og:image de la fiche ; les photos brutes sont
 * dans la galerie JS (voir curated/sources/mercari.json, clé `shops`).
 *
 * Relevé 2026-08-31 : 35 faces JA installées depuis fril étaient ce composite
 * (le vendeur cross-poste l'image générée). Fond type : RGB(188, 208, 196).
 */

const MINT_MAX_DISTANCE = 14;
const PADDED_MIN_SHARE = 0.35;

/** Un vert menthe clair désaturé — le fond type du composite. */
function isMintish(r: number, g: number, b: number): boolean {
  return g > r + 5 && g > b + 3 && r > 120;
}

export async function isMarketplacePaddedImage(buf: Buffer): Promise<boolean> {
  const { default: sharp } = await import("sharp");
  const size = 64;
  const { data } = await sharp(buf)
    .resize(size, size, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * size + x) * 3;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const bg = at(0, 0);
  if (!isMintish(...bg)) return false;
  let close = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (
      Math.abs(data[i]! - bg[0]) < MINT_MAX_DISTANCE &&
      Math.abs(data[i + 1]! - bg[1]) < MINT_MAX_DISTANCE &&
      Math.abs(data[i + 2]! - bg[2]) < MINT_MAX_DISTANCE
    ) {
      close += 1;
    }
  }
  return close / (size * size) > PADDED_MIN_SHARE;
}
