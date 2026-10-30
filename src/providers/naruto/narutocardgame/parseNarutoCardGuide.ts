/**
 * Parse HTML narutocardguide.com/cards-list/ — tuiles `data-card-item`.
 *
 * Identité alignée sur narutomarket / narutotcgcards (`demo` / `promo` /
 * `premium00`) pour fusionner les faces. Les SAMPLE sans n° collector
 * (starter / first set) restent observés sous set `n01`.
 */
export type NarutoCardGuideCard = {
  id: string;
  name: string;
  set: string;
  facePath: string;
};

export type NarutoCardGuideIdentity = {
  setCode: string;
  number: string;
  grouping?: string | null;
};

const ORIGIN = "https://narutocardguide.com";

export function absoluteNarutoCardGuideUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (!t) return ORIGIN;
  if (/^https?:\/\//i.test(t)) return t;
  return `${ORIGIN}${t.startsWith("/") ? t : `/${t}`}`;
}

export function narutoCardGuideListingUrl(): string {
  return `${ORIGIN}/cards-list/`;
}

function decodeAttr(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function attr(block: string, name: string): string {
  const m = block.match(new RegExp(`data-${name}="([^"]*)"`, "i"));
  return m ? decodeAttr(m[1] ?? "") : "";
}

/** Prefers full-size `/Cards/…/*.webp` from `data-image-src` then `<img src>`. */
export function pickNarutoCardGuideFacePath(tileHtml: string): string | null {
  const preview = tileHtml.match(
    /data-image-src="(\/Cards\/[^"]+\.webp)"/i,
  )?.[1];
  if (preview) return preview;
  const img = tileHtml.match(/src="(\/Cards\/[^"]+\.webp)"/i)?.[1];
  return img ?? null;
}

export function parseNarutoCardGuideListing(
  html: string,
): NarutoCardGuideCard[] {
  const out: NarutoCardGuideCard[] = [];
  const seen = new Set<string>();
  const re =
    /<article\b[^>]*\bdata-card-item\b[^>]*>[\s\S]*?<\/article>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tile = m[0] ?? "";
    const id = attr(tile, "id").toLowerCase();
    if (!id || seen.has(id)) continue;
    const facePath = pickNarutoCardGuideFacePath(tile);
    if (!facePath) continue;
    seen.add(id);
    out.push({
      id,
      name: attr(tile, "name") || id,
      set: attr(tile, "set"),
      facePath,
    });
  }
  return out;
}

function normalizePrintedRef(raw: string): string | null {
  const m = raw.trim().toUpperCase().match(/^([A-Z]{1,3})-?(\d{1,4})$/);
  if (!m) return null;
  return `${m[1]!.toLowerCase()}${m[2]!.padStart(3, "0")}`;
}

/**
 * `n01-001` → demo/n001 (même corpus Gen Con que narutomarket).
 * `pcc0-c-002` → premium00/c002.
 * `sample-19` → n01/sample19 (révélation sans collector).
 * `cp-001` → promo/cp001/event (une seule face guide, sans édition).
 */
export function narutoCardGuideIdentity(
  card: Pick<NarutoCardGuideCard, "id" | "set">,
): NarutoCardGuideIdentity | null {
  const id = card.id.trim().toLowerCase();
  if (!id) return null;

  const pcc0 = id.match(/^pcc0-([cs])-(\d{1,4})$/);
  if (pcc0) {
    const number = normalizePrintedRef(`${pcc0[1]}-${pcc0[2]}`);
    if (!number) return null;
    return { setCode: "premium00", number, grouping: "premiumvol00" };
  }

  if (id === "cp-001" || id.startsWith("cp-001-")) {
    return { setCode: "promo", number: "cp001", grouping: "event" };
  }

  const n01 = id.match(/^n01-(\d{1,4})$/);
  if (n01) {
    const number = normalizePrintedRef(`N-${n01[1]}`);
    if (!number) return null;
    return { setCode: "demo", number };
  }

  const sample = id.match(/^sample-(\d{1,4})$/);
  if (sample) {
    return {
      setCode: "n01",
      number: `sample${sample[1]!.padStart(2, "0")}`,
    };
  }

  const plain = id.match(/^([ncks])-(\d{1,4})$/);
  if (plain) {
    const number = normalizePrintedRef(`${plain[1]}-${plain[2]}`);
    if (!number) return null;
    return { setCode: "demo", number };
  }

  return null;
}

export function narutoCardGuideDisplayName(card: NarutoCardGuideCard): string {
  const id = card.id.trim().toUpperCase();
  if (/^SAMPLE-\d+/i.test(id) || /^sample-\d+/i.test(card.id)) {
    return id.replace(/^SAMPLE/i, "SAMPLE");
  }
  const n01 = card.id.match(/^n01-(\d+)$/i);
  if (n01) return `N-${n01[1]!.padStart(3, "0")}`;
  const pcc0 = card.id.match(/^pcc0-([cs])-(\d+)$/i);
  if (pcc0) {
    return `PCC0-${pcc0[1]!.toUpperCase()}-${pcc0[2]!.padStart(3, "0")}`;
  }
  const plain = card.id.match(/^([ncks]|cp)-(\d+)$/i);
  if (plain) {
    return `${plain[1]!.toUpperCase()}-${plain[2]!.padStart(3, "0")}`;
  }
  return card.name || card.id;
}
