/**
 * Parse Capsule Corp Gear Kayou card list (base64-obfuscated Vue payload).
 *
 * @see https://capsulecorpgear.com/naruto-kayou-card-list/
 */
import {
  kayouBoxToSetCode,
  kayouCleanPrintedId,
  kayouNumberToPrinted,
  kayouPrintedToNumber,
} from "./kayouIdNormalize";
import type { KayouChecklist, KayouChecklistCard, KayouChecklistSet } from "./kayouLedgerTypes";

export const CAPSULECORPGEAR_LIST_URL =
  "https://capsulecorpgear.com/naruto-kayou-card-list/";
export const CAPSULECORPGEAR_UPLOADS_BASE =
  "https://capsulecorpgear.com/wp-content/uploads/";

export type CapsulecorpRawCard = {
  name: string;
  id: string;
  image: string;
  box: string;
  rank: string;
  meta?: string;
  form?: string;
  price?: string;
  link?: string;
};

export function decodeCapsulecorpField(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return Buffer.from(trimmed, "base64").toString("utf8");
  } catch {
    return trimmed;
  }
}

export function decodeCapsulecorpCards(raw: CapsulecorpRawCard[]): CapsulecorpRawCard[] {
  return raw.map((row) => ({
    name: decodeCapsulecorpField(row.name),
    id: decodeCapsulecorpField(row.id),
    image: decodeCapsulecorpField(row.image),
    box: decodeCapsulecorpField(row.box),
    rank: decodeCapsulecorpField(row.rank),
    meta: row.meta ? decodeCapsulecorpField(row.meta) : "",
    form: row.form ? decodeCapsulecorpField(row.form) : "",
    price: row.price ? decodeCapsulecorpField(row.price) : "",
    link: row.link ? decodeCapsulecorpField(row.link) : "",
  }));
}

export function extractCapsulecorpCardsJson(html: string): CapsulecorpRawCard[] {
  const match = html.match(/let cards = (\[[\s\S]*?\]);/);
  if (!match?.[1]) {
    throw new Error("capsulecorpgear: cards payload not found");
  }
  return JSON.parse(match[1]) as CapsulecorpRawCard[];
}

export function capsulecorpFaceUrl(imageFile: string): string | null {
  const file = imageFile.trim();
  if (!file) return null;
  return `${CAPSULECORPGEAR_UPLOADS_BASE}${file}`;
}

export function capsulecorpCardToChecklistEntry(
  card: CapsulecorpRawCard,
): { setCode: string; card: KayouChecklistCard } | null {
  const setCode = kayouBoxToSetCode(card.box);
  if (!setCode) return null;
  const printed = kayouCleanPrintedId(card.id);
  const number = kayouPrintedToNumber(printed);
  const name = card.name.trim() || card.meta?.trim() || printed;
  if (!number || !name) return null;
  const faceUrl = capsulecorpFaceUrl(card.image);
  return {
    setCode,
    card: {
      printed: kayouNumberToPrinted(number),
      number,
      name,
      rarity: card.rank.trim() || null,
      faceUrl,
      faceSource: "capsulecorpgear",
    },
  };
}

export function buildCapsulecorpChecklist(
  raw: CapsulecorpRawCard[],
  observed = new Date().toISOString().slice(0, 10),
): KayouChecklist {
  const decoded = decodeCapsulecorpCards(raw);
  const bySet = new Map<string, KayouChecklistCard[]>();
  const byKey = new Map<string, KayouChecklistCard>();

  for (const row of decoded) {
    const mapped = capsulecorpCardToChecklistEntry(row);
    if (!mapped) continue;
    const key = `${mapped.setCode}:${mapped.card.number}`;
    const existing = byKey.get(key);
    if (existing) {
      if (mapped.card.faceUrl && !existing.faceUrl) {
        existing.faceUrl = mapped.card.faceUrl;
        existing.faceSource = "capsulecorpgear";
      } else if (mapped.card.faceUrl) {
        existing.faceUrlAlternates = [
          ...(existing.faceUrlAlternates ?? []),
          mapped.card.faceUrl,
        ].filter((u, i, a) => a.indexOf(u) === i);
      }
      if (mapped.card.name && mapped.card.name !== mapped.card.printed) {
        existing.name = mapped.card.name;
      }
      continue;
    }
    byKey.set(key, mapped.card);
    const list = bySet.get(mapped.setCode) ?? [];
    list.push(mapped.card);
    bySet.set(mapped.setCode, list);
  }

  const sets: KayouChecklistSet[] = [...bySet.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, cards]) => ({
      slug: `capsulecorpgear-${code}`,
      code,
      label: code.toUpperCase(),
      url: CAPSULECORPGEAR_LIST_URL,
      cards: cards.sort((a, b) => a.number.localeCompare(b.number)),
    }));

  return {
    source: "capsulecorpgear.com — Naruto Kayou card list",
    url: CAPSULECORPGEAR_LIST_URL,
    observed,
    ingest: "HTML `let cards = …` base64 fields + wp-content/uploads faces",
    sets,
  };
}

export function parseCapsulecorpChecklist(html: string): KayouChecklist {
  const raw = extractCapsulecorpCardsJson(html);
  return buildCapsulecorpChecklist(raw);
}
