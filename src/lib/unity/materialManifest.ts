/**
 * MaterialManifest rows from a card UnityFS bundle (Live foil).
 */

import {
  iterMonoBehaviourTrees,
  loadUnityFs,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";

export type MaterialManifestRow = {
  name: string;
  /** Foil shader stem (e.g. HoloFoil_Rainbow_Amplify_J). */
  _f: string | null;
  /** Card texture stem. */
  _c: string | null;
  /** Shader path / foil path. */
  _s: string | null;
  /** Weak / mask texture stem. */
  _w: string | null;
  /** Material path. */
  _p: string | null;
  /** Cold foil texture. */
  _cf: string | null;
  /** Etch texture. */
  _e: string | null;
};

function strField(tree: UnityTypeTree, key: string): string | null {
  const v = tree[key];
  return typeof v === "string" && v.trim() ? v : null;
}

export function materialManifestsFromTypeTrees(
  trees: Iterable<UnityTypeTree>,
): MaterialManifestRow[] {
  const out: MaterialManifestRow[] = [];
  for (const tree of trees) {
    const name =
      (typeof tree.m_Name === "string" && tree.m_Name) ||
      (typeof tree.name === "string" && tree.name) ||
      "";
    if (!name.startsWith("MaterialManifest")) continue;
    out.push({
      name,
      _f: strField(tree, "_f"),
      _c: strField(tree, "_c"),
      _s: strField(tree, "_s"),
      _w: strField(tree, "_w"),
      _p: strField(tree, "_p"),
      _cf: strField(tree, "_cf"),
      _e: strField(tree, "_e"),
    });
  }
  return out;
}

export function parseMaterialManifests(
  data: Uint8Array | ArrayBuffer | Buffer,
): MaterialManifestRow[] {
  const loaded = loadUnityFs(data);
  return materialManifestsFromTypeTrees(iterMonoBehaviourTrees(loaded));
}
