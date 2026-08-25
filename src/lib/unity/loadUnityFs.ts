/**
 * Node-safe UnityFS open (typetree) via patched `unityfs-js`.
 *
 * Import DecoderManager first so LZ4/LZMA drivers register; skip
 * `registerDefaultClasses` (Vite texture worker) — Class_N names are fine
 * when we only need typetrees.
 */

import "unityfs-js/decoders/DecoderManager.js";
import { UnityFS } from "unityfs-js/unityfs/unityFile.js";

export type UnityTypeTree = Record<string, unknown>;

type AssetFileLike = {
  objects: readonly object[];
  getObjectUsingTreeJSON: (obj: object) => string | UnityTypeTree;
};

type AssetManagerLike = {
  assetFiles?: readonly AssetFileLike[];
  primaryAssetFile?: AssetFileLike | null;
};

export type LoadedUnityFs = {
  assetFiles: readonly AssetFileLike[];
};

function asAssetManager(raw: unknown): AssetManagerLike {
  return raw as AssetManagerLike;
}

/** Parse a UnityFS / AssetBundle buffer; typetree enabled. */
export function loadUnityFs(data: Uint8Array | ArrayBuffer | Buffer): LoadedUnityFs {
  const bytes =
    data instanceof Uint8Array
      ? data
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const u = new UnityFS(bytes, { enableTypeTree: true });
  u.parse();
  const am = asAssetManager(u.assetManager);
  const files = am.assetFiles?.length
    ? am.assetFiles
    : am.primaryAssetFile
      ? [am.primaryAssetFile]
      : [];
  return { assetFiles: files };
}

function classNameOf(obj: object): string {
  const o = obj as { getClassName?: () => string; classID?: number };
  if (typeof o.getClassName === "function") return o.getClassName();
  if (o.classID === 114) return "MonoBehaviour";
  return "";
}

function isMonoBehaviour(obj: object): boolean {
  const name = classNameOf(obj);
  return name === "MonoBehaviour" || name === "Class_114" || name.endsWith("_114");
}

/** Yield typetree objects for every MonoBehaviour in the bundle. */
export function* iterMonoBehaviourTrees(
  loaded: LoadedUnityFs,
): Generator<UnityTypeTree> {
  for (const af of loaded.assetFiles) {
    for (const obj of af.objects) {
      if (!isMonoBehaviour(obj)) continue;
      let tree: string | UnityTypeTree;
      try {
        tree = af.getObjectUsingTreeJSON(obj);
      } catch {
        continue;
      }
      if (typeof tree === "string") {
        try {
          tree = JSON.parse(tree) as UnityTypeTree;
        } catch {
          continue;
        }
      }
      if (tree && typeof tree === "object") yield tree;
    }
  }
}
