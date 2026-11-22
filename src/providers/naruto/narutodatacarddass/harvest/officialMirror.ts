/**
 * Miroir des checklists officielles Data Carddass → `staging/official/`.
 *
 * Les pages d'époque (carddass.com « mission » pour DN / NM, fudanin.com pour
 * Formation NF et Cross NX) ne sont plus en ligne ; la Wayback Machine les
 * archive. La Sync récupère la dernière capture 200 de chacune puis
 * `assembleOfficialDataCarddassChecklist` les lit — la checklist (1 482 fiches)
 * se reconstruit donc depuis la source, plus depuis un miroir fait à la main.
 *
 * Une page déjà dans le staging est gardée (relecture gratuite) ; une page
 * jamais archivée reste absente (résultat honnête, pas de devinette).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";
import { fetchCdxRows, pickLatestCdxRow } from "@/providers/shared/wayback/cdx";
import { waybackRawUrl } from "@/providers/shared/wayback/waybackRawUrl";

import { NARUTO_DATA_CARDDASS_PACK_ID } from "../pack";

export type OfficialMirrorPage = {
  /** Path under `staging/official/` read by the checklist assembly. */
  file: string;
  /** Original (pre-archive) URL. */
  url: string;
};

const MISSION = "http://www.carddass.com/naruto/mission/cardlist";
const FORMATION = "http://www.fudanin.com/formation/cardlist";
const CROSS = "http://fudanin.com/x/cardlist/";

/** Formation page on fudanin → historical staging name. */
const FORMATION_PAGES: ReadonlyArray<[string, string]> = [
  ["1st.php", "nf1.php"],
  ["2nd.php", "nf2.php"],
  ["3rd.php", "nf3.php"],
  ["4th.php", "nf4.php"],
  ["5th.php", "nf5.php"],
  ["6th.php", "nf6.php"],
  ["7th.php", "nf7.php"],
  ["4msheet.php", "nf_4msheet.php"],
  ["advance.php", "nf_adv.php"],
  ["clear_02.php", "nf_clear.php"],
  ["pocketfile.php", "nf_pocket.php"],
  ["prom.php", "nf_prom.php"],
];

/** Cross card categories (`?category=`) seen on fudanin.com/x. */
const CROSS_CATEGORIES = [
  "10248",
  "10249",
  "10256",
  "10264",
  "10267",
  "10281",
  "69001",
  "69002",
  "69003",
  "69004",
  "69005",
  "69006",
  "69007",
  "69010",
  "69011",
  "69901",
] as const;

export const DATA_CARDDASS_OFFICIAL_PAGES: readonly OfficialMirrorPage[] = [
  { file: "dn/battle_card.shtml", url: `${MISSION}/battle_card.shtml` },
  ...[
    "cardlist.shtml",
    "cardlist2.shtml",
    "cardlist3.shtml",
    "cardlist4.php",
    "cardlist_cc.php",
    "promocard.shtml",
    "tokunin.php",
  ].map((name) => ({ file: `nm/${name}`, url: `${MISSION}/${name}` })),
  ...FORMATION_PAGES.map(([remote, local]) => ({
    file: `nf/${local}`,
    url: `${FORMATION}/${remote}`,
  })),
  ...CROSS_CATEGORIES.flatMap((category) => [
    {
      file: `nx/cat${category}.html`,
      url: `${CROSS}?search=true&category=${category}`,
    },
    // Second page (30 cards per page).
    {
      file: `nx/cat${category}p30.html`,
      url: `${CROSS}?page=30&search=true&category=${category}`,
    },
  ]),
];

/** Newest Wayback capture with HTTP 200 for an exact URL, or null. */
async function latestWaybackCapture(url: string): Promise<string | null> {
  const cdx =
    "https://web.archive.org/cdx/search/cdx?output=json" +
    "&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200" +
    `&url=${encodeURIComponent(url)}`;
  const rows = await fetchCdxRows(cdx, url, { log: () => {} });
  return (
    pickLatestCdxRow(rows.map((row) => [row.timestamp, row.original]))
      ?.timestamp ?? null
  );
}

async function fetchWaybackCapture(
  timestamp: string,
  url: string,
): Promise<Buffer | null> {
  const res = await httpGet<ArrayBuffer>(waybackRawUrl(timestamp, url), {
    responseType: "arraybuffer",
    timeout: 60_000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data) return null;
  const bytes = Buffer.from(res.data);
  return bytes.length > 0 ? bytes : null;
}

export async function harvestDataCarddassOfficialMirror(opts?: {
  stagingRoot?: string;
  pages?: readonly OfficialMirrorPage[];
  force?: boolean;
  latestCapture?: (url: string) => Promise<string | null>;
  fetchCapture?: (timestamp: string, url: string) => Promise<Buffer | null>;
  log?: (line: string) => void;
}): Promise<{ fetched: number; kept: number; missing: string[] }> {
  const root = path.join(
    opts?.stagingRoot ?? packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "official",
  );
  const latestCapture = opts?.latestCapture ?? latestWaybackCapture;
  const fetchCapture = opts?.fetchCapture ?? fetchWaybackCapture;
  const log = opts?.log ?? (() => {});
  let fetched = 0;
  let kept = 0;
  const missing: string[] = [];

  for (const page of opts?.pages ?? DATA_CARDDASS_OFFICIAL_PAGES) {
    const dest = path.join(root, page.file);
    if (!opts?.force && existsSync(dest)) {
      kept += 1;
      continue;
    }
    const timestamp = await latestCapture(page.url);
    const bytes = timestamp ? await fetchCapture(timestamp, page.url) : null;
    if (!bytes) {
      missing.push(page.file);
      continue;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
    fetched += 1;
    log(`   official ${page.file} ← Wayback ${timestamp}`);
  }
  return { fetched, kept, missing };
}
