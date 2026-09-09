/**
 * Official JP Carddass CG checklists — `cardlist/1st.shtml`…`17th.shtml`.
 * Source of truth: `curated/sources/carddas-jp-cardlist.json` (parsed from
 * the Wayback mirror). 忍/術/作/依 = NI/TE/TA/CL. Not Data Carddass.
 */
import ledger from "../curated/sources/carddas-jp-cardlist.json";
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";

export type CarddasJpCardlistRow = (typeof ledger.cards)[number];

const PREFIX: Record<string, string> = {
  忍: "ni",
  術: "te",
  作: "ta",
  依: "cl",
};

const VOLUME_SET: Record<string, string> = {
  巻ノ壱: "maki1",
  巻ノ弐: "maki2",
  巻ノ二: "maki2",
  巻ノ参: "maki3",
  巻ノ三: "maki3",
  巻ノ四: "maki4",
  巻の四: "maki4",
  巻ノ五: "maki5",
  巻ノ六: "maki6",
  巻ノ七: "maki7",
  巻ノ八: "maki8",
  巻ノ九: "maki9",
  巻ノ十: "maki10",
  巻ノ十一: "maki11",
  巻ノ十二: "maki12",
  巻ノ十三: "maki13",
  巻ノ十四: "maki14",
  巻ノ十五: "maki15",
  巻ノ十六: "maki16",
  巻ノ十七: "maki17",
};

const ROW_RE =
  />(忍|術|作|依)[-−]?(\d+)<\/td>\s*<td[^>]*>[\s\S]*?<font color="[^"]+">([^<]+)<\/font>[\s\S]*?<\/td>\s*<td[^>]*>([^<]+)<\/td>/g;

export function carddasJpCardlistLedger() {
  return ledger;
}

export function carddasJpCardlistCards(): CarddasJpCardlistRow[] {
  return ledger.cards;
}

export function carddasJpVolumeSetCode(volume: string): string | null {
  const key = volume.replace(/\s+/g, "");
  return VOLUME_SET[key] ?? null;
}

/** Decode already-as-text HTML (tests use UTF-8; live files are Shift_JIS). */
export function parseCarddasJpCardlistHtml(
  html: string,
  fallbackSet: string,
): Array<{
  printed: string;
  number: string;
  name: string;
  setCode: string;
  volume: string;
}> {
  const out: Array<{
    printed: string;
    number: string;
    name: string;
    setCode: string;
    volume: string;
  }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(ROW_RE)) {
    const prefix = PREFIX[match[1]!];
    if (!prefix) continue;
    const n = Number.parseInt(match[2]!, 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const number = `${prefix}${String(n).padStart(4, "0")}`;
    if (seen.has(number)) continue;
    const volume = match[4]!.replace(/\s+/g, "");
    const setCode = carddasJpVolumeSetCode(volume) ?? fallbackSet;
    seen.add(number);
    out.push({
      printed: `${match[1]}-${n}`,
      number,
      name: match[3]!.trim(),
      setCode,
      volume,
    });
  }
  return out;
}

export function mergeCarddasJpNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of carddasJpCardlistCards()) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0ja`;
    if (titleKeys.has(titleKey)) continue;
    const name = row.name.trim();
    if (!name) continue;
    titles.push({ printKey, lang: "ja", fullName: name });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}
