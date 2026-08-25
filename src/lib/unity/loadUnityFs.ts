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

type BundleFileLike = {
  files?: readonly {
    node?: { path?: string };
    data?: Uint8Array | ArrayBuffer;
  }[];
};

type AssetManagerLike = {
  assetFiles?: readonly AssetFileLike[];
  primaryAssetFile?: AssetFileLike | null;
  bundleFile?: BundleFileLike | null;
  resourceFiles?: Map<string, { data?: Uint8Array | ArrayBuffer }>;
};

export type LoadedUnityFs = {
  assetFiles: readonly AssetFileLike[];
  /** Basename → bytes for streaming blobs (``.resS``). */
  resourceBlobs: ReadonlyMap<string, Uint8Array>;
};

function asAssetManager(raw: unknown): AssetManagerLike {
  return raw as AssetManagerLike;
}

function toUint8(data: Uint8Array | ArrayBuffer | undefined): Uint8Array | null {
  if (!data) return null;
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function basenamePath(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
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

  const resourceBlobs = new Map<string, Uint8Array>();
  for (const f of am.bundleFile?.files ?? []) {
    const path = f.node?.path;
    if (!path) continue;
    const blob = toUint8(f.data);
    if (!blob) continue;
    resourceBlobs.set(path, blob);
    resourceBlobs.set(basenamePath(path), blob);
  }
  if (am.resourceFiles) {
    for (const [key, val] of am.resourceFiles) {
      const blob = toUint8(val?.data);
      if (!blob) continue;
      resourceBlobs.set(key, blob);
      resourceBlobs.set(basenamePath(key), blob);
    }
  }

  return { assetFiles: files, resourceBlobs };
}

export function classNameOf(obj: object): string {
  const o = obj as { getClassName?: () => string; classID?: number };
  if (typeof o.getClassName === "function") return o.getClassName();
  if (typeof o.classID === "number") return `Class_${o.classID}`;
  return "";
}

export function classIdOf(obj: object): number | null {
  const o = obj as { classID?: number; classId?: number };
  if (typeof o.classID === "number") return o.classID;
  if (typeof o.classId === "number") return o.classId;
  const name = classNameOf(obj);
  const m = /(?:Class_)?(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
}

function readTree(
  af: AssetFileLike,
  obj: object,
): UnityTypeTree | null {
  let tree: string | UnityTypeTree;
  try {
    tree = af.getObjectUsingTreeJSON(obj);
  } catch {
    return null;
  }
  if (typeof tree === "string") {
    try {
      tree = JSON.parse(tree) as UnityTypeTree;
    } catch {
      return null;
    }
  }
  return tree && typeof tree === "object" ? tree : null;
}

function isMonoBehaviour(obj: object): boolean {
  const id = classIdOf(obj);
  if (id === 114) return true;
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
      const tree = readTree(af, obj);
      if (tree) yield tree;
    }
  }
}

/** Yield typetrees for a Unity class id (e.g. 28 = Texture2D, 48 = Shader). */
export function* iterClassTrees(
  loaded: LoadedUnityFs,
  classId: number,
): Generator<UnityTypeTree> {
  for (const af of loaded.assetFiles) {
    for (const obj of af.objects) {
      if (classIdOf(obj) !== classId) continue;
      const tree = readTree(af, obj);
      if (tree) yield tree;
    }
  }
}

/** Resolve ``m_StreamData.path`` to a resource blob. */
export function resolveResourceBlob(
  loaded: LoadedUnityFs,
  streamPath: string,
): Uint8Array | null {
  const raw = streamPath.trim();
  if (!raw) return null;
  const direct = loaded.resourceBlobs.get(raw);
  if (direct) return direct;
  const base = basenamePath(raw);
  return loaded.resourceBlobs.get(base) ?? null;
}
