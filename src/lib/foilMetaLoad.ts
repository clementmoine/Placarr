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
  liveFoilMasks: "pokemon/liveFoilMasks.json",
  liveOwned: "pokemon/liveOwned.json",
  reprintMeta: "pokemon/reprintMeta.json",
  lorcanaCardsIndex: "lorcana/cards-index.json",
} as const;

export function installFoilMetaFileReader(reader: FoilMetaFileReader): void {
  g.__PLACARR_FOIL_META_READER__ = reader;
}

export function readDataJsonSync<T>(
  relativeUnderData: string,
  fallback: T,
): T {
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

/** Clear in-memory cache (tests). */
export function resetFoilMetaCache(): void {
  g.__PLACARR_FOIL_META__ = {};
}

export function loadCardsIndexJson(pack: string) {
  const key =
    pack === "lorcana"
      ? FOIL_META_KEYS.lorcanaCardsIndex
      : `${pack}/cards-index.json`;
  return readDataJsonSync(key, {
    version: 1 as const,
    pack,
    cards: {},
  });
}

export function loadFoilManifest(pack: string) {
  const key =
    pack === "lorcana"
      ? FOIL_META_KEYS.lorcanaManifest
      : `${pack}/foil/manifest.json`;
  return readDataJsonSync<Record<string, unknown>>(key, {});
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
 * Browser: pull meta JSON via `/api/admin/foil-meta` (session cookie).
 * `/assets/…` JSON remains optional fallback for non-admin surfaces.
 */
export async function hydrateFoilMetaFromAssets(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const res = await fetchImpl("/api/admin/foil-meta?pack=pokemon");
    if (res.ok) {
      const body = (await res.json()) as {
        liveFoilMasks?: Record<string, string>;
        liveOwned?: unknown;
        reprintMeta?: Record<string, unknown>;
        materialSheets?: Record<string, unknown>;
        textureFlags?: Record<string, unknown>;
        sharedMotifs?: Record<string, Record<string, string>>;
        fragStems?: string[];
      };
      if (body.liveFoilMasks) {
        cache()[FOIL_META_KEYS.liveFoilMasks] = body.liveFoilMasks;
      }
      if (body.liveOwned) {
        cache()[FOIL_META_KEYS.liveOwned] = body.liveOwned;
      }
      if (body.reprintMeta) {
        cache()[FOIL_META_KEYS.reprintMeta] = body.reprintMeta;
      }
      if (body.materialSheets) {
        cache()[FOIL_META_KEYS.materialSheets] = body.materialSheets;
      }
      if (body.textureFlags) {
        cache()[FOIL_META_KEYS.textureFlags] = body.textureFlags;
      }
      if (body.sharedMotifs) {
        cache()[FOIL_META_KEYS.sharedMotifs] = body.sharedMotifs;
      }
      if (body.fragStems) {
        cache()[FOIL_META_KEYS.fragStems] = { stems: body.fragStems };
      }
    }
  } catch {
    /* optional */
  }

  try {
    const res = await fetchImpl("/api/admin/foil-meta?pack=lorcana");
    if (res.ok) {
      const body = (await res.json()) as {
        cardsIndex?: unknown;
        manifest?: Record<string, unknown>;
      };
      if (body.cardsIndex) {
        cache()[FOIL_META_KEYS.lorcanaCardsIndex] = body.cardsIndex;
      }
      if (body.manifest) {
        cache()[FOIL_META_KEYS.lorcanaManifest] = body.manifest;
      }
    }
  } catch {
    /* optional */
  }

  // Optional `/assets/` fallback when admin meta is unavailable.
  await Promise.all(
    [
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
      {
        key: FOIL_META_KEYS.lorcanaManifest,
        url: "/assets/lorcana/manifest.json",
      },
    ].map(async ({ key, url }) => {
      if (cache()[key] !== undefined) return;
      try {
        const res = await fetchImpl(url);
        if (!res.ok) return;
        cache()[key] = await res.json();
      } catch {
        /* keep fallback */
      }
    }),
  );

  try {
    const { invalidatePokemonFoilNamesCache } = await import(
      "@/effects/pokemon/foilNames"
    );
    invalidatePokemonFoilNamesCache();
  } catch {
    /* optional */
  }

  try {
    const { resetPaperMaterialCache } = await import(
      "@/effects/pokemon/materials"
    );
    resetPaperMaterialCache();
  } catch {
    /* server / circular */
  }
}
