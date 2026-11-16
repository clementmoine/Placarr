/**
 * Fusion World effect pack — sleeve back, house foil on the shelf, and the
 * client shader in the Rendu tab (same FoilPlayroom grid as Lorcana / Pokémon).
 *
 * Lorcana model: catalogue aplat `art.client.webp` for shelf/grid (CSS `flare`
 * when a real mask exists); WebGL Frost stacks `layer.*` on detail / playroom.
 * The white `full_foil_mask` is CSS-only — never bind Frost to a solid plate.
 *
 * Illustration, frame and text are separate layers the shader stacks, so the
 * shine sits on the picture and the text stays above it. A missing layer stays
 * transparent. Bandai does not publish a sleeve back; the verso is the Masters
 * 7-ball image (see curated/BACK.md).
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";
import type {
  FoilMaterial,
  FoilTextureBinding,
} from "@/core/render/foil/types";
import type { PlayroomArt } from "@/effects/pokemon/playroomArt";
import { frostCardFragmentForKeywords } from "@/lib/unity/frostCardVariants";

import {
  dbsFwKnownCoverageMaskUrl,
  dbsFwLayerSurfaces,
  dbsFwMasksReady,
} from "@/providers/dragonball/dbsfw/masks";

import { DBS_FW_CARD_COLORS, DBS_FW_CARD_FLOATS } from "./cardSheet";
import {
  DBS_FW_CLIENT_RENDERS,
  dbsFwClientRenderUrl,
  dbsFwPlayroomFaceFileUrl,
  dbsFwPlayroomFaceUrl,
  type DbsFwClientRender,
  type DbsFwEffectsLayer,
} from "./clientRenders";
import { dbsFwMaterialRecipe } from "./materialRecipes";
import { dbsFwFrostLeafForPrint } from "./frostLeaf";
import { DBS_FW_S3TC_BY_WEBP } from "./s3tcSidecars.generated";

export {
  dbsFwFrostLeafForPrint,
  dbsFwCatalogueFacePath,
  dbsFwFolderLooksParallel,
} from "./frostLeaf";

export const DBS_FW_EFFECT_PACK_ID = "dbs-fw";

const ASSET_BASE = "/assets/dragonball/fw";

export const DBS_FW_FULL_FOIL_MASK_URL = `${ASSET_BASE}/full_foil_mask.webp`;

/**
 * Solid full-face plate only — per-print `mask.webp` / `mask-*.webp` drive
 * WebGL. Matches Lorcana's `isCssOnlyFoilMask` gate in FoilCardImage.
 */
export function isDbsFwCssOnlyFoilMask(maskUrl: string): boolean {
  return maskUrl === DBS_FW_FULL_FOIL_MASK_URL;
}

const FINISH_SHADER: Record<string, string> = {
  foil: "flare",
};

export const DBS_FW_FINISHES = Object.keys(FINISH_SHADER);

const rendersById = new Map(DBS_FW_CLIENT_RENDERS.map((row) => [row.id, row]));

function maskForFace(row: DbsFwClientRender, faceUrl: string): string | null {
  if (row.cardMask) {
    if (!dbsFwMasksReady()) return null;
    const catalogue = dbsFwKnownCoverageMaskUrl(faceUrl, row.cardMask);
    if (catalogue) return catalogue;
    // Index ready but this print has no coverage file — last resort for
    // card-specific leaves that also carry a sparse Unity Holo plate.
    return row.holoPlate ? dbsFwClientRenderUrl(row.holoPlate) : null;
  }
  if (row.mask) return dbsFwClientRenderUrl(row.mask);
  // Para-style leaves: Holo plate doubles as the playroom mask URL so the
  // tile never pulls full_foil_mask (white) while waiting on catalogue files.
  return row.holoPlate ? dbsFwClientRenderUrl(row.holoPlate) : null;
}

function artsFor(name: string): PlayroomArt[] {
  const row = rendersById.get(name.trim().toLowerCase());
  if (!row) return [];

  if (!row.shader) return [];

  const face = row.playroomFace;
  if (!face) return [];
  const imageUrl = dbsFwPlayroomFaceUrl(face.path);
  const maskUrl = maskForFace(row, imageUrl);
  return [
    {
      imageUrl,
      label: face.label,
      ...(maskUrl ? { maskUrl } : {}),
      liveOwned: true,
    },
  ];
}

/** Plate file under `foil/textures/` — attach Mac DXT sidecar when extracted. */
const PLATE = (file: string): FoilTextureBinding => {
  const s3tc = DBS_FW_S3TC_BY_WEBP[file];
  return s3tc ? { file, s3tc } : { file };
};

function effectsLayerPlate(
  layer: DbsFwEffectsLayer,
  kind: "tex" | "motion",
  facePath?: string,
): FoilTextureBinding {
  if (kind === "tex") return PLATE(layer.tex);
  if (layer.faceMotion && facePath) {
    return { file: dbsFwPlayroomFaceFileUrl(facePath, layer.faceMotion) };
  }
  return layer.motion ? PLATE(layer.motion) : PLATE(layer.tex);
}

function effectsArrayBinding(
  layers: readonly DbsFwEffectsLayer[],
  kind: "tex" | "motion",
  facePath?: string,
): FoilTextureBinding | null {
  if (layers.length === 0) return null;
  return {
    arrayLayers: layers.map((layer) =>
      effectsLayerPlate(layer, kind, facePath),
    ),
  };
}

/**
 * Bind both packed `sampler2DArray` slots (post-`packFrostEffectsLayers`) and
 * legacy `_EffectsLayerN{Tex,Motion}` 2D names so either shipped frag works.
 */
function effectsTextureBindings(
  layers: readonly DbsFwEffectsLayer[],
  facePath?: string,
): Record<string, FoilTextureBinding> {
  if (layers.length === 0) return {};
  const out: Record<string, FoilTextureBinding> = {};
  const texArray = effectsArrayBinding(layers, "tex", facePath);
  const motionArray =
    effectsArrayBinding(layers, "motion", facePath) ?? texArray;
  if (texArray) out._EffectsLayersTex = texArray;
  if (motionArray) out._EffectsLayersMotion = motionArray;
  layers.forEach((layer, i) => {
    const n = i + 1;
    out[`_EffectsLayer${n}Tex`] = effectsLayerPlate(layer, "tex", facePath);
    out[`_EffectsLayer${n}Motion`] = effectsLayerPlate(
      layer,
      "motion",
      facePath,
    );
  });
  return out;
}

type ClientMaterialOpts = {
  /**
   * Catalogue product path: bind FoilMask/HoloMask via roles (per-print
   * URLs from FoilCardImage / layerSurfaces) and keep `_UseMainTex: 0`
   * like Unity when Front/Frame/Chara are stacked. Playroom keeps seed
   * plates (ST01 holo, inverted PARA holomask, …).
   */
  catalogue?: boolean;
};

function clientMaterial(
  row: DbsFwClientRender,
  opts?: ClientMaterialOpts,
): FoilMaterial | null {
  if (!row.shader) return null;
  const recipe = dbsFwMaterialRecipe(row.id);
  const catalogue = Boolean(opts?.catalogue);
  if (row.shader === "UIHologram.frag") {
    return {
      graph: "UIHologram",
      keywords: [...(recipe?.keywords ?? [])],
      fragment: row.shader,
      webgl: true,
      textures: { _Mask: row.mask ? PLATE(row.mask) : { role: "art" } },
      floats: {
        ...DBS_FW_CARD_FLOATS,
        ...(recipe?.floats ?? { _Speed: 20, _Interval: 1 }),
      },
      colors: { ...DBS_FW_CARD_COLORS, _Color: [1, 0.92, 0.55, 1] },
    };
  }
  // A missing mask must not fall back to the photo, or the foil reads the
  // picture's red channel and washes the whole card. A `map` plate steers
  // the shine; binding it as coverage lets a near-white pattern replace
  // the print with the foil colour.
  // FoilMask stays `role: foilMask` when cardMask is set — the playroom
  // must pass a sparse catalogue/holo URL (see maskForFace). Binding the
  // grey holo plate as FoilMask (foil-holo) floods FoilType 2 yellow again.
  // Catalogue: always role-bind FoilMask when the recipe stamps (FoilType>0)
  // or the leaf declares cardMask — never a shared ST01 holo plate.
  const foilType = recipe?.floats._FoilType ?? 0;
  const mask: FoilTextureBinding | null = catalogue
    ? foilType > 0 || row.cardMask
      ? { role: "foilMask" }
      : row.mask
        ? PLATE(row.mask)
        : null
    : row.cardMask
      ? { role: "foilMask" }
      : row.mask
        ? PLATE(row.mask)
        : null;
  // Catalogue HoloMask = per-print mask.webp via layerSurfaces; playroom
  // keeps dump plates (ST01 para-holo, inverted E-111, …).
  const holoCoverage: FoilTextureBinding | null = catalogue
    ? { role: "holoMask" }
    : row.holoPlate
      ? PLATE(row.holoPlate)
      : mask;
  const holoMode =
    recipe?.holo ??
    (mask != null || holoCoverage != null
      ? row.plate === "map"
        ? "map"
        : "covers"
      : false);
  const covers = holoMode === "covers";
  const layers = row.effectsLayers ?? [];
  const facePath = row.playroomFace?.path;
  const effectsTextures = effectsTextureBindings(layers, facePath);
  const keywords = [...(recipe?.keywords ?? ["ARTWORK_ON"])];
  // Keyword → FrostCard variant (COUNT_ONE/TWO/FIVE). Legacy `row.shader`
  // stays FrostCard.frag for ZERO; UIHologram is handled above.
  const fragment =
    row.shader === "FrostCard.frag"
      ? frostCardFragmentForKeywords(keywords)
      : row.shader;

  let holoMap: FoilTextureBinding | undefined;
  if (holoMode === "covers") {
    holoMap = recipe?.pakipakiPlate
      ? PLATE("client-pakipakifoil.webp")
      : PLATE("client-holomap.webp");
  } else if (holoMode === "map" && mask) {
    holoMap = mask;
  }
  if (recipe?.championshipPlate) {
    holoMap = PLATE("client-cardhologram.webp");
  }

  const coverage =
    holoCoverage ?? mask ?? (covers ? ({ role: "holoMask" } as const) : null);
  const holoTextures = holoMap
    ? {
        _HoloMap: holoMap,
        _RainbowTexture: PLATE("client-holorainbow.webp"),
        ...(covers && coverage
          ? {
              // FoilType stamps gold from FoilMask when >0; HoloMask.x gates
              // rainbow. Para has no FoilMask bind under FoilType 0.
              ...(mask ? { _FoilMask: mask } : {}),
              _HoloMask: coverage,
              _MasksTex: coverage,
            }
          : holoMode === "map" && mask
            ? { _HoloMask: mask, _MasksTex: mask }
            : holoMode === "map"
              ? {
                  // Unity unbound HoloMask is white (full rainbow).
                  _HoloMask: { role: "holoMask" },
                  _MasksTex: { role: "holoMask" },
                }
              : {}),
      }
    : {};

  // Effects demos + catalogue: Main off (Unity Front/Frame/Chara stack).
  // Other playroom leaves keep Main as a scan fallback when layers missing.
  const useMainTex =
    catalogue || recipe?.profile === "effects" || layers.length > 0 ? 0 : 1;

  return {
    graph: "Frost/Card",
    keywords,
    fragment,
    webgl: true,
    textures: {
      _MainTex: { role: "art" },
      _FrontTex: { role: "front" },
      // Catalogue: per-print `layer.middle.webp` via role. Playroom leaves that
      // reuse Middle for foil plates (pakipaki / championship) keep recipe binds
      // from holoTextures / effects — those spread after and win when set.
      ...(catalogue ? { _MiddleTex: { role: "middle" as const } } : {}),
      _FrameTex: { role: "frame" },
      _CharaTex: { role: "ink" },
      ...holoTextures,
      ...effectsTextures,
    },
    floats: {
      ...DBS_FW_CARD_FLOATS,
      ...(recipe?.floats ?? {
        _HoloFoilEnabled: mask || holoCoverage ? 1 : 0,
        _FoilType: covers ? DBS_FW_CARD_FLOATS._FoilType! : 0,
        EFFECTS_LAYER_COUNT: layers.length,
      }),
      _UseMainTex: useMainTex,
      _UseFront: 1,
      _UseFrame: 1,
      _UseFrame2: 0,
      _UseChara: 1,
      _AlphaToMaskAvailable: 0,
      // Catalogue: Middle plate is per-print (`layer.middle.webp`); missing →
      // transparent. Playroom keeps the Unity template gate.
      _ShowMiddleTex: catalogue
        ? 1
        : (recipe?.floats._ShowMiddleTex ?? 0),
    },
    colors: {
      ...DBS_FW_CARD_COLORS,
      ...(recipe?.colors
        ? Object.fromEntries(
            Object.entries(recipe.colors).map(([key, value]) => [
              key,
              [...value],
            ]),
          )
        : {}),
    },
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

dbsFwEffectPack.isCssOnlyFoilMask = isDbsFwCssOnlyFoilMask;

/** Frost/Card leaves only — shared plates bind into these, not as tiles. */
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
dbsFwEffectPack.resolveMaterialForPrint = (finish, _varnish, opts) => {
  if ((finish ?? "").trim().toLowerCase() !== "foil") return null;
  const leaf = dbsFwFrostLeafForPrint(opts?.printKey ?? null);
  const row = rendersById.get(leaf) ?? foilRow;
  // Per-print FoilMask/HoloMask roles + MainTex off (Unity stack).
  return row ? clientMaterial(row, { catalogue: true }) : null;
};
