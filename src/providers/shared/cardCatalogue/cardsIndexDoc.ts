/**
 * CardsIndexV1 as an optional `pack_documents` blob — never a disk projection.
 *
 * Used where sidecar fields still live on the CardsIndex shape (Kayou
 * lenticular / landscape / artW×H). Identity browse does **not** use this.
 */
import { existsSync, readFileSync, unlinkSync } from "node:fs";

import {
  emptyCardsIndex,
  isCardsIndexV1,
  type CardsIndexV1,
} from "@/effects/cardsIndex";
import { packCardsIndexPath, packCatalogDb } from "@/lib/packPaths";
import {
  readPackDocument,
  writePackDocument,
} from "@/providers/shared/sealedProducts/productsSqlite";

export const CARDS_INDEX_DOC_KEY = "cards-index";

/** Load CardsIndexV1 from sqlite; one-shot migrate from legacy disk JSON. */
export function loadCardsIndexDoc(packId: string): CardsIndexV1 | null {
  const fromDb = readPackDocument<unknown>(packId, CARDS_INDEX_DOC_KEY);
  if (isCardsIndexV1(fromDb)) return fromDb;

  const disk = packCardsIndexPath(packId);
  if (!existsSync(disk)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(disk, "utf8"));
    if (!isCardsIndexV1(raw)) return null;
    writePackDocument(packId, CARDS_INDEX_DOC_KEY, raw);
    try {
      unlinkSync(disk);
    } catch {
      /* keep disk if unlink fails — sqlite is SSOT */
    }
    return raw;
  } catch {
    return null;
  }
}

/** Persist CardsIndexV1 to sqlite only (no `cards-index.json` on disk). */
export function persistCardsIndexDoc(
  packId: string,
  index: CardsIndexV1,
): { dbPath: string } {
  const payload: CardsIndexV1 = {
    ...index,
    pack: packId,
    version: 1,
    generatedAt: index.generatedAt ?? new Date().toISOString(),
  };
  const { dbPath } = writePackDocument(packId, CARDS_INDEX_DOC_KEY, payload);
  const disk = packCardsIndexPath(packId);
  if (existsSync(disk)) {
    try {
      unlinkSync(disk);
    } catch {
      /* ignore */
    }
  }
  return { dbPath: dbPath || packCatalogDb(packId) };
}

export function emptyCardsIndexDoc(packId: string): CardsIndexV1 {
  return emptyCardsIndex(packId);
}
