/**
 * Fusion World effect pack — sleeve back, house foil on the shelf, and the
 * client shader in the Rendu tab.
 *
 * The face is the flattened client card. Illustration, frame and text are
 * separate layers the shader stacks, so the shine sits on the picture and
 * the text stays above it. A missing layer stays transparent. Bandai does not publish
 * a sleeve back; the verso is the Masters 7-ball image (see curated/BACK.md).
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";
import type { FoilMaterial, FoilTextureBinding } from "@/core/render/foil/types";
import type { PlayroomArt } from "@/effects/pokemon/playroomArt";

import {
  dbsFwKnownMaskUrl,
  dbsFwLayerSurfaces,
  dbsFwMasksReady,
} from "@/providers/dragonball/dbsfw/masks";

import { DBS_FW_CARD_COLORS, DBS_FW_CARD_FLOATS } from "./cardSheet";
import {
  DBS_FW_CLIENT_RENDERS,
  dbsFwClientRenderUrl,
  type DbsFwClientRender,
} from "./clientRenders";

export const DBS_FW_EFFECT_PACK_ID = "dbs-fw";

const ASSET_BASE = "/assets/dragonball/fw";

export const DBS_FW_FULL_FOIL_MASK_URL = `${ASSET_BASE}/full_foil_mask.webp`;

const FINISH_SHADER: Record<string, string> = {
  foil: "flare",
};

export const DBS_FW_FINISHES = Object.keys(FINISH_SHADER);

const rendersById = new Map(DBS_FW_CLIENT_RENDERS.map((row) => [row.id, row]));

/**
 * Client faces when the bundle had one. A parallel with no client texture
 * keeps the scan; the layer slots then stay empty and the scan shows through.
 */
const CATALOGUE_FACES: readonly { url: string; label: string }[] = [
  {
    url: `${ASSET_BASE}/cards/en/sb02/024/art.client.webp`,
    label: "SB02-024",
  },
  {
    url: `${ASSET_BASE}/cards/en/sb02/024-p1/art.dbscards.webp`,
    label: "SB02-024 P1",
  },
  {
    url: `${ASSET_BASE}/cards/en/st01/001/art.client.webp`,
    label: "ST01-001",
  },
  {
    url: `${ASSET_BASE}/cards/en/fb01/001/art.client.webp`,
    label: "FB01-001",
  },
];

function maskForFace(row: DbsFwClientRender, faceUrl: string): string | null {
  if (row.cardMask) {
    return dbsFwMasksReady()
      ? dbsFwKnownMaskUrl(faceUrl, row.cardMask)
      : null;
  }
  return row.mask ? dbsFwClientRenderUrl(row.mask) : null;
}

function artsFor(name: string): PlayroomArt[] {
  const row = rendersById.get(name.trim().toLowerCase());
  if (!row?.shader) return [];
  return CATALOGUE_FACES.map((face) => {
    const maskUrl = maskForFace(row, face.url);
    return {
      imageUrl: face.url,
      label: `${face.label} · ${row.label}`,
      ...(maskUrl ? { maskUrl } : {}),
    };
  });
}

const PLATE = (file: string): FoilTextureBinding => ({ file });

function clientMaterial(row: DbsFwClientRender): FoilMaterial | null {
  if (!row.shader) return null;
  if (row.shader === "UIHologram.frag") {
    return {
      graph: "UIHologram",
      keywords: [],
      fragment: row.shader,
      webgl: true,
      textures: { _Mask: row.mask ? PLATE(row.mask) : { role: "art" } },
      floats: { ...DBS_FW_CARD_FLOATS, _Speed: 20, _Interval: 1 },
      colors: { ...DBS_FW_CARD_COLORS, _Color: [1, 0.92, 0.55, 1] },
    };
  }
  // A missing mask must not fall back to the photo, or the foil reads the
  // picture's red channel and washes the whole card. A `map` plate steers
  // the shine; binding it as coverage lets a near-white pattern replace
  // the print with the foil colour.
  const mask: FoilTextureBinding | null = row.cardMask
    ? { role: "foilMask" }
    : row.mask
      ? PLATE(row.mask)
      : null;
  const covers = mask != null && row.plate !== "map";
  // The face stays underneath. Illustration, frame and text stack on it
  // when those files load; a missing one stays transparent.
  return {
    graph: "Frost/Card",
    keywords: ["ARTWORK_ON"],
    fragment: row.shader,
    webgl: true,
    textures: {
      _MainTex: { role: "art" },
      _FrontTex: { role: "front" },
      _FrameTex: { role: "frame" },
      _CharaTex: { role: "ink" },
      ...(mask
        ? {
            _HoloMap: covers ? PLATE("client-holomap.webp") : mask,
            _RainbowTexture: PLATE("client-holorainbow.webp"),
            ...(covers
              ? { _HoloMask: mask, _MasksTex: mask, _FoilMask: mask }
              : {}),
          }
        : {}),
    },
    floats: {
      ...DBS_FW_CARD_FLOATS,
      _UseMainTex: 1,
      _UseFront: 1,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFrame2: 0,
      _UseChara: 1,
      _AlphaToMaskAvailable: 0,
      _HoloFoilEnabled: mask ? 1 : 0,
      _FoilType: covers ? DBS_FW_CARD_FLOATS._FoilType! : 0,
    },
    colors: DBS_FW_CARD_COLORS,
  };
}

export const dbsFwEffectPack = defineCatalogueOnlyPack({
  id: DBS_FW_EFFECT_PACK_ID,
  label: "Dragon Ball Super Card Game Fusion World",
  blurb: "Catalogue Bandai Fusion World — plaques du client dans Rendu",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/backs/en`,
  finishShader: FINISH_SHADER,
  fallbackFoilMaskUrl: DBS_FW_FULL_FOIL_MASK_URL,
  playroomArtForMaterial: (name) => artsFor(name)[0] ?? null,
});

dbsFwEffectPack.listMaterials = () =>
  DBS_FW_CLIENT_RENDERS.filter((row) => row.shader).map((row) => row.id);
dbsFwEffectPack.playroomArtsForMaterial = artsFor;
dbsFwEffectPack.material = (name) => {
  const row = rendersById.get(name.trim().toLowerCase());
  return row ? clientMaterial(row) : null;
};
dbsFwEffectPack.layerSurfaces = dbsFwLayerSurfaces;
const foilRow = rendersById.get("foil-holo");
dbsFwEffectPack.resolveMaterial = (finish) =>
  (finish ?? "").trim().toLowerCase() === "foil" && foilRow
    ? clientMaterial(foilRow)
    : null;
dbsFwEffectPack.resolveMaterialForPrint = (finish) =>
  dbsFwEffectPack.resolveMaterial(finish, null);
