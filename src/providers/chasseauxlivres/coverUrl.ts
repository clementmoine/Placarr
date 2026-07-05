/**
 * Chasse aux Livres sert souvent une vignette par défaut ; les paramètres
 * `?w=&h=` demandent explicitement une taille utilisable pour la jaquette.
 */
export function chasseCoverDownloadCandidates(url: string): string[] {
  if (!url.includes("img.chasse-aux-livres.fr")) return [url];

  const base = url.split("?")[0];
  const candidates: string[] = [];
  const add = (value: string) => {
    if (!candidates.includes(value)) candidates.push(value);
  };

  add(url);
  for (const size of [1600, 1200, 800, 600]) {
    add(`${base}?w=${size}&h=${size}`);
  }
  add(base);
  return candidates;
}
