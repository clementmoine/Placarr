/**
 * Harvest / install Mythos S1 faces from Narutopia checklist.
 *
 * @see https://narutopia.fr/liste-des-cartes-naruto-mythos-serie-1/
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { parseNarutopiaChecklistHtml } from "@/providers/shared/narutopia/parseChecklistPage";

import { mapNarutopiaMythosHeading } from "./narutopiaMap";
import {
  NARUTO_MYTHOS_KS1E2_SET_CODE,
  NARUTO_MYTHOS_KS1PROMO_SET_CODE,
} from "./parseOfficialCards";
import { narutoMythosCuratedDir, NARUTO_MYTHOS_PACK_ID } from "./pack";
import { mythosPrintKey } from "./printKey";

export const NARUTOPIA_MYTHOS_S1_URL =
  "https://narutopia.fr/liste-des-cartes-naruto-mythos-serie-1/";

const LEDGER = "narutopia-mythos-s1.json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type NarutopiaMythosLedgerCard = {
  heading: string;
  code: string;
  faceUrl: string | null;
  setCode: string;
  number: string;
  grouping: string | null;
  printKey: string;
  rarity: string | null;
};

export function mythosNarutopiaLedgerPath(): string {
  return path.join(narutoMythosCuratedDir(), "sources", LEDGER);
}

export async function harvestMythosNarutopia(opts: {
  url?: string;
} = {}): Promise<{ cards: number; path: string }> {
  const url = opts.url ?? NARUTOPIA_MYTHOS_S1_URL;
  const res = await httpGet<string>(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    timeout: 90_000,
  });
  const entries = parseNarutopiaChecklistHtml(String(res.data));
  const cards: NarutopiaMythosLedgerCard[] = [];
  for (const entry of entries) {
    const code = entry.code?.trim();
    if (!code) continue;
    const mapped = mapNarutopiaMythosHeading(code);
    if (!mapped) continue;
    cards.push({
      heading: entry.heading,
      code,
      faceUrl: entry.faceUrl,
      setCode: mapped.setCode,
      number: mapped.number,
      grouping: mapped.grouping,
      printKey: mapped.printKey,
      rarity: mapped.rarity,
    });
  }
  const out = mythosNarutopiaLedgerPath();
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        source: url,
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        count: cards.length,
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { cards: cards.length, path: out };
}

function loadLedger(): NarutopiaMythosLedgerCard[] {
  const p = mythosNarutopiaLedgerPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    cards?: NarutopiaMythosLedgerCard[];
  };
  return raw.cards ?? [];
}

function resolveAgainstIndex(
  card: NarutopiaMythosLedgerCard,
  index: LocalPrintsIndex,
): NarutopiaMythosLedgerCard | null {
  const candidates: Array<{
    setCode: string;
    number: string;
    grouping: string | null;
  }> = [
    {
      setCode: card.setCode,
      number: card.number,
      grouping: card.grouping,
    },
  ];
  if (card.grouping === "v" || card.grouping === "sv") {
    for (const setCode of [
      NARUTO_MYTHOS_KS1PROMO_SET_CODE,
      NARUTO_MYTHOS_KS1E2_SET_CODE,
      card.setCode,
    ]) {
      candidates.push({
        setCode,
        number: card.number,
        grouping: card.grouping,
      });
    }
  }
  for (const c of candidates) {
    const printKey = mythosPrintKey(c.setCode, c.number, c.grouping);
    if (printKey && index.lookupRow(printKey)) {
      return { ...card, ...c, printKey };
    }
  }
  return null;
}

/** Install Narutopia faces onto existing Mythos printKeys only. */
export async function installMythosNarutopiaFaces(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean; force?: boolean } = {},
): Promise<{ faces: number; matched: number; skipped: number }> {
  const cards = loadLedger();
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let matched = 0;
  let skipped = 0;

  for (const card of cards) {
    const resolved = resolveAgainstIndex(card, index);
    if (!resolved) {
      skipped += 1;
      continue;
    }
    matched += 1;
    if (opts.downloadFaces === false || !resolved.faceUrl) continue;

    const destDir = packCardDir(NARUTO_MYTHOS_PACK_ID, {
      set: resolved.setCode,
      lang: "fr",
      card: resolved.grouping
        ? `${resolved.number}-${resolved.grouping}`
        : resolved.number,
    });
    const artName = "art.narutopia.webp";
    const installed = await installCardFace({
      destDir,
      artName,
      url: resolved.faceUrl,
      force: opts.force,
      webpQuality: 88,
      referer: NARUTOPIA_MYTHOS_S1_URL,
    });
    if (!installed) continue;
    if (installed.downloaded) faces += 1;
    assets.push({
      printKey: resolved.printKey,
      lang: "fr",
      art: installed.art,
      sourceUrl: resolved.faceUrl,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { faces, matched, skipped };
}
