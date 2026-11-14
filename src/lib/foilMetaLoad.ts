/**
 * Foil/pack JSON meta — **client-safe** (no `node:*`).
 *
 * Cache keys are paths relative to `data/` (stable across server + browser).
 * Server installs a filesystem reader via {@link installFoilMetaFileReader}
 * (`foilMetaLoad.server.ts`). Browser fills the cache with
 * {@link hydrateFoilMetaFromAssets}.
 */

export type FoilMetaFileReader = <T>(
  relativeUnderData: string,
  fallback: T,
) => T;

type MetaCache = Record<string, unknown>;

type FoilMetaFileWriter = (relativeUnderData: string, value: unknown) => void;

const g = globalThis as typeof globalThis & {
  __PLACARR_FOIL_META__?: MetaCache;
  __PLACARR_FOIL_META_READER__?: FoilMetaFileReader;
  __PLACARR_FOIL_META_WRITER__?: FoilMetaFileWriter;
  /** In-flight / completed browser hydrate — one fetch for every FoilCardImage. */
  __PLACARR_FOIL_META_HYDRATE__?: Promise<void>;
};

function cache(): MetaCache {
  if (!g.__PLACARR_FOIL_META__) g.__PLACARR_FOIL_META__ = {};
  return g.__PLACARR_FOIL_META__;
}

/** Logical keys under `data/` (must match disk layout + hydrate URLs). */
export const FOIL_META_KEYS = {
  materialSheets: "pokemon/foil/materialSheets.json",
  textureFlags: "pokemon/foil/textureFlags.json",
  sharedMotifs: "pokemon/foil/shared-motifs.json",
  fragStems: "pokemon/foil/frag-stems.json",
  lorcanaManifest: "lorcana/foil/manifest.json",
  lorcanaWebRecipes: "lorcana/foil/web/recipes.json",
  liveFoilMasks: "pokemon/liveFoilMasks.json",
  liveOwned: "pokemon/liveOwned.json",
  reprintMeta: "pokemon/reprintMeta.json",
  lorcanaCardsIndex: "lorcana/cards-index.json",
} as const;

/** Shape written by dumpWeb / consumed by holoShader + cssRecipes. */
export type LorcanaWebRecipesMeta = {
  version?: number;
  looks?: Record<
    string,
    {
      backgroundImage: string;
      backgroundRepeat?: string;
      backgroundSize?: string;
      backgroundPosition?: string;
      backgroundBlendMode?: string;
      mixBlendMode?: string;
      opacity?: number;
      filter?: string;
    }
  >;
  finishMap?: Record<string, string>;
  varnishMap?: Record<string, string>;
};

export function installFoilMetaFileReader(reader: FoilMetaFileReader): void {
  g.__PLACARR_FOIL_META_READER__ = reader;
}

export function readDataJsonSync<T>(relativeUnderData: string, fallback: T): T {
  const hit = cache()[relativeUnderData];
  if (hit !== undefined) return hit as T;

  const reader = g.__PLACARR_FOIL_META_READER__;
  if (reader) {
    const parsed = reader(relativeUnderData, fallback);
    cache()[relativeUnderData] = parsed as unknown;
    return parsed;
  }
  return fallback;
}

/** Server/scripts: write + refresh cache (no-op reader required for mkdir). */
export function writeDataJsonSync(
  relativeUnderData: string,
  value: unknown,
): void {
  const writer = g.__PLACARR_FOIL_META_WRITER__;
  if (!writer) {
    throw new Error(
      "foil meta writer not installed — import @/lib/foilMetaLoad.server",
    );
  }
  writer(relativeUnderData, value);
  cache()[relativeUnderData] = value as unknown;
}

export function installFoilMetaFileWriter(writer: FoilMetaFileWriter): void {
  g.__PLACARR_FOIL_META_WRITER__ = writer;
}

/** Clear in-memory cache (tests / post-write). */
export function resetFoilMetaCache(): void {
  g.__PLACARR_FOIL_META__ = {};
  g.__PLACARR_FOIL_META_HYDRATE__ = undefined;
}

/** Pack → cards-index path under `data/` (override when layout differs). */
const PACK_CARDS_INDEX_KEY: Record<string, string> = {
  lorcana: FOIL_META_KEYS.lorcanaCardsIndex,
};

/** Pack → foil manifest path under `data/`. */
const PACK_FOIL_MANIFEST_KEY: Record<string, string> = {
  lorcana: FOIL_META_KEYS.lorcanaManifest,
};

export function loadCardsIndexJson(pack: string) {
  const key = PACK_CARDS_INDEX_KEY[pack] ?? `${pack}/cards-index.json`;
  return readDataJsonSync(key, {
    version: 1 as const,
    pack,
    cards: {},
  });
}

export function loadFoilManifest(pack: string) {
  const key = PACK_FOIL_MANIFEST_KEY[pack] ?? `${pack}/foil/manifest.json`;
  return readDataJsonSync<Record<string, unknown>>(key, {});
}

/** Publisher CSS foil-inner dump (`dumpWeb` → recipes.json). */
export function loadLorcanaWebRecipes(): LorcanaWebRecipesMeta {
  return readDataJsonSync<LorcanaWebRecipesMeta>(
    FOIL_META_KEYS.lorcanaWebRecipes,
    { version: 1, looks: {}, finishMap: {}, varnishMap: {} },
  );
}

export function loadMaterialSheets() {
  return readDataJsonSync<Record<string, unknown>>(
    FOIL_META_KEYS.materialSheets,
    {},
  );
}

export function loadTextureFlags() {
  return readDataJsonSync<Record<string, unknown>>(
    FOIL_META_KEYS.textureFlags,
    {},
  );
}

export function loadSharedMotifs() {
  return readDataJsonSync<Record<string, Record<string, string>>>(
    FOIL_META_KEYS.sharedMotifs,
    {},
  );
}

export function loadFragStems(): string[] {
  const raw = readDataJsonSync<{ stems?: string[] } | string[]>(
    FOIL_META_KEYS.fragStems,
    { stems: [] },
  );
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw.stems) ? raw.stems : [];
}

export function loadLiveFoilMasks() {
  return readDataJsonSync<Record<string, string>>(
    FOIL_META_KEYS.liveFoilMasks,
    {},
  );
}

export function loadLiveOwned() {
  /*
    Always re-read: carddex sync and hand edits write the JSON on disk outside
    `writeDataJsonSync`, so a sticky meta cache kept Sovkipou as the SunLava
    hero after `byEffect` already pointed at Lugulabre.
  */
  delete cache()[FOIL_META_KEYS.liveOwned];
  return readDataJsonSync<unknown>(FOIL_META_KEYS.liveOwned, {
    bundles: [],
  });
}

export function loadReprintMeta() {
  return readDataJsonSync<Record<string, unknown>>(
    FOIL_META_KEYS.reprintMeta,
    {},
  );
}

/**
 * Pack-keyed hydrate table — add a row when a new effect pack ships foil meta.
 * Avoid pack `if` forks in {@link runFoilMetaHydrate}.
 */
type FoilMetaPackHydrate = {
  pack: string;
  /** API JSON field → cache key under `data/`. */
  apiFields: ReadonlyArray<{
    field: string;
    key: string;
    /** Wrap arrays (frag stems) into `{ stems }` for {@link loadFragStems}. */
    asStems?: boolean;
  }>;
  assetFallbacks: ReadonlyArray<{ key: string; url: string }>;
  afterHydrate?: () => Promise<void>;
};

const FOIL_META_PACK_HYDRATE: readonly FoilMetaPackHydrate[] = [
  {
    pack: "pokemon",
    apiFields: [
      { field: "liveFoilMasks", key: FOIL_META_KEYS.liveFoilMasks },
      { field: "liveOwned", key: FOIL_META_KEYS.liveOwned },
      { field: "reprintMeta", key: FOIL_META_KEYS.reprintMeta },
      { field: "materialSheets", key: FOIL_META_KEYS.materialSheets },
      { field: "textureFlags", key: FOIL_META_KEYS.textureFlags },
      { field: "sharedMotifs", key: FOIL_META_KEYS.sharedMotifs },
      { field: "fragStems", key: FOIL_META_KEYS.fragStems, asStems: true },
    ],
    assetFallbacks: [
      {
        key: FOIL_META_KEYS.materialSheets,
        url: "/assets/pokemon/materialSheets.json",
      },
      {
        key: FOIL_META_KEYS.textureFlags,
        url: "/assets/pokemon/textureFlags.json",
      },
      {
        key: FOIL_META_KEYS.sharedMotifs,
        url: "/assets/pokemon/shared-motifs.json",
      },
      {
        key: FOIL_META_KEYS.fragStems,
        url: "/assets/pokemon/frag-stems.json",
      },
    ],
    afterHydrate: async () => {
      try {
        const { invalidatePokemonFoilNamesCache } =
          await import("@/effects/pokemon/foilNames");
        invalidatePokemonFoilNamesCache();
      } catch {
        /* optional */
      }
      try {
        const { resetPaperMaterialCache } =
          await import("@/effects/pokemon/materials");
        resetPaperMaterialCache();
      } catch {
        /* server / circular */
      }
    },
  },
  {
    pack: "lorcana",
    apiFields: [
      { field: "cardsIndex", key: FOIL_META_KEYS.lorcanaCardsIndex },
      { field: "manifest", key: FOIL_META_KEYS.lorcanaManifest },
      { field: "webRecipes", key: FOIL_META_KEYS.lorcanaWebRecipes },
    ],
    assetFallbacks: [
      {
        key: FOIL_META_KEYS.lorcanaManifest,
        url: "/assets/lorcana/manifest.json",
      },
      {
        key: FOIL_META_KEYS.lorcanaWebRecipes,
        url: "/assets/lorcana/web/recipes.json",
      },
    ],
    afterHydrate: async () => {
      try {
        const { invalidateLorcanaFoilMetaDerived } =
          await import("@/effects/lorcana/foilMetaInvalidate");
        invalidateLorcanaFoilMetaDerived();
      } catch {
        /* optional */
      }
    },
  },
];

async function runFoilMetaHydrate(
  fetchImpl: typeof fetch,
): Promise<void> {
  for (const entry of FOIL_META_PACK_HYDRATE) {
    try {
      const res = await fetchImpl(
        `/api/admin/foil-meta?pack=${encodeURIComponent(entry.pack)}`,
      );
      if (res.ok) {
        const body = (await res.json()) as Record<string, unknown>;
        for (const field of entry.apiFields) {
          const value = body[field.field];
          if (value == null) continue;
          cache()[field.key] = field.asStems
            ? { stems: value }
            : value;
        }
      }
    } catch {
      /* optional */
    }
  }

  // Optional `/assets/` fallback when admin meta is unavailable.
  await Promise.all(
    FOIL_META_PACK_HYDRATE.flatMap((entry) => entry.assetFallbacks).map(
      async ({ key, url }) => {
        if (cache()[key] !== undefined) return;
        try {
          const res = await fetchImpl(url);
          if (!res.ok) return;
          cache()[key] = await res.json();
        } catch {
          /* keep fallback */
        }
      },
    ),
  );

  for (const entry of FOIL_META_PACK_HYDRATE) {
    if (entry.afterHydrate) await entry.afterHydrate();
  }
}

/**
 * Browser: pull meta JSON via `/api/admin/foil-meta` (session cookie).
 * `/assets/…` JSON remains optional fallback for non-admin surfaces.
 *
 * Deduped: every FoilCardImage mounts call this; only the first run fetches.
 * {@link resetFoilMetaCache} clears the latch (tests / post-write).
 */
export async function hydrateFoilMetaFromAssets(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (typeof window === "undefined") return;

  // Custom fetch (tests) always runs — do not latch onto the default singleton.
  if (fetchImpl !== fetch) {
    await runFoilMetaHydrate(fetchImpl);
    return;
  }

  if (!g.__PLACARR_FOIL_META_HYDRATE__) {
    g.__PLACARR_FOIL_META_HYDRATE__ = runFoilMetaHydrate(fetch).catch(
      (err) => {
        // Allow a later mount to retry after a hard failure.
        g.__PLACARR_FOIL_META_HYDRATE__ = undefined;
        throw err;
      },
    );
  }
  await g.__PLACARR_FOIL_META_HYDRATE__;
}
