/**
 * Node-safe UnityFS open (typetree) via patched `unityfs-js`.
 *
 * Import DecoderManager first so LZ4/LZMA drivers register; skip
 * `registerDefaultClasses` (Vite texture worker) — Class_N names are fine
 * when we only need typetrees.
 */

import "unityfs-js/decoders/DecoderManager.js";
import { load, type AssetManager } from "unityfs-js";
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
    _data?: Uint8Array | ArrayBuffer;
  }[];
};

type ResourceFileLike = {
  data?: Uint8Array | ArrayBuffer;
  _data?: Uint8Array | ArrayBuffer;
};

type AssetManagerLike = {
  assetFiles?: readonly AssetFileLike[];
  primaryAssetFile?: AssetFileLike | null;
  bundleFile?: BundleFileLike | null;
  resourceFiles?: Map<string, ResourceFileLike>;
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

function fileBytes(file: {
  data?: Uint8Array | ArrayBuffer;
  _data?: Uint8Array | ArrayBuffer;
}): Uint8Array | null {
  return toUint8(file.data ?? file._data);
}

function indexResourceBlob(
  map: Map<string, Uint8Array>,
  key: string,
  blob: Uint8Array,
): void {
  map.set(key, blob);
  map.set(basenamePath(key), blob);
  // unityfs-js lowercases resourceFiles keys; stream paths keep .resS casing.
  map.set(key.toLowerCase(), blob);
  map.set(basenamePath(key).toLowerCase(), blob);
}

/**
 * Collect ``.resS`` (and other streamed) blobs from an AssetManager /
 * UnityFS parse — used when typetree is off and Texture2D pixels live in
 * ``m_StreamData``.
 */
export function resourceBlobsFromAssetManager(am: unknown): Map<string, Uint8Array> {
  const mgr = asAssetManager(am);
  const resourceBlobs = new Map<string, Uint8Array>();
  for (const f of mgr.bundleFile?.files ?? []) {
    const path = f.node?.path;
    if (!path) continue;
    const blob = fileBytes(f);
    if (!blob) continue;
    indexResourceBlob(resourceBlobs, path, blob);
  }
  if (mgr.resourceFiles) {
    for (const [key, val] of mgr.resourceFiles) {
      const blob = fileBytes(val ?? {});
      if (!blob) continue;
      indexResourceBlob(resourceBlobs, key, blob);
    }
  }
  return resourceBlobs;
}

/** `load()` from unityfs-js — sync or Promise depending on build. */
export async function resolveAssetManager(
  data: Uint8Array | ArrayBuffer | Buffer,
  opts?: { unityRevision?: string; enableTypeTree?: boolean },
): Promise<AssetManager> {
  const bytes =
    data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
  const loaded = load(bytes, {
    unityRevision: opts?.unityRevision ?? "2022.3.21f1",
    enableTypeTree: opts?.enableTypeTree ?? true,
  }) as AssetManager | Promise<AssetManager>;
  if (loaded && typeof (loaded as Promise<AssetManager>).then === "function") {
    return loaded as Promise<AssetManager>;
  }
  return loaded as AssetManager;
}

/** Parse a UnityFS / AssetBundle buffer; typetree enabled. */
export function loadUnityFs(data: Uint8Array | ArrayBuffer | Buffer): LoadedUnityFs {
  const bytes =
    data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
  const u = new UnityFS(bytes, { enableTypeTree: true });
  u.parse();
  const am = asAssetManager(u.assetManager);
  const files = am.assetFiles?.length
    ? am.assetFiles
    : am.primaryAssetFile
      ? [am.primaryAssetFile]
      : [];

  return {
    assetFiles: files,
    resourceBlobs: resourceBlobsFromAssetManager(am),
  };
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

export function pathIdOf(obj: object): string | null {
  const o = obj as { pathID?: bigint | number; m_PathID?: bigint | number };
  const raw = o.pathID ?? o.m_PathID;
  if (raw == null) return null;
  return String(raw);
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
  for (const item of iterClassTreeEntries(loaded, classId)) {
    yield item.tree;
  }
}

/** Typetree + Unity path id (for Material → Texture2D refs). */
export function* iterClassTreeEntries(
  loaded: LoadedUnityFs,
  classId: number,
): Generator<{ tree: UnityTypeTree; pathId: string | null }> {
  for (const af of loaded.assetFiles) {
    for (const obj of af.objects) {
      if (classIdOf(obj) !== classId) continue;
      const tree = readTree(af, obj);
      if (tree) yield { tree, pathId: pathIdOf(obj) };
    }
  }
}

/** Resolve ``m_StreamData.path`` against a blob map (case-insensitive). */
export function resolveBlobFromMap(
  resourceBlobs: ReadonlyMap<string, Uint8Array>,
  streamPath: string,
): Uint8Array | null {
  const raw = streamPath.trim();
  if (!raw) return null;
  const direct = resourceBlobs.get(raw);
  if (direct) return direct;
  const base = basenamePath(raw);
  return (
    resourceBlobs.get(base) ??
    resourceBlobs.get(raw.toLowerCase()) ??
    resourceBlobs.get(base.toLowerCase()) ??
    null
  );
}

/** Resolve ``m_StreamData.path`` to a resource blob. */
export function resolveResourceBlob(
  loaded: LoadedUnityFs,
  streamPath: string,
): Uint8Array | null {
  return resolveBlobFromMap(loaded.resourceBlobs, streamPath);
}
