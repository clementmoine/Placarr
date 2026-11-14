/**
 * Map a catalogue printKey onto a Frost playroom leaf id.
 * Seed faces in {@link DBS_FW_CLIENT_RENDERS} win; otherwise folder tokens
 * (superpara) then the house foil-holo default.
 */
import { parsePrintKey } from "@/core/identify/printKey";

import { DBS_FW_CLIENT_RENDERS } from "./clientRenders";

const PLAYROOM_PATH_TO_LEAF = new Map<string, string>();
for (const row of DBS_FW_CLIENT_RENDERS) {
  const path = row.playroomFace?.path?.trim().toLowerCase();
  if (path && row.shader) PLAYROOM_PATH_TO_LEAF.set(path, row.id);
}

/** `dbsfw:st01-004-p1` → `st01/004-p1`. */
export function dbsFwCatalogueFacePath(
  printKey: string | null | undefined,
): string | null {
  const id = parsePrintKey(printKey);
  if (!id || id.game !== "dbsfw") return null;
  const folder = id.grouping ? `${id.number}-${id.grouping}` : id.number;
  return `${id.set}/${folder}`;
}

/**
 * Frost leaf for a foil print. Without a printKey, callers should keep
 * {@link resolveMaterial}(`foil`) → foil-holo.
 */
export function dbsFwFrostLeafForPrint(
  printKey: string | null | undefined,
): string {
  const path = dbsFwCatalogueFacePath(printKey);
  if (path) {
    const seed = PLAYROOM_PATH_TO_LEAF.get(path);
    if (seed) return seed;
    if (path.includes("superpara")) return "superpara";
  }
  return "foil-holo";
}
