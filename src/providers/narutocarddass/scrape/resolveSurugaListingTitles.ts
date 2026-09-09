/**
 * Resolve pasted Suruga-ya product URLs into Carddass printed refs.
 *
 * Product pages are behind Cloudflare; FlareSolverr carries them. Only the
 * <title> is read — the listing body cross-sells other cards and would mint
 * false ids. Listings whose title matches no 忍/術/作/依 ref land in
 * `unresolved` (疾風伝, Data Carddass, goodies…) — never in the TSV.
 *
 * Run: pnpm tsx src/providers/narutocarddass/scrape/resolveSurugaListingTitles.ts <ids.txt>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { flareSolverrRequestGet } from "@/lib/http/flareSolverr";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../packs";
import {
  parseSurugaCarddassPrinted,
  surugaCarddassProductUrl,
} from "../parse/parseSurugaCarddass";

export type SurugaResolvedListing = {
  id: string;
  url: string;
  title: string | null;
  printed: string | null;
};

const TITLE_RE = /<title>([^<]+)<\/title>/;
const DATA_CARDDASS_RE = /データカードダス|\bDN-|\bNM-/i;

export async function resolveSurugaListingTitles(
  ids: readonly string[],
  opts: { root?: string; outFile?: string } = {},
): Promise<{ resolved: SurugaResolvedListing[]; file: string }> {
  const outFile =
    opts.outFile ??
    path.join(
      opts.root ?? dataRoot(),
      NARUTO_PACK_ID,
      "staging",
      "suruga-ya-carddass",
      "resolved-titles.json",
    );
  mkdirSync(path.dirname(outFile), { recursive: true });

  const resolved: SurugaResolvedListing[] = [];
  for (const id of ids) {
    const url = surugaCarddassProductUrl(id);
    const html = await flareSolverrRequestGet(url);
    const title = html ? (TITLE_RE.exec(html)?.[1] ?? null) : null;
    const printed =
      title && !DATA_CARDDASS_RE.test(title)
        ? parseSurugaCarddassPrinted(title)
        : null;
    resolved.push({ id, url, title, printed });
    // Checkpoint après chaque fiche : un arrêt ne perd rien.
    writeFileSync(outFile, `${JSON.stringify(resolved, null, 2)}\n`, "utf8");
    console.log(
      `${resolved.length}/${ids.length} ${id} -> ${printed ?? "∅"} ${title?.slice(0, 60) ?? "(403?)"}`,
    );
  }
  return { resolved, file: outFile };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx resolveSurugaListingTitles.ts <ids.txt>");
    process.exit(1);
  }
  const ids = [
    ...new Set(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => /([A-Z0-9]{8,})/i.exec(line.trim())?.[1])
        .filter((v): v is string => Boolean(v))
        .map((id) => id.toUpperCase()),
    ),
  ];
  console.log(`${ids.length} ids à résoudre`);
  resolveSurugaListingTitles(ids).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
