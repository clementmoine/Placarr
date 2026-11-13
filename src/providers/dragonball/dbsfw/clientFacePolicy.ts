/**
 * Placarr decisions for Fusion World client-face flatten.
 * These are not Unity dump fields — keep them here with `DECISION:` comments,
 * not mixed with Frost / Texture2D geometry.
 */

/** DECISION: catalogue print aspect (physical 63×88), not Unity art 1:2. */
export const FW_PRINT_ASPECT = 63 / 88;

/**
 * DECISION: pastille draw size inside Cost_01 (~24 px hole). Source is
 * `CostFrame_*` (~89 px opaque); blitting native overfills.
 */
export const COST_FILL_DRAW_SIZE = 20;

/**
 * DECISION: Frost cost-disc slot edge used for on-card scale
 * (`frostDiam / fillSize`). Not `CostFrame_*.m_Width` (226).
 */
export const FROST_COST_FILL_SLOT = 32;

/** DECISION: soft edge when isolating Cost_01 from atlas fluff. */
export const COST_RING_DISC_FEATHER = 1.25;

/**
 * DECISION: 4× supersample + lanczos minify for pasteSprite *and* for
 * baking the cost fill into Cost_01 (avoids locking stair-steps at 20²).
 */
export const PASTE_SPRITE_SUPERSAMPLE = 4;

/**
 * DECISION: catalogue flatten stack (aplat WebP). Mirrors Frost sample
 * order loosely (Front→Frame→cost disc→Chara→CostNumber) without baking
 * the disc into `_FrameTex`.
 */
export const CLIENT_FACE_COMPOSE_ORDER = [
  "picture",
  "frame",
  "costRing",
  "text",
  "badge",
] as const;

/** DECISION: frame Texture2DArray — slice 0 mip0 only (other slices cut text). */
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
