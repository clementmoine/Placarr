/**
 * Map a catalogue printKey onto a Frost leaf id closer to Unity templates.
 *
 * Order: playroom seed → folder tokens (superpara / tabac / pakipaki) →
 * parallel folders default to **para** (FoilType 0) — not foil-holo —
 * so a grey `mask.webp` never stamps FoilType-2 gold across the card.
 * Base (non-parallel) foils stay foil-holo when no seed matches.
 *
 * Face path parsing is FW-specific: `dbsfw:{set}-{folder}` where folder may
 * contain hyphens (`139-superpara`, `15-para-1an`) — stricter
 * {@link parsePrintKey} would reject those groupings.
 */
import { DBS_FW_CLIENT_RENDERS } from "./clientRenders";

const PLAYROOM_PATH_TO_LEAF = new Map<string, string>();
for (const row of DBS_FW_CLIENT_RENDERS) {
  const path = row.playroomFace?.path?.trim().toLowerCase();
  if (path && row.shader) PLAYROOM_PATH_TO_LEAF.set(path, row.id);
}

/** Folder stem after `set/` — e.g. `004-p1`, `139-superpara`. */
function folderStem(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

/**
 * True when the catalogue folder is a parallel / special print, not the
 * base number alone (`020` vs `004-p1`).
 */
export function dbsFwFolderLooksParallel(folder: string): boolean {
  const f = folder.trim().toLowerCase();
  if (!f) return false;
  if (f.includes("superpara")) return true;
  if (f.includes("para")) return true;
  // Bandai `_p1` / `_p2` → folder `NNN-p1`
  if (/^[\w.]+-p\d+[a-z0-9-]*$/i.test(f)) return true;
  return false;
}

/**
 * `dbsfw:st01-004-p1` → `st01/004-p1`.
 * `dbsfw:fs02-15-para-1an` → `fs02/15-para-1an` (hyphenated folder).
 */
export function dbsFwCatalogueFacePath(
  printKey: string | null | undefined,
): string | null {
  const trimmed = printKey?.trim().toLowerCase();
  if (!trimmed?.startsWith("dbsfw:")) return null;
  const rest = trimmed.slice("dbsfw:".length);
  const cut = rest.indexOf("-");
  if (cut <= 0) return null;
  const set = rest.slice(0, cut);
  const folder = rest.slice(cut + 1);
  if (!set || !folder) return null;
  return `${set}/${folder}`;
}

/**
 * Frost leaf for a foil print. Without a printKey, callers should keep
 * {@link resolveMaterial}(`foil`) → foil-holo.
 */
export function dbsFwFrostLeafForPrint(
  printKey: string | null | undefined,
): string {
  const path = dbsFwCatalogueFacePath(printKey);
  if (!path) return "foil-holo";

  const seed = PLAYROOM_PATH_TO_LEAF.get(path);
  if (seed) return seed;

  const folder = folderStem(path);
  if (folder.includes("superpara")) return "superpara";
  // Tabac_holo dumps live under `*-para-holo` / `*-para-1an` style folders.
  if (folder.includes("para-holo") || /para-1an(?:$|-)/.test(folder)) {
    return "tabac-holo";
  }
  if (folder.includes("pakipaki") || folder.includes("para-1anv")) {
    return "pakipaki";
  }
  // Generic parallels (p1, para, …): FoilType 0 — avoids orange flood when
  // only mask.webp exists. Stamp foils with mask-foil stay on seeds / base.
  if (dbsFwFolderLooksParallel(folder)) return "para";

  return "foil-holo";
}
