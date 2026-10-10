import type { LenticularPanelCrop } from "@/core/render/kayouLenticularArt";
import {
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3,
  KAYOU_LENTICULAR_PANEL_CROPS,
} from "@/core/render/kayouLenticularArt";

/**
 * Kayou lenticular families — one Foils-tab material + curated exemplar each.
 *
 * Heaven Scroll HR scans are portrait strips whose panels form a cols×rows
 * grid (2×2, 3×2, 3×1, 2×1). Multi-panel types use `kayouLenticular` (sprite
 * crop + tilt); single-panel types keep the house `flare` sheen.
 */
export type KayouLenticularTypeId =
  | "hr-2x2"
  | "hr-3x2"
  | "hr-3x1"
  | "hr-2x1"
  | "bp"
  | "mr"
  | "holo";

export type KayouLenticularType = {
  id: KayouLenticularTypeId;
  finish: KayouLenticularTypeId;
  labelFr: string;
  labelEn: string;
  exemplarPrintKey: string;
  shader: string;
  /** Lenticular panel grid on the scan (cols × rows). */
  panelCols: number;
  panelRows: number;
  /** Fixed attested crop profile — skips auto pixel detection when set. */
  lenticularCropProfile?: string | null;
  /** Wide TCG frame — overrides per-panel viewport inference when set. */
  landscapeFace?: boolean;
  /** Scan gutter trim inside each panel (320×450 reference). */
  panelCrop: LenticularPanelCrop;
};

const HEAVEN_SCROLL = "kayou:smritiheavenscrolls1";

export const KAYOU_LENTICULAR_TYPES: readonly KayouLenticularType[] = [
  {
    id: "hr-2x2",
    finish: "hr-2x2",
    labelFr: "HR — 2×2 (Heaven Scrolls)",
    labelEn: "HR — 2×2 (Heaven Scrolls)",
    exemplarPrintKey: `${HEAVEN_SCROLL}-nrss.hr.002`,
    shader: "kayouLenticular",
    panelCols: 2,
    panelRows: 2,
    panelCrop: KAYOU_LENTICULAR_PANEL_CROPS["2x2"],
    lenticularCropProfile: KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2,
    landscapeFace: true,
  },
  {
    id: "hr-3x2",
    finish: "hr-3x2",
    labelFr: "HR — 3×2 (Heaven Scrolls)",
    labelEn: "HR — 3×2 (Heaven Scrolls)",
    exemplarPrintKey: `${HEAVEN_SCROLL}-nrss.hr.005`,
    shader: "kayouLenticular",
    panelCols: 2,
    panelRows: 3,
    panelCrop: KAYOU_LENTICULAR_PANEL_CROPS["2x3"],
    lenticularCropProfile: KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3,
    landscapeFace: true,
  },
  {
    id: "hr-3x1",
    finish: "hr-3x1",
    labelFr: "HR — 3×1 (Heaven Scrolls)",
    labelEn: "HR — 3×1 (Heaven Scrolls)",
    exemplarPrintKey: `${HEAVEN_SCROLL}-nrss.hr.003`,
    shader: "kayouLenticular",
    panelCols: 1,
    panelRows: 3,
    panelCrop: KAYOU_LENTICULAR_PANEL_CROPS["1x3"],
  },
  {
    id: "hr-2x1",
    finish: "hr-2x1",
    labelFr: "HR — 2×1 (Heaven Scrolls)",
    labelEn: "HR — 2×1 (Heaven Scrolls)",
    exemplarPrintKey: `${HEAVEN_SCROLL}-nrss.hr.008`,
    shader: "kayouLenticular",
    panelCols: 1,
    panelRows: 2,
    panelCrop: KAYOU_LENTICULAR_PANEL_CROPS["1x2"],
  },
  {
    id: "bp",
    finish: "bp",
    labelFr: "BP — Battle Pass",
    labelEn: "BP — Battle Pass",
    exemplarPrintKey: "kayou:t4w4-nr.bp.022",
    shader: "flare",
    panelCols: 1,
    panelRows: 1,
    panelCrop: { left: 0, top: 0, right: 0, bottom: 0 },
  },
  {
    id: "mr",
    finish: "mr",
    labelFr: "MR",
    labelEn: "MR",
    exemplarPrintKey: "kayou:t2w3-nr.mr.016",
    shader: "flare",
    panelCols: 1,
    panelRows: 1,
    panelCrop: { left: 0, top: 0, right: 0, bottom: 0 },
  },
  {
    id: "holo",
    finish: "holo",
    labelFr: "Holo (SR / UR / SP…)",
    labelEn: "Holo (SR / UR / SP…)",
    exemplarPrintKey: "kayou:t25w1-nr.sr.037",
    shader: "flare",
    panelCols: 1,
    panelRows: 1,
    panelCrop: { left: 0, top: 0, right: 0, bottom: 0 },
  },
];

export const KAYOU_LENTICULAR_TYPE_IDS = KAYOU_LENTICULAR_TYPES.map(
  (row) => row.id,
);

export function kayouLenticularTypeForFinish(
  finish: string,
): KayouLenticularType | null {
  const wanted = finish.trim().toLowerCase().replace(/×/g, "x");
  return KAYOU_LENTICULAR_TYPES.find((row) => row.finish === wanted) ?? null;
}

export function kayouLenticularFinishShader(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of KAYOU_LENTICULAR_TYPES) {
    out[row.finish] = row.shader;
  }
  return out;
}
