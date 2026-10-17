/**
 * Parse Rainier CDN AssetManifest UnityFS → assetList rows.
 * Mirrors ``dump_cdn_manifest.parse_asset_entries`` (UnityPy).
 */

import {
  iterMonoBehaviourTrees,
  loadUnityFs,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";

export type UnityAssetManifestEntry = {
  name: string;
  crc: number | null;
  hash: string | null;
  dependencies: string[];
};

function findAssetList(tree: UnityTypeTree): unknown[] | null {
  const direct = tree.assetList ?? tree.m_assetList;
  if (Array.isArray(direct)) return direct;
  for (const val of Object.values(tree)) {
    if (
      Array.isArray(val) &&
      val.length > 0 &&
      typeof val[0] === "object" &&
      val[0] !== null &&
      "assetName" in (val[0] as object)
    ) {
      return val;
    }
  }
  return null;
}

/** Extract unique, name-sorted asset rows from already-parsed typetrees. */
export function assetEntriesFromTypeTrees(
  trees: Iterable<UnityTypeTree>,
): UnityAssetManifestEntry[] {
  const rows: UnityAssetManifestEntry[] = [];
  for (const tree of trees) {
    const assetList = findAssetList(tree);
    if (!assetList) continue;
    for (const entry of assetList) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      const nameRaw = rec.assetName ?? rec.m_Name;
      if (typeof nameRaw !== "string" || !nameRaw.trim()) continue;
      const deps = rec.dependencies;
      rows.push({
        name: nameRaw.trim(),
        crc: typeof rec.crc === "number" ? rec.crc : null,
        hash: typeof rec.hash === "string" ? rec.hash : null,
        dependencies: Array.isArray(deps)
          ? deps.filter((d): d is string => typeof d === "string")
          : [],
      });
    }
  }
  const seen = new Set<string>();
  const out: UnityAssetManifestEntry[] = [];
  for (const r of rows) {
    const key = r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  out.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return out;
}

export function parseAssetManifestEntries(
  data: Uint8Array | ArrayBuffer | Buffer,
): UnityAssetManifestEntry[] {
  const loaded = loadUnityFs(data);
  return assetEntriesFromTypeTrees(iterMonoBehaviourTrees(loaded));
}
