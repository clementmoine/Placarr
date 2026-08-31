/**
 * TCG Live ``Card`` mesh UV rect from APK (ADR-021 phase D).
 * Parity with ``card_quad.py`` / ``card_quad_from_mesh``.
 */

import type { AssetManager } from "unityfs-js";

import {
  listApkSerializedHeads,
  loadSerializedAssets,
  openApkUnityData,
  readSerializedHeadBytes,
  type ExtractedApkData,
} from "@/lib/unity/apkAssets";

export const CARD_MESH_NAME = "Card";
const ASPECT_MIN = 0.68;
const ASPECT_MAX = 0.76;
const MAX_RESIDUAL = 1e-3;

export type UvRect = {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
};

export type CardQuadPayload = {
  mesh: string;
  uvRect: UvRect;
  aspect: number;
  frontVertices: number;
  residual: number;
  source?: string;
  st: {
    scale: [number, number];
    offset: [number, number];
  };
};

type Vec3 = [number, number, number];
type Vec2 = [number, number];

function parseObj(text: string): {
  positions: Vec3[];
  uvs: Vec2[];
  normals: Vec3[];
} {
  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const normals: Vec3[] = [];
  for (const line of text.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0]) continue;
    if (parts[0] === "v") {
      positions.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    } else if (parts[0] === "vt") {
      uvs.push([Number(parts[1]), Number(parts[2])]);
    } else if (parts[0] === "vn") {
      normals.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    }
  }
  return { positions, uvs, normals };
}

function fit(
  axis: number[],
  coord: number[],
): [a: number, b: number, residual: number] {
  const n = axis.length;
  const sx = axis.reduce((a, b) => a + b, 0);
  const sy = coord.reduce((a, b) => a + b, 0);
  const sxx = axis.reduce((a, b) => a + b * b, 0);
  const sxy = axis.reduce((a, x, i) => a + x * coord[i]!, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return [0, 0, Number.POSITIVE_INFINITY];
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  const residual = Math.max(
    ...axis.map((v, i) => Math.abs(a * v + b - coord[i]!)),
  );
  return [a, b, residual];
}

export function unityStFromQuad(quad: Pick<CardQuadPayload, "uvRect">): CardQuadPayload["st"] {
  const rect = quad.uvRect;
  return {
    scale: [rect.u1 - rect.u0, rect.v1 - rect.v0],
    offset: [rect.u0, rect.v0],
  };
}

/** UV rect of the front face from Wavefront OBJ text, or null. */
export function cardQuadFromObjText(text: string): Omit<CardQuadPayload, "st"> | null {
  const { positions, uvs, normals } = parseObj(text);
  if (
    positions.length === 0 ||
    uvs.length !== positions.length ||
    normals.length !== positions.length
  ) {
    return null;
  }

  const front: number[] = [];
  for (let i = 0; i < positions.length; i++) {
    if ((normals[i]?.[2] ?? 0) > 0.5) front.push(i);
  }
  if (front.length < 4) return null;

  const xs = front.map((i) => positions[i]![0]!);
  const ys = front.map((i) => positions[i]![1]!);
  const us = front.map((i) => uvs[i]![0]!);
  const vs = front.map((i) => uvs[i]![1]!);

  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (width <= 0 || height <= 0) return null;

  const aspect = width / height;
  if (aspect < ASPECT_MIN || aspect > ASPECT_MAX) return null;

  const [aU, bU, resU] = fit(xs, us);
  const [aV, bV, resV] = fit(ys, vs);
  const residual = Math.max(resU, resV);
  if (residual > MAX_RESIDUAL) return null;

  const u0 = aU * Math.min(...xs) + bU;
  const u1 = aU * Math.max(...xs) + bU;
  const v0 = aV * Math.min(...ys) + bV;
  const v1 = aV * Math.max(...ys) + bV;

  return {
    mesh: CARD_MESH_NAME,
    uvRect: {
      u0: Math.min(u0, u1),
      u1: Math.max(u0, u1),
      v0: Math.min(v0, v1),
      v1: Math.max(v0, v1),
    },
    aspect,
    frontVertices: front.length,
    residual,
  };
}

function objTextFromExport(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof Uint8Array) return Buffer.from(data).toString("utf8");
  if (data && typeof data === "object" && "raw" in data) {
    return objTextFromExport((data as { raw: unknown }).raw);
  }
  return null;
}

async function cardQuadFromAssetManager(
  am: AssetManager,
  source: string,
): Promise<CardQuadPayload | null> {
  const exported = await am.exportFileByName(CARD_MESH_NAME);
  if (exported?.error) return null;
  const text = objTextFromExport(exported?.data);
  if (!text) return null;
  const quad = cardQuadFromObjText(text);
  if (!quad) return null;
  return { ...quad, source, st: unityStFromQuad(quad) };
}

async function cardQuadFromSerializedBytes(
  bytes: Buffer,
  source: string,
): Promise<CardQuadPayload | null> {
  let am: AssetManager;
  try {
    am = await loadSerializedAssets(bytes);
  } catch {
    return null;
  }
  if (typeof am?.getObjectInfoByName !== "function") return null;
  if (!am.getObjectInfoByName(CARD_MESH_NAME)) return null;
  return cardQuadFromAssetManager(am, source);
}

export async function cardQuadFromExtractedData(
  extracted: ExtractedApkData,
): Promise<CardQuadPayload | null> {
  const heads = listApkSerializedHeads(extracted.dataDir).sort((a, b) => {
    const rank = (name: string) =>
      name.startsWith("sharedassets1") ? 0 : name.startsWith("sharedassets") ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  for (const head of heads) {
    const bytes = readSerializedHeadBytes(extracted.dataDir, head);
    const quad = await cardQuadFromSerializedBytes(bytes, head);
    if (quad) return quad;
  }
  return null;
}

export async function cardQuadFromApk(apkPath: string): Promise<CardQuadPayload | null> {
  const extracted = openApkUnityData(apkPath);
  try {
    return await cardQuadFromExtractedData(extracted);
  } finally {
    extracted.cleanup();
  }
}
