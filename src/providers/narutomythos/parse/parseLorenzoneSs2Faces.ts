/**
 * Parse LorenZone Shinobi Shiren gallery CDN face URLs → checklist keys.
 */
export type MythosSs2FaceHit = {
  number: string;
  grouping: string | null;
  faceUrl: string;
};

const FACE_RE =
  /https:\/\/cdn\.shopify\.com\/s\/files\/1\/0776\/0848\/5206\/files\/([A-Za-z0-9._%-]+\.webp)/gi;

/** `031-140-…-chibi-…` / `mss01-140-…` / `001-000-…legendaire…` / `087-141-…` typo. */
export function parseMythosSs2FaceStem(stem: string): {
  number: string;
  grouping: string | null;
} | null {
  const base = stem.replace(/\.webp$/i, "");
  const mss = base.match(/^(mss\d+)-14[01]-/i);
  if (mss) {
    const raw = mss[1]!.toLowerCase();
    const digits = raw.slice(3).replace(/^0+/, "") || "0";
    return { number: `mss${digits.padStart(2, "0")}`, grouping: null };
  }
  const legendary = base.match(/^(\d{3})-000-/);
  if (legendary) {
    const n = Number(legendary[1]);
    if (!Number.isFinite(n)) return null;
    return { number: `lg${String(n).padStart(2, "0")}`, grouping: null };
  }
  // LorenZone typo: Weights listed as 087/141.
  const numbered = base.match(/^(\d{3})-14[01]-/);
  if (!numbered) return null;
  const number = numbered[1]!.padStart(4, "0");
  let grouping: string | null = null;
  if (/-chibi-/i.test(base)) grouping = "chibi";
  else if (/-pop-/i.test(base)) grouping = "pop";
  return { number, grouping };
}

export function parseMythosSs2FaceUrlsFromHtml(
  html: string,
): MythosSs2FaceHit[] {
  const byKey = new Map<string, MythosSs2FaceHit>();
  for (const match of html.matchAll(FACE_RE)) {
    const file = match[1]!;
    if (!/shinobi-shiren/i.test(file)) continue;
    const parsed = parseMythosSs2FaceStem(file);
    if (!parsed) continue;
    const faceUrl = `https://cdn.shopify.com/s/files/1/0776/0848/5206/files/${file}`;
    const key = `${parsed.number}\0${parsed.grouping ?? ""}`;
    byKey.set(key, { ...parsed, faceUrl });
  }
  return [...byKey.values()].sort((a, b) => {
    const byNum = a.number.localeCompare(b.number);
    if (byNum) return byNum;
    return (a.grouping ?? "").localeCompare(b.grouping ?? "");
  });
}

export function matchMythosSs2FaceUrl(
  hits: readonly MythosSs2FaceHit[],
  card: { number: string; grouping?: string | null },
): string | null {
  const number = card.number.trim().toLowerCase();
  const grouping = card.grouping?.trim().toLowerCase() || null;
  const exact = hits.find(
    (h) => h.number === number && (h.grouping ?? null) === grouping,
  );
  if (exact) return exact.faceUrl;
  const sameNumber = hits.filter((h) => h.number === number);
  if (sameNumber.length === 1) return sameNumber[0]!.faceUrl;
  return null;
}
