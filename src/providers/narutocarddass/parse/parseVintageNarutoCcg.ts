/**
 * Vintage Naruto browse bundle: Bandai USA CCG faces hosted at
 * api.ccgtrader.co.uk. Display numbers are 1/122 — collector ids come from
 * our checklists (narutocards.ca / Goat / Bandai lists).
 */
import ledger from "../curated/sources/vintage-naruto-ccg.json";
import { narutoDiskCardId } from "../collectorIdentity";

export const VINTAGE_NARUTO_BROWSE_URL = ledger.urls.browse;
export const VINTAGE_NARUTO_ASSET_ORIGIN = "https://api.ccgtrader.co.uk";
export const VINTAGE_NARUTO_CCG_LANG = "en";

const SKIP = new Set(ledger.skip);

/** Vintage slug → our setCode. Shinobi's Dream is omitted on purpose. */
export const VINTAGE_NARUTO_SET_SLUGS: Readonly<Record<string, string>> = {
  "the-path-to-hokage": "s1",
  "coils-of-the-snake": "s2",
  "curse-of-the-sand": "s3",
  "revenge-and-rebirth": "s4",
  "dream-legacy": "s5",
  "eternal-rivalry": "s6",
  "quest-for-power": "s7",
  "battle-of-destiny": "s8",
  "the-chosen": "s9",
  "lineage-of-the-legends": "s10",
  "approaching-wind": "s11",
  "a-new-chronicle": "s12",
  "fateful-reunion": "s13",
  "emerging-alliance": "s14",
  "foretold-prophecy": "s15",
  "broken-promises": "s16",
  "will-of-fire": "s17",
  "fangs-of-the-snake": "s18",
  "path-of-pain": "s19",
  "tales-of-the-gallant-sage": "s20",
  "shattered-truths": "s21",
  "weapons-of-war": "s22",
  invasion: "s23",
  "sages-legacy": "s24",
  "kages-summit": "s25",
  "avengers-wrath": "s26",
  "heros-ascension": "s27",
  "ultimate-ninja-storm-3": "s28",
  "tournament-pack-1": "tp1",
  "tournament-pack-2": "tp2",
  "tournament-pack-3": "tp3",
  "tournament-pack-4": "tp4",
  "fierce-ambitions": "tin1",
  untouchables: "tin2",
  "ultimate-battle": "tin3",
  rebirth: "tin4",
  "naruto-ccg-promos": "promo",
};

export type VintageNarutoTitleHint = {
  number: string;
  setCode: string;
  name: string;
};

export type VintageNarutoCcgCard = {
  vintageId: string;
  setCode: string;
  slug: string;
  name: string;
  rarity: string;
  displayNumber: string;
  assetId: string;
  faceUrl: string;
  number: string | null;
};

const CARD_RE =
  /\{"id":"(ccg-\d+)","displayNumber":"([^"]+)","name":"([^"]+)","rarity":"([^"]+)","thumbnail":"[^"]+","image":"(https:\/\/api\.ccgtrader\.co\.uk\/_\/assets\/[^"?]+)/g;

export function vintageNarutoCcgFaceUrl(assetIdOrUrl: string): string {
  const id = /\/assets\/([a-z0-9]+)/i.exec(assetIdOrUrl)?.[1] ?? assetIdOrUrl;
  return `${VINTAGE_NARUTO_ASSET_ORIGIN}/_/assets/${id}`;
}

export function normalizeVintageNarutoName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&(#x27|#39|apos);/gi, "'")
    .replace(/&amp;/gi, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(super rare|ultra rare|rare|uncommon|common|fixed|promo|foil|version \d+)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function sliceSeriesCards(js: string, slug: string): string | null {
  const needle = `"id":"ccg-${slug}"`;
  const start = js.indexOf(needle);
  if (start < 0) return null;
  const cardsAt = js.indexOf('"cards":[', start);
  if (cardsAt < 0 || cardsAt - start > 8_000) return null;
  let i = cardsAt + '"cards":['.length;
  let depth = 1;
  while (i < js.length && depth > 0) {
    const ch = js[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;
    i += 1;
  }
  return js.slice(cardsAt + '"cards":['.length, i - 1);
}

export function parseVintageNarutoCcgBundle(
  js: string,
): VintageNarutoCcgCard[] {
  const out: VintageNarutoCcgCard[] = [];
  for (const [slug, setCode] of Object.entries(VINTAGE_NARUTO_SET_SLUGS)) {
    if (SKIP.has(slug)) continue;
    const chunk = sliceSeriesCards(js, slug);
    if (!chunk) continue;
    for (const card of chunk.matchAll(CARD_RE)) {
      const image = card[5]!;
      const assetId = /\/assets\/([a-z0-9]+)/i.exec(image)?.[1];
      if (!assetId) continue;
      out.push({
        vintageId: card[1]!,
        setCode,
        slug,
        name: card[3]!,
        rarity: card[4]!,
        displayNumber: card[2]!,
        assetId,
        faceUrl: vintageNarutoCcgFaceUrl(assetId),
        number: null,
      });
    }
  }
  return out;
}

export function buildVintageNarutoTitleIndex(
  hints: readonly VintageNarutoTitleHint[],
): {
  bySetName: Map<string, string>;
  uniqueName: Map<string, string>;
} {
  const bySetName = new Map<string, string>();
  const all = new Map<string, Set<string>>();
  for (const hint of hints) {
    const diskId = narutoDiskCardId(hint.number) ?? hint.number.toLowerCase();
    const key = `${hint.setCode}\0${normalizeVintageNarutoName(hint.name)}`;
    if (!bySetName.has(key)) bySetName.set(key, diskId);
    const n = normalizeVintageNarutoName(hint.name);
    const bucket = all.get(n) ?? new Set<string>();
    bucket.add(diskId);
    all.set(n, bucket);
  }
  const uniqueName = new Map<string, string>();
  for (const [name, ids] of all) {
    if (ids.size === 1) uniqueName.set(name, [...ids][0]!);
  }
  return { bySetName, uniqueName };
}

export function resolveVintageNarutoDiskId(
  card: Pick<VintageNarutoCcgCard, "name" | "setCode">,
  index: ReturnType<typeof buildVintageNarutoTitleIndex>,
): string | null {
  const n = normalizeVintageNarutoName(card.name);
  return (
    index.bySetName.get(`${card.setCode}\0${n}`) ??
    index.uniqueName.get(n) ??
    null
  );
}

export function assignVintageNarutoDiskIds(
  cards: readonly VintageNarutoCcgCard[],
  hints: readonly VintageNarutoTitleHint[],
): VintageNarutoCcgCard[] {
  const index = buildVintageNarutoTitleIndex(hints);
  return cards.map((card) => ({
    ...card,
    number: resolveVintageNarutoDiskId(card, index),
  }));
}
