/**
 * Which checklist `setId` an owned printKey should tick.
 *
 * Catalogue `setCode` / {@link catalogueSetFromPrintKey} follow the chapter in
 * the key (`13` for `lorcana:13-16-p4`). Promo checklists live under a separate
 * id (`p4`). Games register a resolver so the shelf route stays provider-free.
 */
import {
  catalogueSetFromPrintKey,
  parsePrintKey,
  type PrintIdentity,
} from "@/core/identify/printKey";

type ChecklistOwnershipResolver = (identity: PrintIdentity) => string | null;

const resolvers = new Map<string, ChecklistOwnershipResolver>();

/** Register how a game maps print identity → checklist set id. */
export function registerChecklistOwnershipSet(
  game: string,
  resolve: ChecklistOwnershipResolver,
): void {
  const slug = game.trim().toLowerCase();
  if (!slug) return;
  resolvers.set(slug, resolve);
}

/** Test helper. */
export function unregisterChecklistOwnershipSet(game: string): void {
  resolvers.delete(game.trim().toLowerCase());
}

/**
 * Set id used when building owned checklist keys.
 *
 * Prefer a game-registered checklist axis (Lorcana Promo Year `p4`) over a
 * stale `Item.setCode` chapter stamp (`13`) or the printKey chapter segment.
 */
export function ownershipSetFromPrintKey(
  printKey: string | null | undefined,
  itemSetCode?: string | null,
): string | null {
  const identity = parsePrintKey(printKey);
  if (identity) {
    const fromGame = resolvers.get(identity.game)?.(identity)?.trim();
    if (fromGame) return fromGame.toLowerCase();
  }
  const fromItem = itemSetCode?.trim();
  if (fromItem) return fromItem.toLowerCase();
  const fromKey = catalogueSetFromPrintKey(printKey)?.trim();
  return fromKey ? fromKey.toLowerCase() : null;
}
