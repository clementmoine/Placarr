/**
 * Dump Lorcana web viewer foil textures into the effects store.
 *
 * Fetches `https://cards.disneylorcana.com/fr-FR`, follows hashed CSS
 * (`routes-*.css` / `index-*.css`), downloads `/assets/<stem>-<hash>.ext`
 * and writes stable names `<stem>.ext` under `lorcana/web/`.
 */

import fs from "node:fs";
import path from "node:path";

import { dataRoot, foilPackDir } from "@/lib/runtimeData";

const VIEWER_BASE = "https://cards.disneylorcana.com";
const VIEWER_LOCALE = "fr-FR";
const UA = "Placarr-lorcana-web/1.0";

const CSS_HREF_RE =
  /['"](\/assets\/(?:routes|index)-[^'"]+\.css)['"]/gi;
const ASSET_URL_RE =
  /url\(\s*['"]?(\/assets\/([a-z0-9]+)(?:-([A-Za-z0-9_-]+))?\.((?:jpe?g|png|webp)))['"]?\s*\)/gi;
const CSS_FALLBACK_RE = /\/assets\/[^"'\\\s]+\.css/g;

export const FOIL_STEMS = new Set([
  "satin",
  "satinc",
  "satind",
  "silverc",
  "calc",
  "calendarwave",
  "ff2",
  "ff2c",
  "glitter",
  "lava2",
  "lore",
  "magma",
  "pillar",
  "pillar2",
  "color",
  "tempest",
  "vertwave",
  "vertwavec",
  "seawave",
]);

export type DumpLorcanaWebOptions = {
  /** Repo root (defaults to parent of `dataRoot()`). */
  root?: string;
};

async function httpGet(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export function discoverCssPaths(html: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(CSS_HREF_RE)) {
    const p = m[1];
    if (p && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  }
  if (paths.length === 0) {
    for (const m of html.matchAll(CSS_FALLBACK_RE)) {
      const p = m[0];
      if (!seen.has(p)) {
        seen.add(p);
        paths.push(p);
      }
    }
  }
  return paths;
}

/**
 * Every `/assets/<stem>-<hash>.ext` path in a CSS sheet (foil + chrome).
 * Used by gap audits to spot new site textures before they join `FOIL_STEMS`.
 */
export function parseAllAssetStems(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const m of css.matchAll(ASSET_URL_RE)) {
    const assetPath = m[1];
    const stem = (m[2] ?? "").toLowerCase();
    if (!stem || !assetPath) continue;
    if (!(stem in found)) found[stem] = assetPath;
  }
  return found;
}

/** Foil stems only — allowlisted for download into `data/lorcana/foil/web/`. */
export function parseAssetRefs(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [stem, assetPath] of Object.entries(parseAllAssetStems(css))) {
    if (!FOIL_STEMS.has(stem)) continue;
    found[stem] = assetPath;
  }
  return found;
}

/** Stems present in CSS but not yet in `FOIL_STEMS` (candidate foil textures). */
export function unlistedFoilStemCandidates(
  allStems: Record<string, string>,
): string[] {
  return Object.keys(allStems)
    .filter((stem) => !FOIL_STEMS.has(stem))
    .sort();
}

export function stableName(stem: string, ext: string): string {
  let e = ext.toLowerCase();
  if (e === "jpeg") e = "jpg";
  return `${stem}.${e}`;
}

async function downloadAssets(
  refs: Record<string, string>,
  dest: string,
): Promise<{ written: string[]; sources: Record<string, string> }> {
  fs.mkdirSync(dest, { recursive: true });
  const written: string[] = [];
  const sources: Record<string, string> = {};
  for (const stem of Object.keys(refs).sort()) {
    const assetPath = refs[stem]!;
    const ext = path.extname(assetPath).replace(/^\./, "");
    const name = stableName(stem, ext);
    const target = path.join(dest, name);
    const url = `${VIEWER_BASE.replace(/\/$/, "")}${assetPath}`;
    try {
      const data = await httpGet(url);
      fs.writeFileSync(target, data);
      written.push(name);
      sources[name] = url;
      console.log(`  ${name} ← ${assetPath}`);
    } catch (err) {
      console.log(`  ATTENTION fetch ${url}: ${err}`);
    }
  }
  return { written, sources };
}

async function scrapeViewer(): Promise<{
  refs: Record<string, string>;
  allStems: Record<string, string>;
}> {
  const html = (await httpGet(`${VIEWER_BASE}/${VIEWER_LOCALE}`)).toString(
    "utf8",
  );
  const cssPaths = discoverCssPaths(html);
  console.log(`  CSS sheets: ${cssPaths.length}`);
  const merged: Record<string, string> = {};
  const allStems: Record<string, string> = {};
  for (const cssPath of cssPaths) {
    try {
      const css = (
        await httpGet(`${VIEWER_BASE.replace(/\/$/, "")}${cssPath}`)
      ).toString("utf8");
      const discovered = parseAllAssetStems(css);
      const refs = parseAssetRefs(css);
      console.log(
        `  ${cssPath}: ${Object.keys(refs).length} foil / ${Object.keys(discovered).length} asset stem(s)`,
      );
      for (const [stem, asset] of Object.entries(discovered)) {
        if (!(stem in allStems)) allStems[stem] = asset;
      }
      for (const [stem, asset] of Object.entries(refs)) {
        if (!(stem in merged)) merged[stem] = asset;
      }
    } catch (err) {
      console.log(`  ATTENTION CSS ${cssPath}: ${err}`);
    }
  }
  return { refs: merged, allStems };
}

function writeSourceJson(
  dest: string,
  sources: Record<string, string>,
  refs: Record<string, string>,
  unlistedStems: string[],
): void {
  const payload = {
    viewer: `${VIEWER_BASE}/${VIEWER_LOCALE}`,
    stems: refs,
    unlistedStems,
    files: sources,
  };
  const ordered = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)),
  );
  fs.writeFileSync(
    path.join(dest, "source.json"),
    `${JSON.stringify(ordered, null, 2)}\n`,
    "utf8",
  );
}

function resolveWebDest(root?: string): { dest: string; dataBase: string } {
  if (root) {
    const dataBase = path.join(path.resolve(root), "data");
    return {
      dest: path.join(dataBase, "lorcana", "foil", "web"),
      dataBase,
    };
  }
  return {
    dest: path.join(foilPackDir("lorcana"), "web"),
    dataBase: dataRoot(),
  };
}

/** @deprecated Prefer `dumpLorcanaWeb`. */
export async function runDump(
  repo: string,
): Promise<Record<string, unknown>> {
  return dumpLorcanaWeb({ root: repo });
}

export async function dumpLorcanaWeb(
  opts: DumpLorcanaWebOptions = {},
): Promise<Record<string, unknown>> {
  const { dest, dataBase } = resolveWebDest(opts.root);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  console.log(`Destination: ${dest}`);
  console.log(`Phase 1 — scrape ${VIEWER_BASE}/${VIEWER_LOCALE} CSS`);
  let refs: Record<string, string> = {};
  let allStems: Record<string, string> = {};
  try {
    const scraped = await scrapeViewer();
    refs = scraped.refs;
    allStems = scraped.allStems;
  } catch (err) {
    console.log(`  Viewer scrape failed: ${err}`);
  }
  const unlisted = unlistedFoilStemCandidates(allStems);
  if (unlisted.length) {
    console.log(
      `  Unlisted asset stems (not in FOIL_STEMS — review for new foils): ${unlisted.join(", ")}`,
    );
  }
  if (Object.keys(refs).length === 0) {
    console.log("  No hashed foil assets found — store unchanged");
    return { provider: "lorcanaweb", files: 0, dest, unlistedStems: unlisted };
  }
  console.log(
    `Phase 2 — download ${Object.keys(refs).length} texture(s) as stable names`,
  );
  const { written, sources } = await downloadAssets(refs, dest);
  writeSourceJson(dest, sources, refs, unlisted);
  fs.writeFileSync(
    path.join(dest, "README.txt"),
    "Web foil textures for the Lorcana CSS viewer port.\n" +
      "Finish → texture mapping: src/effects/lorcana/cssRecipes.ts\n" +
      "New finish checklist: docs/foil_new_finish.md\n" +
      "Regenerate: pnpm foil:lorcana\n",
    "utf8",
  );
  const rel = path.relative(dataBase, dest);
  console.log(`Terminé — ${written.length} fichier(s) → ${rel}`);
  return {
    provider: "lorcanaweb",
    files: written.length,
    stems: Object.keys(refs).sort(),
    unlistedStems: unlisted,
    dest,
  };
}
