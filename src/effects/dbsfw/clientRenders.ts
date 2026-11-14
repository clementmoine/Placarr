/**
 * Client plates used to decorate catalogue faces.
 * They are masks and holo maps, not cards. The faces themselves live
 * under `/assets/dragonball/fw/cards/`.
 */

const ASSET = "/assets/dragonball/fw";

export type DbsFwEffectsLayer = {
  /** `client-*.webp` under foil/textures — Frost `_EffectsLayer{N}Tex`. */
  tex: string;
  /** Optional motion plate under foil/textures (`_EffectsLayer{N}Motion`). */
  motion?: string;
  /**
   * Face-local mask basename (e.g. `mask-ef-01.webp`) resolved next to
   * {@link DbsFwClientRender.playroomFace} — Unity series ef_mask* that are
   * not in the shared premiumtex library (ef_mask04).
   */
  faceMotion?: string;
};

export type DbsFwPlayroomFace = {
  /** Path under `cards/en/` (e.g. `st01/004-p1`). */
  path: string;
  label: string;
};

export type DbsFwClientRender = {
  id: string;
  label: string;
  /** First file is the face shown on the tile. */
  files: readonly string[];
  /** Client fragment under `/shaders/`. Absent rows stay a still plate. */
  shader?: "FrostCard.frag" | "UIHologram.frag";
  /**
   * Catalogue print for FoilPlayroom — one distinct face per shader leaf
   * (never reuse the same ST01 seed across finishes).
   */
  playroomFace?: DbsFwPlayroomFace;
  /**
   * Plate applied over the catalogue print.
   * `mask` gates where the foil sits. `map` only steers the holo, so a
   * near-white pattern cannot replace the print.
   */
  mask?: string;
  plate?: "mask" | "map";
  /**
   * Mask file beside the catalogue print (`mask.webp`, `mask-ef-01.webp`).
   * The shader samples that file, not another card's plate.
   */
  cardMask?: string;
  /**
   * Optional Frost `_HoloMask` plate under `foil/textures/` when it must
   * differ from {@link cardMask} (FoilType stamp vs rainbow coverage).
   */
  holoPlate?: string;
  /**
   * Premiumtex / VFX plates packed into `_EffectsLayersTex` (2D array).
   * Count must match the recipe `EFFECTS_LAYER_COUNT`.
   */
  effectsLayers?: readonly DbsFwEffectsLayer[];
};

/** Absolute `/assets/…/art.client.webp` for a playroom face path. */
export function dbsFwPlayroomFaceUrl(path: string): string {
  return `${ASSET}/cards/en/${path.replace(/^\/+|\/+$/g, "")}/art.client.webp`;
}

/** Absolute `/assets/…/<face>/<file>` beside a playroom print. */
export function dbsFwPlayroomFaceFileUrl(path: string, file: string): string {
  const face = path.replace(/^\/+|\/+$/g, "");
  return `${ASSET}/cards/en/${face}/${file.replace(/^\/+/, "")}`;
}

export const DBS_FW_CLIENT_RENDERS: readonly DbsFwClientRender[] = [
  {
    id: "card",
    label: "Carte",
    shader: "FrostCard.frag",
    playroomFace: { path: "st01/020", label: "ST01-020 · branché" },
    files: ["client-st01-020-card.webp"],
  },
  {
    id: "foil-holo",
    label: "Foil holo",
    shader: "FrostCard.frag",
    playroomFace: { path: "st01/004-p1", label: "ST01-004 P1 · branché" },
    // FoilType 2 stamps gold from FoilMask R/G — mask.webp is near-full gray
    // and floods the plate yellow; mask-foil is the channel-packed stamp.
    cardMask: "mask-foil.webp",
    // Character-shaped grey plate. Frost does `1.0 - HoloMask.x` (dark → strong).
    holoPlate: "client-st01-004-para-holo.webp",
    // Card Foil_holo dump: EFFECTS_LAYER_COUNT_ZERO — no premiumtex layer.
    files: [
      "client-st01-004-para-front.webp",
      "client-st01-004-para-holo.webp",
      "client-st01-004-para-holo-field.webp",
      "client-st01-004-para-foil-en.webp",
    ],
  },
  {
    id: "tabac-holo",
    label: "Tabac holo",
    shader: "FrostCard.frag",
    playroomFace: {
      path: "fs02/15-para-1an",
      label: "FS02-15 PARA · branché",
    },
    mask: "client-tabac-holo.webp",
    // Card Tabac_holo dump: Layer1Tex=uv_pattern00, Motion=ef_mask01.
    effectsLayers: [
      { tex: "client-uv-pattern00.webp", motion: "client-ef-mask01.webp" },
    ],
    files: ["client-st01-004-para-front.webp", "client-tabac-holo.webp"],
  },
  {
    id: "energy-holo",
    label: "Energy holo",
    shader: "FrostCard.frag",
    playroomFace: { path: "fs09/03", label: "FS09-03 · branché" },
    mask: "client-energy-holo-map.webp",
    plate: "map",
    files: ["client-energy-holo-texture.webp", "client-energy-holo-map.webp"],
  },
  {
    id: "para",
    label: "Parallèle",
    shader: "FrostCard.frag",
    playroomFace: { path: "e/111-p1", label: "E-111 P1 · branché" },
    // E-111 Unity dump is Front+Holo only (Card/CardFIeld, no mask-foil).
    // Frost does `1.0 - HoloMask.x` — the raw Holo plate is sparse white on
    // black (foil accents); feed the inverted plate so black bg stays matte.
    holoPlate: "client-e-111-para-holomask.webp",
    files: ["client-e-111-para-front.webp", "client-e-111-para-holo.webp"],
  },
  {
    id: "e106-para",
    label: "E-106 parallèle",
    shader: "FrostCard.frag",
    // Materials-only PARA (no series bundle). Front+Holo like E-111 — Frost
    // does `1.0 - HoloMask.x`, so bind the inverted sibling plate.
    playroomFace: { path: "e/106-p1", label: "E-106 P1 · branché" },
    holoPlate: "client-fw-e-106-para-holomask.webp",
    files: ["client-e-106-para-front.webp", "client-fw-e-106-para-holo.webp"],
  },
  {
    id: "superpara",
    label: "Super parallèle",
    shader: "FrostCard.frag",
    playroomFace: {
      path: "fb01/139-superpara",
      label: "FB01-139 SUPERPARA · branché",
    },
    cardMask: "mask-ef-01.webp",
    effectsLayers: [
      { tex: "client-uv-shine.webp" },
      { tex: "client-ef-flash01.webp" },
    ],
    files: [
      "client-fb01-139-superpara-front.webp",
      "client-fb01-139-superpara-foil-en.webp",
      "client-ef-mask00.webp",
      "client-ef-mask01.webp",
      "client-ef-mask02.webp",
      "client-ef-mask03.webp",
      "client-ef-mask02-cf.webp",
      "client-ef-mask03-cf.webp",
    ],
  },
  {
    id: "effects-uv-shine",
    label: "Effects · uv_shine",
    shader: "FrostCard.frag",
    playroomFace: {
      path: "fb10/095-para-lp-cs27-2",
      label: "FB10-095 PARA · branché",
    },
    // No FoilMask — showcase the premiumtex layer alone (FoilType 0).
    // Omit motion → tex reused as motion (α=1 gate). Tabac dump uses
    // ef_mask01 motion; solo demos keep a full-alpha gate so the plate shows.
    effectsLayers: [{ tex: "client-uv-shine.webp" }],
    files: ["client-uv-shine.webp"],
  },
  {
    id: "effects-ef-flash",
    label: "Effects · ef_flash01",
    shader: "FrostCard.frag",
    playroomFace: { path: "fb11/088-p1", label: "FB11-088 P1 · branché" },
    effectsLayers: [{ tex: "client-ef-flash01.webp" }],
    files: ["client-ef-flash01.webp"],
  },
  {
    id: "effects-uv-rainbow",
    label: "Effects · uv_line_rainbow",
    shader: "FrostCard.frag",
    // FB02-036_front Card dump (COUNT_FIVE). L1=uv_line_rainbow; Holo off —
    // stack scrolls via `_Time`+motion (lean→time phase in the WebGL renderer).
    playroomFace: {
      path: "fb02/036",
      label: "FB02-036 · branché",
    },
    effectsLayers: [
      { tex: "client-uv-line-rainbow.webp", faceMotion: "mask-ef-01.webp" },
      { tex: "client-uv-line1.webp", faceMotion: "mask-ef-01.webp" },
      { tex: "client-ef-ocian.webp", faceMotion: "mask-ef-02.webp" },
      { tex: "client-uv-pattern00.webp", faceMotion: "mask-ef-03.webp" },
      { tex: "client-ef-ocian.webp", faceMotion: "mask-ef-04.webp" },
    ],
    files: [
      "client-uv-line-rainbow.webp",
      "client-uv-line1.webp",
      "client-ef-ocian.webp",
      "client-uv-pattern00.webp",
    ],
  },
  {
    id: "card-hologram",
    label: "CardHologram",
    shader: "FrostCard.frag",
    playroomFace: { path: "st01/001", label: "ST01-001 · branché" },
    mask: "client-cardhologram.webp",
    plate: "map",
    files: ["client-cardhologram.webp"],
  },
  {
    id: "pakipaki",
    label: "PakipakiFoil",
    shader: "FrostCard.frag",
    playroomFace: {
      path: "fb02/086-para-1anv",
      label: "FB02-086 PARA · branché",
    },
    cardMask: "mask-foil.webp",
    files: ["client-pakipakifoil.webp"],
  },
  // UIHologram.frag is a UI badge shader (mask α × _Color shimmer) — not
  // Frost/Card. Tabac plate is fully opaque α, so binding it as a "card"
  // finish painted a solid gold rectangle. Keep as plate inventory.
  { id: "ui-hologram", label: "UIHologram", files: ["client-tabac-holo.webp"] },
  { id: "frame-mask", label: "CardFrameMask", files: ["client-cardframemask.webp"] },
  { id: "holo-map", label: "HoloMap", files: ["client-holomap.webp"] },
  { id: "holo-map-para", label: "HoloMap PARA", files: ["client-holomap-para.webp"] },
  { id: "holo-rainbow", label: "HoloRainbow", files: ["client-holorainbow.webp"] },
  { id: "holo-map-main", label: "HoloMap main", files: ["client-holomap-main.webp"] },
  { id: "holo-map-main-2", label: "HoloMap main 2", files: ["client-holomap-main2.webp"] },
  { id: "holo-map-main-3", label: "HoloMap main 3", files: ["client-holomap-main3.webp"] },
  { id: "ef-mask-00", label: "ef_mask00", files: ["client-ef-mask00.webp"] },
  { id: "ef-mask-01", label: "ef_mask01", files: ["client-ef-mask01.webp"] },
  { id: "ef-mask-02", label: "ef_mask02", files: ["client-ef-mask02.webp"] },
  { id: "ef-mask-03", label: "ef_mask03", files: ["client-ef-mask03.webp"] },
  { id: "ef-mask-02-cf", label: "ef_mask02_CF", files: ["client-ef-mask02-cf.webp"] },
  { id: "ef-mask-03-cf", label: "ef_mask03_CF", files: ["client-ef-mask03-cf.webp"] },
];

export function dbsFwClientRenderUrl(file: string): string {
  return `${ASSET}/textures/${file}`;
}
