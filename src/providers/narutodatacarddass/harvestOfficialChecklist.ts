/**
 * Assemble la checklist Data Carddass depuis le staging officiel
 * (`data/naruto/data-carddass/staging/official/`).
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packStagingDir } from "@/lib/packPaths";

import {
  type DataCarddassChecklistCard,
} from "./buildFromLedgers";
import { NARUTO_DATA_CARDDASS_PACK_ID, narutoDataCarddassCuratedDir } from "./pack";
import {
  decodeOfficialCardlistBytes,
  normalizeOfficialPrinted,
  parseBattleCardCsv,
  parseCrossCardlistHtml,
  parseFormationCardlistHtml,
  parseMissionCardlistHtml,
  type OfficialDcdCard,
} from "./parse/parseOfficialCardlists";
import {
  isDataCarddassSetCode,
  parseDataCarddassPrinted,
} from "./printKey";
import { parseSurugaDataCarddassPrintedFromTitle } from "./parse/parseSurugaDataCarddass";

export type OfficialChecklistAssembly = {
  cards: DataCarddassChecklistCard[];
  byPrefix: Record<string, number>;
  sources: string[];
};

function officialRoot(root?: string): string {
  return path.join(
    root ?? packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "official",
  );
}

function readOfficialText(filePath: string): string {
  return decodeOfficialCardlistBytes(readFileSync(filePath));
}

function toChecklistCard(
  card: OfficialDcdCard,
  note?: string,
): DataCarddassChecklistCard | null {
  const parsed = parseDataCarddassPrinted(card.printed);
  if (!parsed || !isDataCarddassSetCode(parsed.set)) return null;
  const nameJa = card.nameJa.trim();
  // Wayback corruption (ex. NFP-004 → `?????`) — keep the slot with the printed ref.
  const safeName = !nameJa || /^\?+$/.test(nameJa) ? parsed.printed : nameJa;
  return {
    printed: parsed.printed,
    set: parsed.set,
    number: parsed.number,
    name: safeName,
    nameJa: safeName,
    note,
  };
}

function mergeCard(
  into: Map<string, DataCarddassChecklistCard>,
  card: DataCarddassChecklistCard,
): void {
  const prev = into.get(card.printed);
  if (!prev) {
    into.set(card.printed, card);
    return;
  }
  // Prefer Japanese name when previous was a Latin listing title.
  const prevJa = (prev.nameJa ?? prev.name).trim();
  const nextJa = (card.nameJa ?? card.name).trim();
  const prevLooksLatin = /^[\x00-\x7F]+$/.test(prevJa);
  const nextLooksJa = /[^\x00-\x7F]/.test(nextJa);
  if (prevLooksLatin && nextLooksJa) {
    into.set(card.printed, { ...prev, ...card, name: nextJa, nameJa: nextJa });
  }
}

export function assembleOfficialDataCarddassChecklist(opts?: {
  stagingRoot?: string;
  ebaySeed?: ReadonlyArray<{
    printed: string;
    name?: string;
    nameJa?: string | null;
    note?: string;
  }>;
}): OfficialChecklistAssembly {
  const root = officialRoot(opts?.stagingRoot);
  const byPrinted = new Map<string, DataCarddassChecklistCard>();
  const sources: string[] = [];

  const dnCsv = path.join(root, "dn", "battle_card.csv");
  if (existsSync(dnCsv)) {
    sources.push("dn/battle_card.csv");
    for (const row of parseBattleCardCsv(readOfficialText(dnCsv))) {
      const card = toChecklistCard(row, "carddass.com battle_card.csv");
      if (card) mergeCard(byPrinted, card);
    }
  }

  const nmDir = path.join(root, "nm");
  if (existsSync(nmDir)) {
    for (const name of readdirSync(nmDir).sort()) {
      if (!/\.(shtml|php|html)$/i.test(name)) continue;
      sources.push(`nm/${name}`);
      const html = readOfficialText(path.join(nmDir, name));
      for (const row of parseMissionCardlistHtml(html)) {
        const card = toChecklistCard(row, `carddass.com mission/${name}`);
        if (card) mergeCard(byPrinted, card);
      }
    }
  }

  const nfDir = path.join(root, "nf");
  if (existsSync(nfDir)) {
    for (const name of readdirSync(nfDir).sort()) {
      if (!/\.(php|html)$/i.test(name)) continue;
      sources.push(`nf/${name}`);
      const html = readOfficialText(path.join(nfDir, name));
      for (const row of parseFormationCardlistHtml(html)) {
        const card = toChecklistCard(row, `fudanin formation/${name}`);
        if (card) mergeCard(byPrinted, card);
      }
    }
  }

  const nxDir = path.join(root, "nx");
  if (existsSync(nxDir)) {
    for (const name of readdirSync(nxDir).sort()) {
      if (!/\.(php|html)$/i.test(name)) continue;
      sources.push(`nx/${name}`);
      const html = readOfficialText(path.join(nxDir, name));
      for (const row of parseCrossCardlistHtml(html)) {
        const card = toChecklistCard(row, `fudanin cross/${name}`);
        if (card) mergeCard(byPrinted, card);
      }
    }
  }

  const hinokunianPath = path.join(root, "hinokunian", "dn-dt.json");
  if (existsSync(hinokunianPath)) {
    sources.push("hinokunian/dn-dt.json");
    const payload = JSON.parse(readFileSync(hinokunianPath, "utf8")) as {
      cards?: Array<{ printed: string; nameJa: string }>;
    };
    for (const row of payload.cards ?? []) {
      const printed = normalizeOfficialPrinted(row.printed);
      if (!printed) continue;
      const card = toChecklistCard(
        { printed, nameJa: row.nameJa },
        "hinokunian cardbattle",
      );
      if (card) mergeCard(byPrinted, card);
    }
  }

  for (const seed of opts?.ebaySeed ?? []) {
    const printed = normalizeOfficialPrinted(seed.printed);
    if (!printed) continue;
    const nameJa = (seed.nameJa ?? seed.name ?? printed).trim();
    const card = toChecklistCard(
      { printed, nameJa },
      seed.note ?? "ebay seed",
    );
    if (card) mergeCard(byPrinted, card);
  }

  const surugaScanGl411Path = path.join(
    narutoDataCarddassCuratedDir(),
    "sources",
    "suruga-scan-gl411.json",
  );
  if (existsSync(surugaScanGl411Path)) {
    sources.push("suruga-scan-gl411.json");
    try {
      const scan = JSON.parse(readFileSync(surugaScanGl411Path, "utf8")) as Array<{
        id: string;
        h1: string;
        isNaruto: boolean;
        status: number;
      }>;
      for (const item of scan) {
        if (!item.isNaruto || item.status !== 200) continue;
        const printed = parseSurugaDataCarddassPrintedFromTitle(item.h1);
        if (!printed) continue;
        const parsed = parseDataCarddassPrinted(printed);
        if (!parsed) continue;
        const colonIdx = item.h1.lastIndexOf("：") !== -1 ? item.h1.lastIndexOf("：") : item.h1.lastIndexOf(":");
        const nameJa = colonIdx !== -1 ? item.h1.slice(colonIdx + 1).trim() : printed;
        const card: DataCarddassChecklistCard = {
          printed: parsed.printed,
          set: parsed.set,
          number: parsed.number,
          name: nameJa,
          nameJa,
          note: `suruga-ya ${item.id}`,
        };
        mergeCard(byPrinted, card);
      }
    } catch {
      /* ignore */
    }
  }

  const cards = [...byPrinted.values()].sort((a, b) =>
    a.printed.localeCompare(b.printed, "en"),
  );
  const byPrefix: Record<string, number> = {};
  for (const card of cards) {
    const pref = card.printed.split("-")[0] ?? "?";
    byPrefix[pref] = (byPrefix[pref] ?? 0) + 1;
  }
  return { cards, byPrefix, sources };
}

export function writeOfficialDataCarddassChecklist(opts?: {
  stagingRoot?: string;
  outPath?: string;
  ebaySeedPath?: string;
}): OfficialChecklistAssembly & { outPath: string } {
  let ebaySeed: OfficialChecklistAssembly["cards"] = [];
  const ebayPath =
    opts?.ebaySeedPath ??
    path.join(
      narutoDataCarddassCuratedDir(),
      "sources",
      "ebay.json",
    );
  if (existsSync(ebayPath)) {
    const ebay = JSON.parse(readFileSync(ebayPath, "utf8")) as {
      faces?: Array<{ printedRef: string; title?: string }>;
    };
    ebaySeed = (ebay.faces ?? [])
      .map((face): DataCarddassChecklistCard | null => {
        const printed = normalizeOfficialPrinted(face.printedRef);
        if (!printed) return null;
        const parsed = parseDataCarddassPrinted(printed);
        if (!parsed) return null;
        return {
          printed: parsed.printed,
          set: parsed.set,
          number: parsed.number,
          name: face.title ?? printed,
          nameJa: null,
          note: "ebay mikanshop seed",
        } satisfies DataCarddassChecklistCard;
      })
      .filter((row): row is DataCarddassChecklistCard => row != null);
  }

  const assembled = assembleOfficialDataCarddassChecklist({
    stagingRoot: opts?.stagingRoot,
    ebaySeed,
  });
  const outPath =
    opts?.outPath ??
    path.join(
      narutoDataCarddassCuratedDir(),
      "sources",
      "data-carddass-checklist.json",
    );
  const payload = {
    source:
      "carddass.com mission (miroir) + fudanin formation/cross (Wayback) + hinokunian DN/DT + ebay seed",
    observed: new Date().toISOString().slice(0, 10),
    url: "http://www.carddass.com/naruto/mission/cardlist/battle_card.shtml",
    line: "data-carddass",
    note:
      "Catalogue officiel assemblé 2026-09-09. NX hors chapitre 1 encore partiel (Wayback popups). SKU scellés retail non attestés.",
    cabinets: [
      { code: "dn", titleJa: "ナルティメットカードバトル", prefix: "DN" },
      { code: "dt", titleJa: "ナルティメットカードバトル（第4弾）", prefix: "DT" },
      { code: "nm", titleJa: "ナルティメットミッション", prefix: "NM" },
      { code: "nc", titleJa: "疾風クリアカード", prefix: "NC" },
      { code: "nf", titleJa: "ナルティメットフォーメーション", prefix: "NF" },
      { code: "nfc", titleJa: "疾風クリアカード2", prefix: "NFC" },
      { code: "nff", titleJa: "フォーメーションファイル", prefix: "NFF" },
      { code: "nx", titleJa: "ナルティメットクロス", prefix: "NX" },
      { code: "nxp", titleJa: "クロスプロモ", prefix: "NXP" },
      { code: "nxpf", titleJa: "クロス特別", prefix: "NXPF" },
      { code: "nxmac", titleJa: "クロスマクドナルドプロモ", prefix: "NX-MAC" },
      { code: "nxcam", titleJa: "クロスデザインレア", prefix: "NX-CAM" },
      { code: "nxsp", titleJa: "クロスSP", prefix: "NX-SP" },
      { code: "nxpsp", titleJa: "クロスプロモSP", prefix: "NXP-SP" },
      { code: "can", titleJa: "CANプロモ", prefix: "CAN" },
      { code: "nfm", titleJa: "フォーメーション特別", prefix: "NFM" },
      { code: "nfp", titleJa: "フォーメーションプロモ", prefix: "NFP" },
      { code: "dnp", titleJa: "DNプロモ", prefix: "DNP" },
      { code: "dmp", titleJa: "ミッションプロモ", prefix: "DMP" },
    ],
    byPrefix: assembled.byPrefix,
    sources: assembled.sources,
    cards: assembled.cards,
    not: [
      "carddass",
      "en-ccg",
      "ni",
      "te",
      "ta",
      "n",
      "j",
      "m",
      "ultimate-ninja-mission-physical",
    ],
  };
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { ...assembled, outPath };
}
