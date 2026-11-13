/**
 * Client plates used to decorate catalogue faces.
 * They are masks and holo maps, not cards. The faces themselves live
 * under `/assets/dragonball/fw/cards/`.
 */

const ASSET = "/assets/dragonball/fw";

export type DbsFwClientRender = {
  id: string;
  label: string;
  /** First file is the face shown on the tile. */
  files: readonly string[];
  /** Client fragment under `/shaders/`. Absent rows stay a still plate. */
  shader?: "FrostCard.frag" | "UIHologram.frag";
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
};

export const DBS_FW_CLIENT_RENDERS: readonly DbsFwClientRender[] = [
  {
    id: "card",
    label: "Carte",
    shader: "FrostCard.frag",
    files: ["client-st01-020-card.webp"],
  },
  {
    id: "foil-holo",
    label: "Foil holo",
    shader: "FrostCard.frag",
    cardMask: "mask.webp",
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
    mask: "client-tabac-holo.webp",
    files: ["client-st01-004-para-front.webp", "client-tabac-holo.webp"],
  },
  {
    id: "energy-holo",
    label: "Energy holo",
    shader: "FrostCard.frag",
    mask: "client-energy-holo-map.webp",
    plate: "map",
    files: ["client-energy-holo-texture.webp", "client-energy-holo-map.webp"],
  },
  {
    id: "para",
    label: "Parallèle",
    shader: "FrostCard.frag",
    cardMask: "mask.webp",
    files: ["client-e-111-para-front.webp", "client-e-111-para-holo.webp"],
  },
  {
    id: "e106-para",
    label: "E-106 parallèle",
    shader: "FrostCard.frag",
    cardMask: "mask.webp",
    files: ["client-e-106-para-front.webp", "client-fw-e-106-para-holo.webp"],
  },
  {
    id: "superpara",
    label: "Super parallèle",
    shader: "FrostCard.frag",
    cardMask: "mask-ef-01.webp",
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
    id: "card-hologram",
    label: "CardHologram",
    shader: "FrostCard.frag",
    mask: "client-cardhologram.webp",
    plate: "map",
    files: ["client-cardhologram.webp"],
  },
  { id: "pakipaki", label: "PakipakiFoil", files: ["client-pakipakifoil.webp"] },
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
