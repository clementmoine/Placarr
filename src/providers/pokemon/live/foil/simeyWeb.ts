/**
 * Kit foil web Pokémon — dépôts CSS de simeydotme (`pokemon-cards-css`,
 * `pokemon-cards-151`), même chaîne que le visualiseur Lorcana
 * (`shared/webFoilKit`) : tout en HTTP (`lib/http`), fichiers lus au commit
 * amont figé, provenance par fichier dans `logs/simey-source.json`.
 *
 * - CSS des cartes → `foil/simey/<arbre>/public/css/cards/` (référence de
 *   portage et audit des écarts, non servi).
 * - Textures partagées, indépendantes de la langue → `foil/textures/simey_*.webp`
 *   (servies à l'exécution par les recettes de `holoShadersPokemon`).
 *
 * Étape `simey` de la Sync Pokémon ; rien n'est retéléchargé tant que le
 * commit amont n'a pas bougé et que tout est sur disque.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { httpGet } from "@/lib/http/httpClient";
import { foilPackDir, packLogsDir } from "@/lib/packPaths";
import {
  downloadWebFoilAssets,
  fetchWebAssetBytes,
  writeWebFoilSourceLedger,
  type WebFoilAsset,
} from "@/providers/shared/webFoilKit";

type SharedImg = { src: string; destStem: string };

/** poke-holo `public/img/*` — FX partagés et motifs de finition. */
const POKE_HOLO_SHARED: SharedImg[] = [
  { src: "glitter.png", destStem: "simey_glitter" },
  { src: "grain.webp", destStem: "simey_grain" },
  { src: "cosmos-bottom.png", destStem: "simey_cosmos-bottom" },
  { src: "cosmos-middle-trans.png", destStem: "simey_cosmos-middle-trans" },
  { src: "cosmos-top-trans.png", destStem: "simey_cosmos-top-trans" },
  { src: "trainerbg.png", destStem: "simey_trainerbg" },
  { src: "illusion.png", destStem: "simey_illusion" },
  { src: "illusion-mask.png", destStem: "simey_illusion-mask" },
  { src: "geometric.png", destStem: "simey_geometric" },
  { src: "ancient.png", destStem: "simey_ancient" },
  { src: "vmaxbg.jpg", destStem: "simey_vmaxbg" },
];

/** poke-151 `public/img/151/*` — motifs de set / finition. */
const POKE_151_SHARED: SharedImg[] = [
  { src: "noise-base.webp", destStem: "simey_noise-base" },
  { src: "noise-top.webp", destStem: "simey_noise-top" },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    src: `iri-${n}.webp`,
    destStem: `simey_iri-${n}`,
  })),
  { src: "birthday-holo.webp", destStem: "simey_birthday-holo" },
  { src: "birthday-holo-dank.webp", destStem: "simey_birthday-holo-dank" },
  { src: "birthday-holo-dank-2.webp", destStem: "simey_birthday-holo-dank-2" },
  { src: "pokeball-outer.webp", destStem: "simey_pokeball-outer" },
  { src: "pokeball-inner.webp", destStem: "simey_pokeball-inner" },
  { src: "masterball-outer.webp", destStem: "simey_masterball-outer" },
  { src: "masterball-inner.webp", destStem: "simey_masterball-inner" },
];

export const SIMEY_TREES = [
  {
    id: "poke-holo",
    repo: "simeydotme/pokemon-cards-css",
    imgDir: "public/img",
    shared: POKE_HOLO_SHARED,
  },
  {
    id: "poke-151",
    repo: "simeydotme/pokemon-cards-151",
    imgDir: "public/img/151",
    shared: POKE_151_SHARED,
  },
] as const;

const CSS_DIR = "public/css/cards";
const API = "https://api.github.com/repos";
const RAW = "https://raw.githubusercontent.com";

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await httpGet<unknown>(url, {
    headers: { Accept: "application/vnd.github+json" },
    timeout: 30_000,
  });
  return res.data;
}

/** PNG → WebP sans perte, JPEG → WebP q90, WebP tel quel. */
async function toWebp(bytes: Buffer, entry: WebFoilAsset): Promise<Buffer> {
  const src = new URL(entry.url).pathname.toLowerCase();
  if (src.endsWith(".webp")) return bytes;
  const lossy = src.endsWith(".jpg") || src.endsWith(".jpeg");
  return sharp(bytes)
    .webp(lossy ? { quality: 90 } : { lossless: true })
    .toBuffer();
}

export type SyncSimeyWebOpts = {
  force?: boolean;
  foilDir?: string;
  logsDir?: string;
  fetchJson?: (url: string) => Promise<unknown>;
  fetchBytes?: (url: string) => Promise<Buffer>;
  log?: (line: string) => void;
};

type TreeLedger = {
  repo: string;
  commit: string;
  license: string | null;
  files: Record<string, string>;
};

export async function syncSimeyWebAssets(
  opts: SyncSimeyWebOpts = {},
): Promise<{ refreshed: string[]; upToDate: string[]; failed: string[] }> {
  const foilDir = opts.foilDir ?? foilPackDir("pokemon");
  const logsDir = opts.logsDir ?? packLogsDir("pokemon");
  const fetchJson = opts.fetchJson ?? defaultFetchJson;
  const fetchBytes =
    opts.fetchBytes ?? ((url: string) => fetchWebAssetBytes(url));
  const log = opts.log ?? ((line: string) => console.log(line));
  const texturesDir = path.join(foilDir, "textures");
  const ledgerPath = path.join(logsDir, "simey-source.json");
  const previous: { trees?: Record<string, TreeLedger> } = existsSync(
    ledgerPath,
  )
    ? (JSON.parse(readFileSync(ledgerPath, "utf8")) as {
        trees?: Record<string, TreeLedger>;
      })
    : {};
  const trees: Record<string, TreeLedger> = { ...(previous.trees ?? {}) };
  const refreshed: string[] = [];
  const upToDate: string[] = [];
  const failed: string[] = [];

  for (const tree of SIMEY_TREES) {
    const treeDir = path.join(foilDir, "simey", tree.id);
    const cssDir = path.join(treeDir, ...CSS_DIR.split("/"));
    try {
      const head = (
        (await fetchJson(`${API}/${tree.repo}/commits/HEAD`)) as {
          sha?: string;
        }
      )?.sha?.toLowerCase();
      if (!head || !/^[0-9a-f]{40}$/.test(head)) {
        throw new Error(`commit HEAD illisible pour ${tree.repo}`);
      }
      const commitFile = path.join(treeDir, "UPSTREAM_COMMIT");
      const local = existsSync(commitFile)
        ? readFileSync(commitFile, "utf8").trim().toLowerCase()
        : null;
      const texturesOk = tree.shared.every((img) =>
        existsSync(path.join(texturesDir, `${img.destStem}.webp`)),
      );
      if (!opts.force && local === head && existsSync(cssDir) && texturesOk) {
        upToDate.push(tree.id);
        log(`  simey ${tree.id} : à jour (${head.slice(0, 12)})`);
        continue;
      }

      const raw = (file: string) => `${RAW}/${tree.repo}/${head}/${file}`;
      const listing = (await fetchJson(
        `${API}/${tree.repo}/contents/${CSS_DIR}?ref=${head}`,
      )) as Array<{ name?: string; type?: string }>;
      const cssEntries = (Array.isArray(listing) ? listing : [])
        .filter((row) => row.type === "file" && row.name?.endsWith(".css"))
        .map((row) => ({
          name: row.name!,
          url: raw(`${CSS_DIR}/${row.name}`),
        }));
      const css = await downloadWebFoilAssets(cssEntries, cssDir, {
        fetchBytes,
        log,
      });
      const docs = await downloadWebFoilAssets(
        [
          { name: "LICENSE", url: raw("LICENSE") },
          { name: "README.md", url: raw("README.md") },
        ],
        treeDir,
        { fetchBytes, log },
      );
      const textures = await downloadWebFoilAssets(
        tree.shared.map((img) => ({
          name: `${img.destStem}.webp`,
          url: raw(`${tree.imgDir}/${img.src}`),
        })),
        texturesDir,
        { fetchBytes, transform: toWebp, log },
      );
      let license: string | null = null;
      try {
        const meta = (await fetchJson(`${API}/${tree.repo}`)) as {
          license?: { spdx_id?: string } | null;
        };
        license = meta?.license?.spdx_id ?? null;
      } catch {
        /* licence : information, pas bloquante */
      }
      mkdirSync(treeDir, { recursive: true });
      writeFileSync(commitFile, `${head}\n`);
      trees[tree.id] = {
        repo: `https://github.com/${tree.repo}`,
        commit: head,
        license,
        files: { ...css.sources, ...docs.sources, ...textures.sources },
      };
      refreshed.push(tree.id);
      log(
        `  simey ${tree.id} : ${head.slice(0, 12)} — ${css.written.length} CSS, ${textures.written.length}/${tree.shared.length} textures` +
          (textures.failed.length
            ? ` (manquantes : ${textures.failed.join(", ")})`
            : ""),
      );
    } catch (error) {
      failed.push(tree.id);
      log(
        `  simey ${tree.id} : échec (${error instanceof Error ? error.message : error})`,
      );
    }
  }

  writeWebFoilSourceLedger(logsDir, "simey-source.json", { trees });
  return { refreshed, upToDate, failed };
}
