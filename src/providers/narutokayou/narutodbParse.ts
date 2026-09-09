/**
 * Pure helpers for api.narutodb.com (Kayou Smriti catalogue + CDN faces/backs).
 */
import type { KayouChecklist, KayouChecklistSet } from "./kayouLedgerTypes";
import {
  kayouOfficialIdToPrint,
  kayouOfficialSetLabel,
} from "./kayouOfficialId";

export const NARUTODB_API_ORIGIN = "https://api.narutodb.com";
export const NARUTODB_CDN_ORIGIN = "https://cdn.narutodb.com";

export type NarutodbSet = {
  id: string;
  name: string;
  subtitle?: string | null;
  total_cards?: number | null;
};

export type NarutodbCardListRow = {
  card_number: string;
  set_id: string;
  rarity_code?: string | null;
  character_name?: string | null;
  image_front_url?: string | null;
  image_back_url?: string | null;
  image_thumb_url?: string | null;
};

export function narutodbCardApiUrl(cardNumber: string): string {
  return `${NARUTODB_API_ORIGIN}/api/cards/${encodeURIComponent(cardNumber)}`;
}

export function narutodbSetCardsApiUrl(setId: string): string {
  return `${NARUTODB_API_ORIGIN}/api/sets/${encodeURIComponent(setId)}/cards`;
}

export function narutodbSetsApiUrl(): string {
  return `${NARUTODB_API_ORIGIN}/api/sets`;
}

/** CDN layout attested on NREA01-SR-018L2 (front + back). */
export function narutodbOfficialImageUrl(
  cardNumber: string,
  side: "front" | "back" | "thumb",
): string {
  const code = cardNumber.trim();
  return `${NARUTODB_CDN_ORIGIN}/storage/cards/official/${encodeURIComponent(code)}-${side}.png`;
}

export function parseNarutodbSetsJson(raw: unknown): NarutodbSet[] {
  if (!Array.isArray(raw)) return [];
  const out: NarutodbSet[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: unknown }).id ?? "").trim();
    const name = String((row as { name?: unknown }).name ?? "").trim();
    if (!id || !name) continue;
    out.push({
      id,
      name,
      subtitle:
        typeof (row as { subtitle?: unknown }).subtitle === "string"
          ? (row as { subtitle: string }).subtitle
          : null,
      total_cards:
        typeof (row as { total_cards?: unknown }).total_cards === "number"
          ? (row as { total_cards: number }).total_cards
          : null,
    });
  }
  return out;
}

export function parseNarutodbCardsJson(raw: unknown): NarutodbCardListRow[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { cards?: unknown }).cards)
      ? (raw as { cards: unknown[] }).cards
      : [];
  const out: NarutodbCardListRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const card_number = String(
      (row as { card_number?: unknown }).card_number ?? "",
    ).trim();
    const set_id = String((row as { set_id?: unknown }).set_id ?? "").trim();
    if (!card_number || !set_id) continue;
    out.push({
      card_number,
      set_id,
      rarity_code:
        typeof (row as { rarity_code?: unknown }).rarity_code === "string"
          ? (row as { rarity_code: string }).rarity_code
          : null,
      character_name:
        typeof (row as { character_name?: unknown }).character_name === "string"
          ? (row as { character_name: string }).character_name
          : null,
      image_front_url:
        typeof (row as { image_front_url?: unknown }).image_front_url === "string"
          ? (row as { image_front_url: string }).image_front_url
          : null,
      image_back_url:
        typeof (row as { image_back_url?: unknown }).image_back_url === "string"
          ? (row as { image_back_url: string }).image_back_url
          : null,
      image_thumb_url:
        typeof (row as { image_thumb_url?: unknown }).image_thumb_url === "string"
          ? (row as { image_thumb_url: string }).image_thumb_url
          : null,
    });
  }
  return out;
}

/**
 * Build a Kayou checklist from narutodb set + card rows.
 * Uses `kayouOfficialIdToPrint` so NREA01 → set `nrea01`.
 */
export function buildNarutodbKayouChecklist(input: {
  sets: readonly NarutodbSet[];
  cardsBySet: Readonly<Record<string, readonly NarutodbCardListRow[]>>;
  observed?: string;
}): KayouChecklist {
  const setMeta = new Map(input.sets.map((s) => [s.id, s]));
  const byCode = new Map<string, KayouChecklistSet>();

  for (const [setId, rows] of Object.entries(input.cardsBySet)) {
    for (const row of rows) {
      const mapped = kayouOfficialIdToPrint(row.card_number);
      if (!mapped) continue;
      // Ninja Age already on narutocards / official enrich as cc.*
      if (mapped.setCode === "ninjaagebox") continue;

      let set = byCode.get(mapped.setCode);
      if (!set) {
        const meta = setMeta.get(setId);
        const label =
          kayouOfficialSetLabel(mapped.setCode) !== mapped.setCode.toUpperCase()
            ? kayouOfficialSetLabel(mapped.setCode)
            : meta
              ? `${meta.name}${meta.subtitle ? ` (${meta.subtitle})` : ""}`
              : kayouOfficialSetLabel(mapped.setCode);
        set = {
          slug: `narutodb-${mapped.setCode}`,
          code: mapped.setCode,
          label,
          url: `https://narutodb.com/sets/${encodeURIComponent(setId)}`,
          cards: [],
        };
        byCode.set(mapped.setCode, set);
      }

      const front =
        row.image_front_url?.trim() ||
        narutodbOfficialImageUrl(row.card_number, "front");
      set.cards.push({
        printed: row.card_number,
        number: mapped.number,
        name: row.character_name?.trim() || row.card_number,
        rarity: row.rarity_code?.trim() || null,
        faceUrl: front,
        faceSource: "narutodb",
      });
    }
  }

  const sets = [...byCode.values()]
    .map((set) => ({
      ...set,
      cards: set.cards.sort((a, b) => a.number.localeCompare(b.number)),
    }))
    .filter((set) => set.cards.length > 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    source: "narutodb.com",
    url: "https://narutodb.com/",
    observed: input.observed,
    sets,
  };
}

export function narutodbBackUrlForCard(row: NarutodbCardListRow): string {
  return (
    row.image_back_url?.trim() ||
    narutodbOfficialImageUrl(row.card_number, "back")
  );
}
