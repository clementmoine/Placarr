/**
 * Placarr decisions for Fusion World client-face flatten.
 * These are not Unity dump fields — keep them here with `DECISION:` comments,
 * not mixed with Frost / Texture2D geometry.
 */

/** DECISION: catalogue print aspect (physical 63×88), not Unity art 1:2. */
export const FW_PRINT_ASPECT = 63 / 88;

/**
 * DECISION: fit Unity 1:2 plates onto 63×88 by **widening** (512×1024 →
 * 733×1024). Shrink-height (512×715) was an anti-tramage workaround; GPU
 * S3TC+LINEAR bake makes widen safe again.
 */
export const CLIENT_FACE_LAYOUT_ID = "print-widen";

/**
 * DECISION: catalogue GPU bake tone — all layers in display-byte space
 * (non-sRGB DXT + RGBA Image, `colorSpaceConversion: none`). Matches the
 * validated lab; avoids mixing sRGB-sampled DXT with raw RGBA costRing/badge.
 * (Unity `m_ColorSpace=1` bytes are stored as-is, not linearized mid-bake.)
 * `v2`: canvas Y-flip for RGBA (ImageBitmap ignores UNPACK_FLIP_Y).
 */
export const CLIENT_FACE_TONE_ID = "display-bytes-v2";

/**
 * DECISION (2026-11-21): la face catalogue est composée sur CPU
 * (`extract/composeClientFace.ts`) — décodeur BC1/BC3 conforme
 * (`src/lib/unity/bcn.ts`), réduction Lanczos3, fusion `over` du shader
 * d'origine. Remplace le bake WebGL/Chrome (`"gpu"`) et l'aplat CPU au
 * décodeur unity-js-tools (`"cpu"`, tramé) : tout autre identifiant est
 * périmé et rebaké. v2 (2026-11-22) : calques `layer.*.webp` réduits par le
 * même Lanczos3 que la face. Voir docs/backlog/2026-11-21-fw-faces-sans-gpu.md.
 */
export const CLIENT_FACE_BAKE_ID = "cpu-lanczos-v2";

/**
 * DECISION: pastille draw size inside Cost_0N holes (~36 px diam on atlas).
 * Source is `CostFrame_*` (~89 px opaque); native blit overfills. 20 was
 * undersized vs Bandai aplat (~fillR 8 vs 9 @ 733); 24 ≈ ⅔ hole, matches
 * Bandai without swallowing the chrome lip (30 overshot).
 */
export const COST_FILL_DRAW_SIZE = 24;

/**
 * DECISION: Frost cost-disc slot edge used for on-card scale
 * (`frostDiam / fillSize`). Not `CostFrame_*.m_Width` (226).
 */
export const FROST_COST_FILL_SLOT = 32;

/** DECISION: soft edge when isolating Cost_01 from atlas fluff. */
export const COST_RING_DISC_FEATHER = 1.25;

/**
 * DECISION: 4× supersample + lanczos minify for pasteSprite *and* for
 * baking the cost fill into Cost_0N (avoids locking stair-steps at drawSize²).
 */
export const PASTE_SPRITE_SUPERSAMPLE = 4;

/**
 * DECISION: opaque underlay for `art.client.webp` (shelf/grid). The live
 * app leaves Front holes see-through to the 3D scene (`_UseMainTex: 0`);
 * catalogue cannot. White matches print/energy plates better than black.
 */
export const CLIENT_FACE_UNDERLAY_RGBA = [255, 255, 255, 255] as const;

/**
 * DECISION: catalogue product inserts around the Frost material stack.
 * Actual per-card order comes from `frostCatalogueComposeOrder` (Material
 * Card gates). Fallback when no Card material: art then UI on top
 * (Front→Frame→text→costRing→badge). Never costRing under Middle.
 */
export const CLIENT_FACE_COMPOSE_ORDER = [
  "picture",
  "frame",
  "text",
  "costRing",
  "badge",
] as const;

/**
 * DECISION: Frost samples FrameTex at z=0 (under Middle) and z=2 (footer /
 * chrome over Middle). Slice 1 is empty in dumps. Catalogue keeps both.
 */
export const FRAME_ARRAY_SLICE_UNDER = 0;
export const FRAME_ARRAY_SLICE_OVER = 2;
/** @deprecated use FRAME_ARRAY_SLICE_UNDER */
export const FRAME_ARRAY_SLICE = 0;
export const FRAME_ARRAY_MIP = 0;

/**
 * Unity GraphicsFormat values observed for Card_*_Frame arrays (BC3/DXT5).
 * DECISION: gate decode on these until a fuller GraphicsFormat map lands.
 */
export const FRAME_ARRAY_DXT5_GRAPHICS = new Set([100, 101]);

/** Unity class ids (stable engine convention). */
export const UNITY_TEXTURE2D_CLASS = 28;
export const UNITY_TEXTURE2D_ARRAY_CLASS = 187;

export const FRAME_BUNDLE_NAME = "packdata_assets_card_frame.bundle";
