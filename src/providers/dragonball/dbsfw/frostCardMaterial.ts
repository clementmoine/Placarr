/**
 * Frost/Card material → catalogue flatten stack.
 *
 * Source of truth: Material class-21 named `Card` (texenvs + gate floats),
 * sample order from FrostCard.frag:
 *   Main → Front → Frame → Middle → Chara → (holo) → Frame2 → CostNumber
 *
 * Catalogue inserts `costRing` with CostNumber (after Middle + text) — never
 * under Middle, or hair/FX bury the pips. Lang text / badge stay even when
 * Frame2 / CostNumber are unbound in the dump (runtime binds).
 */

import {
  iterClassTreeEntries,
  type LoadedUnityFs,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";

export const UNITY_MATERIAL_CLASS = 21;
export const UNITY_TEXTURE2D_CLASS_ID = 28;

/** Catalogue layer kinds driven by the material (+ product inserts). */
export type FrostCatalogueLayer =
  | "picture"
  | "frame"
  | "middle"
  | "frameTop"
  | "text"
  | "costRing"
  | "badge";

/**
 * Frost gate → catalogue mapping. FrameTex is a Texture2DArray: z=0 under
 * Middle, z=2 over Middle (`frameTop`). Frame2/Chara → text; CostNumber → badge.
 */
export const FROST_CATALOGUE_STACK = [
  { gate: "_UseFront", tex: "_FrontTex", layer: "picture" },
  { gate: "_UseFrame", tex: "_FrameTex", layer: "frame" },
  { gate: "_ShowMiddleTex", tex: "_MiddleTex", layer: "middle" },
  { gate: "_UseFrame", tex: "_FrameTex", layer: "frameTop" },
  { gate: "_UseFrame2", tex: "_Frame2Tex", layer: "text" },
  { gate: "_UseChara", tex: "_CharaTex", layer: "text" },
  { gate: "_UseCostNumberTex", tex: "_CostNumberTex", layer: "badge" },
] as const;

export type FrostCardMaterial = {
  /** Texture2D name bound to `_FrontTex`, or null. */
  frontTex: string | null;
  middleTex: string | null;
  frame2Tex: string | null;
  charaTex: string | null;
  costNumberTex: string | null;
  useMainTex: boolean;
  useFront: boolean;
  showMiddle: boolean;
  useFrame: boolean;
  useFrame2: boolean;
  useChara: boolean;
  useCostNumber: boolean;
};

function pairsFromUnityArray(raw: unknown): [string, unknown][] {
  if (!Array.isArray(raw)) return [];
  const out: [string, unknown][] = [];
  for (const item of raw) {
    if (Array.isArray(item) && item.length >= 2 && typeof item[0] === "string") {
      out.push([item[0], item[1]]);
    }
  }
  return out;
}

function texturePathId(texEnv: unknown): string | null {
  if (!texEnv || typeof texEnv !== "object") return null;
  const tex = (texEnv as { m_Texture?: { m_PathID?: bigint | number } })
    .m_Texture;
  const pid = tex?.m_PathID;
  if (pid == null || pid === 0 || pid === 0n) return null;
  return String(pid);
}

function gateOn(floats: Record<string, number>, key: string): boolean {
  return (floats[key] ?? 0) !== 0;
}

function materialFromTree(
  tree: UnityTypeTree,
  texturesByPath: ReadonlyMap<string, string>,
): FrostCardMaterial | null {
  const name = String(tree.m_Name ?? tree.name ?? "");
  if (name !== "Card") return null;
  const props = tree.m_SavedProperties;
  if (!props || typeof props !== "object") return null;
  const rec = props as Record<string, unknown>;

  const floats: Record<string, number> = {};
  for (const [key, value] of pairsFromUnityArray(rec.m_Floats)) {
    floats[key] = Number(value);
  }

  const tex: Record<string, string | null> = {};
  for (const [uniform, texEnv] of pairsFromUnityArray(rec.m_TexEnvs)) {
    const pid = texturePathId(texEnv);
    tex[uniform] = pid ? (texturesByPath.get(pid) ?? null) : null;
  }

  return {
    frontTex: tex._FrontTex ?? null,
    middleTex: tex._MiddleTex ?? null,
    frame2Tex: tex._Frame2Tex ?? null,
    charaTex: tex._CharaTex ?? null,
    costNumberTex: tex._CostNumberTex ?? null,
    useMainTex: gateOn(floats, "_UseMainTex"),
    useFront: gateOn(floats, "_UseFront"),
    showMiddle: gateOn(floats, "_ShowMiddleTex"),
    useFrame: gateOn(floats, "_UseFrame"),
    useFrame2: gateOn(floats, "_UseFrame2"),
    useChara: gateOn(floats, "_UseChara"),
    useCostNumber: gateOn(floats, "_UseCostNumberTex"),
  };
}

/**
 * Prefer the richest `Card` material in the bundle (Front+Middle+Frame beats
 * a duplicate with the same slots).
 */
function richness(m: FrostCardMaterial): number {
  let n = 0;
  if (m.useFront && m.frontTex) n += 4;
  if (m.showMiddle && m.middleTex) n += 4;
  if (m.useFrame) n += 2;
  if (m.useFrame2 && m.frame2Tex) n += 1;
  if (m.useChara && m.charaTex) n += 1;
  if (m.useCostNumber && m.costNumberTex) n += 1;
  return n;
}

/** Read the primary Frost `Card` material from a card UnityFS. */
export function parseFrostCardMaterial(
  loaded: LoadedUnityFs,
): FrostCardMaterial | null {
  const texturesByPath = new Map<string, string>();
  for (const { tree, pathId } of iterClassTreeEntries(
    loaded,
    UNITY_TEXTURE2D_CLASS_ID,
  )) {
    if (!pathId) continue;
    const texName = String(tree.m_Name ?? tree.name ?? "").trim();
    if (texName) texturesByPath.set(pathId, texName);
  }

  let best: FrostCardMaterial | null = null;
  let bestScore = -1;
  for (const { tree } of iterClassTreeEntries(loaded, UNITY_MATERIAL_CLASS)) {
    const mat = materialFromTree(tree, texturesByPath);
    if (!mat) continue;
    const score = richness(mat);
    if (score > bestScore) {
      best = mat;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Build the catalogue flatten order from material gates + available plates.
 *
 * Frost: Front → Frame(z0) → Middle → Frame(z2) → text → costRing → badge.
 * `frameTop` is Texture2DArray slice 2 (footer chrome over the character).
 */
export function frostCatalogueComposeOrder(opts: {
  material: FrostCardMaterial | null;
  hasText: boolean;
  hasCostRing: boolean;
  hasBadge: boolean;
  hasFrameTop?: boolean;
}): FrostCatalogueLayer[] {
  const mat = opts.material;
  const out: FrostCatalogueLayer[] = [];
  const push = (layer: FrostCatalogueLayer) => {
    if (!out.includes(layer)) out.push(layer);
  };

  if (!mat) {
    push("picture");
    push("frame");
    if (opts.hasFrameTop) push("frameTop");
    if (opts.hasText) push("text");
    if (opts.hasCostRing) push("costRing");
    if (opts.hasBadge) push("badge");
    return out;
  }

  if (mat.useFront) push("picture");
  if (mat.useFrame) push("frame");
  if (mat.showMiddle && mat.middleTex) push("middle");
  if (mat.useFrame && opts.hasFrameTop) push("frameTop");
  if (opts.hasText || mat.useFrame2 || mat.useChara) push("text");
  if (opts.hasCostRing) push("costRing");
  if (opts.hasBadge || mat.useCostNumber) push("badge");
  return out;
}

/**
 * Stale when costRing / frameTop sit under Middle (character buries UI chrome).
 */
export function isFrostComposeOrderCurrent(
  order: readonly string[] | null | undefined,
): boolean {
  if (!order || order.length === 0) return false;
  const mid = order.indexOf("middle");
  const cost = order.indexOf("costRing");
  if (cost >= 0 && mid >= 0 && cost < mid) return false;
  const text = order.indexOf("text");
  if (cost >= 0 && text >= 0 && cost < text) return false;
  const top = order.indexOf("frameTop");
  const frame = order.indexOf("frame");
  // Slice-2 footer must sit above Middle when both Frame + Middle are used.
  if (frame >= 0 && mid >= 0 && top < 0) return false;
  if (top >= 0 && mid >= 0 && top < mid) return false;
  return true;
}

/** Fallback when the bundle has no Card material (name-heuristic picture). */
export function frostCardMaterialFallback(pictureName: string): FrostCardMaterial {
  return {
    frontTex: pictureName || null,
    middleTex: null,
    frame2Tex: null,
    charaTex: null,
    costNumberTex: null,
    useMainTex: false,
    useFront: Boolean(pictureName),
    showMiddle: false,
    useFrame: true,
    useFrame2: false,
    useChara: false,
    useCostNumber: false,
  };
}
