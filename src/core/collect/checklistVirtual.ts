/**
 * Virtual printKeys covered by closed sealed shelf items (étape 5).
 *
 * Catalogue derivation only — never invents lottery / preview contents.
 */
import { countsAsOwned } from "@/core/collect/itemAbsence";
import { ownershipSetFromPrintKey } from "@/core/collect/checklistOwnership";
import {
  virtualContents,
  type VirtualProductView,
} from "@/core/collect/sealedLifecycle";
import type { ItemPresence } from "@/generated/prisma/browser";

export type SealedShelfItemForVirtuals = {
  kind?: string | null;
  skuKey?: string | null;
  presence?: ItemPresence | null;
  openedAt?: Date | string | null;
};

/**
 * PrintKeys (lowercase) virtually held by closed sealed items on the shelf.
 */
export function virtualPrintKeysFromSealedItems(
  items: readonly SealedShelfItemForVirtuals[],
  loadProduct: (skuKey: string) => VirtualProductView | null,
): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    if (item.kind !== "sealed") continue;
    if (item.openedAt) continue;
    if (!countsAsOwned(item)) continue;
    const skuKey = item.skuKey?.trim();
    if (!skuKey) continue;
    const product = loadProduct(skuKey);
    if (!product) continue;
    const contents = virtualContents({
      presence: item.presence,
      openedAt: item.openedAt,
      product: { ...product, skuKey },
    });
    for (const row of contents) {
      if (row.kind !== "print" || row.qty <= 0) continue;
      const key = row.printKey.trim().toLowerCase();
      if (key) keys.add(key);
    }
  }
  return keys;
}

/**
 * Checklist ownership keys for virtual coverage (set-scoped + bare printKey).
 * Master set: blank finish only (`printKey|`) — honest when the guarantee
 * does not name a finish.
 */
export function virtualChecklistKeys(
  printKeys: Iterable<string>,
  options: { masterSet?: boolean } = {},
): Set<string> {
  const masterSet = Boolean(options.masterSet);
  const out = new Set<string>();
  for (const raw of printKeys) {
    const pk = raw.trim().toLowerCase();
    if (!pk) continue;
    const set = ownershipSetFromPrintKey(pk, null)?.trim().toLowerCase();
    if (masterSet) {
      out.add(`${pk}|`);
      if (set) out.add(`${set}|${pk}|`);
    } else {
      out.add(pk);
      if (set) out.add(`${set}|${pk}`);
    }
  }
  return out;
}
