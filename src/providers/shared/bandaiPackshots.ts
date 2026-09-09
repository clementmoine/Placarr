/**
 * Rapatrier les visuels produit de la base officielle Bandai.
 *
 * La base publie une fiche par JAN, avec l'URL de son visuel sur le CDN Akamai.
 * Rien là-dedans ne relève d'un jeu : on lit des fiches, on écrit des fichiers.
 * Le morceau vivait chez Naruto, et le jour où un second jeu Bandai en a eu
 * besoin — le 疾風伝, séparé le 2026-08-21 — il aurait fallu ou bien le copier,
 * ou bien faire importer un pack par un autre.
 *
 * Le pack fournit ses fiches, la correspondance JAN → nom de fichier, et le
 * dossier de destination. Ce module ne sait rien d'autre.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Une fiche produit, réduite à ce qu'il faut pour aller chercher son visuel. */
export type BandaiProductRow = {
  jan: string;
  image?: string | null;
};

export type PackshotHarvestResult = { written: number; failed: number };

export async function downloadPackshot(
  url: string,
  dest: string,
): Promise<boolean> {
  try {
    const res = await httpGet(url, {
      headers: { "User-Agent": UA },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = (res as { data?: ArrayBuffer }).data;
    if (!data) return false;
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * Écrit un visuel par fiche, sous le nom que les specs du pack attendent.
 *
 * Une fiche sans nom attendu est **ignorée sans erreur** : c'est ainsi qu'un
 * pack ne rapatrie que les siennes quand la base en mélange plusieurs.
 */
export async function harvestBandaiPackshots(input: {
  rows: readonly BandaiProductRow[];
  /** JAN → nom de fichier. Les specs sont l'autorité ; on ne recalcule pas. */
  fileByJan: ReadonlyMap<string, string>;
  destDir: string;
  force?: boolean;
  /** Entre deux téléchargements. Le CDN n'aime pas les rafales. */
  delayMs?: number;
}): Promise<PackshotHarvestResult> {
  const delay = input.delayMs ?? 1200;
  let written = 0;
  let failed = 0;
  for (const row of input.rows) {
    const name = input.fileByJan.get(row.jan);
    if (!name || !row.image) continue;
    const dest = path.join(input.destDir, name);
    if (!input.force && existsSync(dest)) continue;
    if (await downloadPackshot(row.image, dest)) written += 1;
    else failed += 1;
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  return { written, failed };
}
