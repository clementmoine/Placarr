/**
 * Map CICABOOM gallery API rows → Placarr Mythos print identity.
 *
 * API: `https://cards.narutotcgmythos.com/api/cards?lang={fr|en|…}`
 * → `[{ Title, Cards: OfficialMythosApiCard[] }]`.
 */
export type OfficialMythosApiCard = {
  ID?: string;
  Uid?: number;
  SKU?: string;
  CardVersion?: string;
  Langs?: string[];
  Rarity?: string;
  CardType?: string;
  Illustration?: string;
  Stamp?: string;
  Edition?: string;
  Set?: string;
  Variant?: string;
  Title?: string;
  Version?: string;
  Chakra?: number;
  Power?: number;
  Text?: string;
  Obtain?: string;
  Image?: string;
  Order?: number;
};

export type MythosOfficialPrint = {
  sku: string;
  uid: number | null;
  setCode: string;
  number: string;
  grouping: string | null;
  printed: string;
  name: string;
  rarity: string | null;
  faceUrl: string | null;
  edition: string;
  setLabel: string;
  order: number | null;
};

/** Konoha Shidō 2e édition — distinct de `ks1` (1re). */
export const NARUTO_MYTHOS_KS1E2_SET_CODE = "ks1e2";
/** Promos / Mythos hors édition (`NM-S1E0-*`). */
export const NARUTO_MYTHOS_KS1PROMO_SET_CODE = "ks1promo";

export function parseOfficialMythosApiPayload(
  raw: unknown,
): OfficialMythosApiCard[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const first = raw[0] as { Cards?: unknown };
  if (!Array.isArray(first?.Cards)) return [];
  return first.Cards as OfficialMythosApiCard[];
}

function setCodeForCard(card: OfficialMythosApiCard): string {
  const sku = String(card.SKU ?? "");
  const edition = String(card.Edition ?? "");
  const set = String(card.Set ?? "");
  if (sku.includes("S1E2") || /2nd/i.test(edition)) {
    return NARUTO_MYTHOS_KS1E2_SET_CODE;
  }
  if (sku.includes("S1E0") || (set.includes("Konoha") && !edition.trim())) {
    return NARUTO_MYTHOS_KS1PROMO_SET_CODE;
  }
  if (
    sku.includes("S2E1") ||
    set.includes("Shinobi") ||
    /^M\d+$/i.test(sku)
  ) {
    return "ss2";
  }
  return "ks1";
}

function numberAndPrinted(card: OfficialMythosApiCard): {
  number: string;
  printed: string;
} {
  const sku = String(card.SKU ?? "");
  const mythosSku = /^M(\d+)$/i.exec(sku);
  if (mythosSku) {
    const n = mythosSku[1]!;
    return { number: `m${n}`, printed: `M${n}` };
  }
  const id = String(card.ID ?? "").trim();
  const mss =
    /^MSS\s*0*(\d+)(?:\s*\/\s*\d+)?$/i.exec(id) ??
    /^MSS\s*0*(\d+)$/i.exec(id);
  if (mss) {
    const n = mss[1]!.padStart(2, "0");
    return { number: `mss${n}`, printed: `MSS${n}` };
  }
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(id);
  if (frac) {
    const num = frac[1]!.padStart(4, "0");
    const den = frac[2]!;
    return {
      number: num,
      printed: `${frac[1]!.padStart(3, "0")}/${den}`,
    };
  }
  const fallback = id
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9.]+/g, "")
    .replace(/^-+|-+$/g, "");
  return { number: fallback || "unknown", printed: id || fallback || "unknown" };
}

/**
 * Parallel / finish / version → grouping slug.
 * Collector number alone is not unique (L / S / RA / CHIBI share IDs).
 */
export function officialMythosGrouping(
  card: OfficialMythosApiCard,
): string | null {
  const sku = String(card.SKU ?? "");
  if (/^M\d+$/i.test(sku)) return null;

  const rarity = String(card.Rarity ?? "").trim();
  const parts: string[] = [];
  if (rarity === "RA") parts.push("a");
  else if (rarity === "SV") parts.push("sv");
  else if (rarity === "L") parts.push("l");
  else if (rarity === "S") parts.push("s");
  else if (rarity === "M" || rarity === "Mythos") parts.push("v");
  else if (rarity === "CHIBI") parts.push("chibi");
  else if (rarity === "POP") parts.push("pop");
  else if (rarity === "Shinobi") parts.push("shinobi");
  else if (rarity === "SP") parts.push("sp");

  const variant = String(card.Variant ?? "").trim().toLowerCase();
  if (variant === "holo") parts.push("h");
  if (variant === "gold") parts.push("gold");

  const ver = /V(\d+)/i.exec(String(card.CardVersion ?? ""));
  const vNum = ver ? Number.parseInt(ver[1]!, 10) : 1;
  if (vNum > 1) parts.push(`v${vNum}`);

  const stamp = /V\d+-([A-Za-z0-9]+)$/i.exec(sku);
  if (stamp) parts.push(stamp[1]!.toLowerCase());

  // printKey forbids `-` inside a segment — flatten (`l`+`gold` → `lgold`).
  return parts.length ? parts.join("") : null;
}

function displayName(card: OfficialMythosApiCard): string {
  const title = String(card.Title ?? "").trim();
  const version = String(card.Version ?? "").trim();
  if (title && version) return `${title} — ${version}`;
  if (title || version) return title || version;
  return "";
}

function isPlaceholderName(name: string, sku: string): boolean {
  const n = name.trim();
  if (!n) return true;
  return n.toLowerCase() === sku.trim().toLowerCase();
}

export function mapOfficialMythosCard(
  card: OfficialMythosApiCard,
): MythosOfficialPrint | null {
  const sku = String(card.SKU ?? "").trim();
  if (!sku && card.Uid == null) return null;
  const setCode = setCodeForCard(card);
  const { number, printed } = numberAndPrinted(card);
  if (!number || number === "unknown") return null;
  const grouping = officialMythosGrouping(card);
  const faceUrl = String(card.Image ?? "").trim() || null;
  const name =
    displayName(card) || sku || String(card.ID ?? "").trim() || "Unknown";
  return {
    sku: sku || `uid-${card.Uid}`,
    uid: typeof card.Uid === "number" ? card.Uid : null,
    setCode,
    number,
    grouping,
    printed,
    name,
    rarity: String(card.Rarity ?? "").trim() || null,
    faceUrl,
    edition: String(card.Edition ?? "").trim(),
    setLabel: String(card.Set ?? "").trim(),
    order: typeof card.Order === "number" ? card.Order : null,
  };
}

/** Prefer FR name/image; fill holes from EN (and other langs). */
export function mergeOfficialMythosLangRows(
  byLang: Readonly<Record<string, readonly OfficialMythosApiCard[]>>,
  preferLang: string = "fr",
): MythosOfficialPrint[] {
  const prefer = preferLang.trim().toLowerCase() || "fr";
  const order = [
    prefer,
    ...Object.keys(byLang).filter((l) => l !== prefer),
  ];
  const byKey = new Map<string, MythosOfficialPrint>();

  for (const lang of order) {
    for (const raw of byLang[lang] ?? []) {
      const mapped = mapOfficialMythosCard(raw);
      if (!mapped) continue;
      const key = `${mapped.setCode}:${mapped.number}:${mapped.grouping ?? ""}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, mapped);
        continue;
      }
      if (
        isPlaceholderName(prev.name, prev.sku) &&
        !isPlaceholderName(mapped.name, mapped.sku)
      ) {
        prev.name = mapped.name;
      }
      if (!prev.faceUrl && mapped.faceUrl) prev.faceUrl = mapped.faceUrl;
      if (!prev.rarity && mapped.rarity) prev.rarity = mapped.rarity;
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const ao = a.order ?? 1e9;
    const bo = b.order ?? 1e9;
    if (ao !== bo) return ao - bo;
    return a.sku.localeCompare(b.sku);
  });
}
