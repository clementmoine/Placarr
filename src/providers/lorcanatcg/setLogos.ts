/**
 * Official Lorcana set wordmarks from `api.lorcana.ravensburger.com`.
 *
 * `GET /v3/catalog/fr` → `card_sets[].thumbnail_image_url`. Those "thumbs"
 * are the chapter / Quest / Gateway logos (512×288), not card art.
 *
 * Bytes land under `data/lorcana/products/sets/{id}/logo.png` and are served
 * as `/assets/lorcana/products/sets/{id}/logo.png`. Join at ingest is unique
 * or empty — never a coin-flip between two chapters.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { assetsPackFileUrl, packSealedProductsDir } from "@/lib/packPaths";
import { foilPackDataDir } from "@/lib/runtimeData";
import { httpGet } from "@/lib/http/httpClient";

export const LORCANA_SET_LOGO_CACHE_VERSION = 2;
export const LORCANA_CATALOG_URL =
  "https://api.lorcana.ravensburger.com/v3/catalog/fr";
const UA = "Placarr-lorcana-web/1.0";
const SET_ID_RE = /^(set|quest|gateway)\d+$/i;

export type LorcanaSetLogoRow = {
  id: string;
  name: string | null;
  sourceUrl: string;
  /** Local `/assets/lorcana/products/sets/{id}/logo.png` once dumped. */
  logo: string | null;
};

export type LorcanaSetLogoIndex = {
  version: typeof LORCANA_SET_LOGO_CACHE_VERSION;
  language: "fr";
  source: typeof LORCANA_CATALOG_URL;
  fetchedAt: string;
  sets: LorcanaSetLogoRow[];
};

let memory: { file: string; index: LorcanaSetLogoIndex } | null = null;

export function lorcanaSetLogoCachePath(root?: string): string {
  return path.join(
    resolveDataBase(root),
    "lorcana",
    "staging",
    "set-logos.json",
  );
}

export function lorcanaSetLogosDir(root?: string): string {
  if (root) {
    return path.join(resolveDataBase(root), "lorcana", "products", "sets");
  }
  return path.join(packSealedProductsDir("lorcana"), "sets");
}

export function __resetLorcanaSetLogoIndexForTests(): void {
  memory = null;
}

export function __seedLorcanaSetLogoIndexForTests(
  index: LorcanaSetLogoIndex,
): void {
  memory = { file: ":test:", index };
}

function resolveDataBase(root?: string): string {
  if (root) return path.join(path.resolve(root), "data");
  return path.dirname(foilPackDataDir("lorcana"));
}

function isValidIndex(raw: unknown): raw is LorcanaSetLogoIndex {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as LorcanaSetLogoIndex;
  return (
    row.version === LORCANA_SET_LOGO_CACHE_VERSION && Array.isArray(row.sets)
  );
}

function readIndexFile(file: string): LorcanaSetLogoIndex | null {
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isValidIndex(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadLorcanaSetLogoIndex(
  file?: string,
): LorcanaSetLogoIndex | null {
  const dest = file ?? lorcanaSetLogoCachePath();
  if (memory && (memory.file === dest || memory.file === ":test:")) {
    return memory.index;
  }
  const index = readIndexFile(dest);
  if (index) memory = { file: dest, index };
  return index;
}

function extFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext === ".jpeg") return ".jpg";
    if (ext === ".png" || ext === ".jpg" || ext === ".webp") return ext;
  } catch {
    /* ignore */
  }
  return ".png";
}

export function lorcanaSetLogoAssetUrl(id: string, ext = ".png"): string {
  return assetsPackFileUrl(
    "lorcana",
    "products",
    "sets",
    id,
    `logo${ext.startsWith(".") ? ext : `.${ext}`}`,
  );
}

/**
 * Fold to alphanumeric words — same idea as LorcanaJSON search text, kept
 * local so this module does not import the JSON catalogue.
 */
export function normalizeLorcanaSetText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** `set12` / `quest1` / `gateway1` ids plus the forms shops actually print. */
export function lorcanaSetLogoCodes(
  row: Pick<LorcanaSetLogoRow, "id">,
): string[] {
  const id = row.id.trim().toLowerCase();
  const codes = new Set<string>([id]);
  const numbered = /^(set|quest|gateway)(\d+)$/.exec(id);
  if (numbered) {
    const kind = numbered[1]!;
    const n = numbered[2]!;
    // Bare `1` is the First Chapter — never a Quest / Gateway id.
    if (kind === "set") codes.add(n);
    if (kind === "quest") codes.add(`q${n}`);
  }
  return [...codes];
}

/**
 * Chapter / quest / gateway ids attested in a slug or title.
 * Bare numbers stay out — lorcards `241-204` is a collector ref, not set 241.
 */
export function lorcanaSetIdsInText(
  value: string | null | undefined,
): string[] {
  const text = normalizeLorcanaSetText(value ?? "");
  if (!text) return [];
  const ids = new Set<string>();
  for (const match of text.matchAll(/\bset\s*(\d+)\b/g)) {
    ids.add(`set${match[1]}`);
  }
  for (const match of text.matchAll(/\b(?:quest|quete)\s*(\d+)\b/g)) {
    ids.add(`quest${match[1]}`);
  }
  for (const match of text.matchAll(/\bgateway\s*(\d+)\b/g)) {
    ids.add(`gateway${match[1]}`);
  }
  for (const match of text.matchAll(/\bchapitre\s*(\d+)\b/g)) {
    ids.add(`set${match[1]}`);
  }
  for (const match of text.matchAll(/\bqu(\d+)\b/g)) {
    ids.add(`quest${match[1]}`);
  }
  for (const match of text.matchAll(/\bq\s*(\d+)\b/g)) {
    ids.add(`quest${match[1]}`);
  }
  return [...ids];
}

export function parseLorcanaSetLogosFromCatalog(
  raw: unknown,
): Omit<LorcanaSetLogoRow, "logo">[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { card_sets?: unknown }).card_sets;
  if (!Array.isArray(list)) return [];
  const byId = new Map<string, Omit<LorcanaSetLogoRow, "logo">>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim().toLowerCase() : "";
    const name =
      typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
    const sourceUrl =
      typeof row.thumbnail_image_url === "string"
        ? row.thumbnail_image_url.trim()
        : "";
    if (!SET_ID_RE.test(id) || !/^https:\/\//i.test(sourceUrl)) continue;
    if (!byId.has(id)) byId.set(id, { id, name, sourceUrl });
  }
  return [...byId.values()].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}

function lorcanaSetNameVariants(name: string): string[] {
  const n = normalizeLorcanaSetText(name);
  if (n.length < 4) return [];
  const stripped = n.replace(/^(l|le|la|les|the|un|une)\s+/, "");
  return stripped !== n && stripped.length >= 4 ? [n, stripped] : [n];
}

function uniqueSetNameTokens(index: LorcanaSetLogoIndex): Map<string, string> {
  const owners = new Map<string, Set<string>>();
  for (const row of index.sets) {
    for (const token of normalizeLorcanaSetText(row.name ?? "").split(" ")) {
      if (token.length < 6) continue;
      const ids = owners.get(token) ?? new Set<string>();
      ids.add(row.id);
      owners.set(token, ids);
    }
  }
  const unique = new Map<string, string>();
  for (const [token, ids] of owners) {
    if (ids.size === 1) unique.set(token, [...ids][0]!);
  }
  return unique;
}

/**
 * Unique match on official id, chapter number, quest `qN` / `QU2`, slug
 * `set-12`, a unique full set name (article optional), or a unique 6+ letter
 * word from the catalog name (`floodborn` on a ROTF booster). Several hits
 * or none → null.
 */
/**
 * L'extension du relevé de logos que ce produit désigne.
 *
 * La résolution était enfouie dans `lorcanaLogoUrlForSet`, qui n'en rendait que
 * l'URL du logo. Or elle établit une correspondance plus précieuse que l'image :
 * le code de la boutique (`ROTF`) vers l'extension du catalogue (`set2`). Sans
 * elle, un conseil d'achat ne peut rattacher aucun produit à un set — les
 * produits Lorcana portent des codes lettres, le catalogue des numéros, et les
 * deux ne se joignent pas.
 *
 * Rend `null` dès qu'il y a **plus d'une** correspondance : rattacher un
 * booster au mauvais set serait pire que de ne pas le rattacher.
 */
export function lorcanaSetRowForProduct(input: {
  setCode?: string | null;
  slug?: string | null;
  name?: string | null;
  index?: LorcanaSetLogoIndex | null;
}): LorcanaSetLogoRow | null {
  const index = input.index;
  if (!index?.sets.length) return null;

  const needles = new Set<string>();
  const setCode = input.setCode?.trim().toLowerCase();
  if (setCode) {
    needles.add(setCode);
    if (/^\d+$/.test(setCode)) needles.add(`set${setCode}`);
  }
  for (const id of lorcanaSetIdsInText(
    [input.setCode, input.slug, input.name].filter(Boolean).join(" "),
  )) {
    needles.add(id);
  }

  const idHits = index.sets.filter((row) =>
    lorcanaSetLogoCodes(row).some((code) => needles.has(code)),
  );
  if (idHits.length === 1) return idHits[0]!;
  if (idHits.length > 1) return null;

  const hay = normalizeLorcanaSetText(
    [input.slug, input.name].filter(Boolean).join(" "),
  );
  if (!hay) return null;
  const nameHits = index.sets.filter((row) =>
    lorcanaSetNameVariants(row.name ?? "").some(
      (label) => label.length >= 4 && hay.includes(label),
    ),
  );
  if (nameHits.length === 1) return nameHits[0]!;
  if (nameHits.length > 1) return null;

  const tokens = uniqueSetNameTokens(index);
  const tokenIds = new Set<string>();
  for (const word of hay.split(" ")) {
    const id = tokens.get(word);
    if (id) tokenIds.add(id);
  }
  if (tokenIds.size !== 1) return null;
  const id = [...tokenIds][0]!;
  return index.sets.find((row) => row.id === id) ?? null;
}

export function lorcanaLogoUrlForSet(input: {
  setCode?: string | null;
  slug?: string | null;
  name?: string | null;
  index?: LorcanaSetLogoIndex | null;
}): string | null {
  return lorcanaSetRowForProduct(input)?.logo ?? null;
}

/**
 * `set2` → `2` : l'identifiant que le **catalogue** emploie.
 *
 * Le relevé de logos numérote `setN`, le catalogue de tirages `N`. Une quête ou
 * un gateway n'a pas d'équivalent côté tirages et rend donc `null`.
 */
export function lorcanaCatalogueSetIdForProduct(input: {
  setCode?: string | null;
  slug?: string | null;
  name?: string | null;
  index?: LorcanaSetLogoIndex | null;
}): string | null {
  const id = lorcanaSetRowForProduct(input)?.id?.trim().toLowerCase();
  const numbered = id ? /^set(\d+)$/.exec(id) : null;
  return numbered ? numbered[1]! : null;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await httpGet<ArrayBuffer>(url, {
    headers: { "User-Agent": UA },
    timeout: 45_000,
    responseType: "arraybuffer",
  });
  return Buffer.from(res.data);
}

function writeIndexFile(file: string, index: LorcanaSetLogoIndex): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  memory = { file, index };
}

async function downloadSetLogo(
  row: Omit<LorcanaSetLogoRow, "logo">,
  logosDir: string,
  force: boolean,
): Promise<LorcanaSetLogoRow> {
  const ext = extFromUrl(row.sourceUrl);
  const dest = path.join(logosDir, row.id, `logo${ext}`);
  if (!force && existsSync(dest)) {
    return { ...row, logo: lorcanaSetLogoAssetUrl(row.id, ext) };
  }
  try {
    const buf = await fetchBytes(row.sourceUrl);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    return { ...row, logo: lorcanaSetLogoAssetUrl(row.id, ext) };
  } catch (err) {
    console.log(`  ATTENTION set logo ${row.id}: ${err}`);
    return {
      ...row,
      logo: existsSync(dest) ? lorcanaSetLogoAssetUrl(row.id, ext) : null,
    };
  }
}

export async function installLorcanaSetLogos(
  rows: readonly Omit<LorcanaSetLogoRow, "logo">[],
  opts: {
    force?: boolean;
    root?: string;
    dest?: string;
    logosDir?: string;
  } = {},
): Promise<LorcanaSetLogoIndex> {
  const dest = opts.dest ?? lorcanaSetLogoCachePath(opts.root);
  const logosDir = opts.logosDir ?? lorcanaSetLogosDir(opts.root);
  const sets: LorcanaSetLogoRow[] = [];
  for (const row of rows) {
    sets.push(await downloadSetLogo(row, logosDir, opts.force === true));
  }
  const index: LorcanaSetLogoIndex = {
    version: LORCANA_SET_LOGO_CACHE_VERSION,
    language: "fr",
    source: LORCANA_CATALOG_URL,
    fetchedAt: new Date().toISOString(),
    sets,
  };
  writeIndexFile(dest, index);
  return index;
}

export async function refreshLorcanaSetLogoIndex(opts?: {
  force?: boolean;
  root?: string;
  dest?: string;
  logosDir?: string;
  catalog?: unknown;
}): Promise<LorcanaSetLogoIndex> {
  const dest = opts?.dest ?? lorcanaSetLogoCachePath(opts?.root);
  if (!opts?.force && opts?.catalog === undefined) {
    const existing = loadLorcanaSetLogoIndex(dest);
    if (existing && existing.sets.some((row) => row.logo)) return existing;
  }
  const raw =
    opts?.catalog ??
    (JSON.parse(
      (await fetchBytes(LORCANA_CATALOG_URL)).toString("utf8"),
    ) as unknown);
  return installLorcanaSetLogos(parseLorcanaSetLogosFromCatalog(raw), opts);
}

/** Refresh for a Lorcana extract. Failure → keep the on-disk cache if any. */
export async function ensureLorcanaSetLogoIndex(opts?: {
  force?: boolean;
  root?: string;
  dest?: string;
  logosDir?: string;
  catalog?: unknown;
}): Promise<LorcanaSetLogoIndex | null> {
  try {
    return await refreshLorcanaSetLogoIndex(opts);
  } catch {
    return loadLorcanaSetLogoIndex(
      opts?.dest ?? lorcanaSetLogoCachePath(opts?.root),
    );
  }
}
