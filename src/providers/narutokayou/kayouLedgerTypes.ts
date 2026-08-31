/** Shared Kayou checklist shapes (narutocards.ca + external ledgers). */
export type KayouChecklistCard = {
  printed: string;
  number: string;
  name: string;
  rarity: string | null;
  faceUrl?: string | null;
  faceUrlAlternates?: string[];
  /** Which ledger supplied the primary face URL. */
  faceSource?: string | null;
};

export type KayouChecklistSet = {
  slug: string;
  code: string;
  label: string;
  url: string;
  cards: KayouChecklistCard[];
};

export type KayouChecklist = {
  source: string;
  url: string;
  observed?: string;
  ingest?: string;
  note?: string;
  sets: KayouChecklistSet[];
};
