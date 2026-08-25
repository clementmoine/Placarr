import { readFileSync } from "node:fs";
import path from "node:path";

import { narutoDiskCardId } from "../collectorIdentity";
import { narutoCuratedSourcesDir } from "../curatedPaths";

export type NarutoAttestedPair = {
  a: string;
  b: string;
  names?: string[];
  source?: string;
  note?: string;
};

type PairsFile = { pairs?: NarutoAttestedPair[] };

let cache: Map<string, string> | null = null;

function diskId(raw: string): string | null {
  return narutoDiskCardId(raw) ?? (raw.trim().toLowerCase() || null);
}

function loadPairs(): Map<string, string> {
  if (cache) return cache;
  const map = new Map<string, string>();
  try {
    const file = JSON.parse(
      readFileSync(
        path.join(narutoCuratedSourcesDir(), "attested-pairs.json"),
        "utf8",
      ),
    ) as PairsFile;
    for (const row of file.pairs ?? []) {
      const a = diskId(row.a);
      const b = diskId(row.b);
      if (!a || !b || a === b) continue;
      map.set(a, b);
      map.set(b, a);
    }
  } catch {
    /* missing ledger */
  }
  cache = map;
  return map;
}

export function resetNarutoAttestedPairsCache(): void {
  cache = null;
}

/** Other disk id when a named source attested the pair; never inferred. */
export function narutoAttestedPairOf(raw: string): string | null {
  const id = diskId(raw);
  if (!id) return null;
  return loadPairs().get(id) ?? null;
}

export function narutoIsAttestedPair(a: string, b: string): boolean {
  const left = diskId(a);
  const right = diskId(b);
  if (!left || !right) return false;
  return loadPairs().get(left) === right;
}
