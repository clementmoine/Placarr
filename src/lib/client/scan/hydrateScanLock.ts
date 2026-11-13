/**
 * Shared scan-lock hydration — QuickScan-parity barcode path + card print
 * lookup + owned inventory. Used by tray mini-cards, in-scanner review,
 * manual unrecognized sheet, and ItemModal prefill.
 */
import axios from "axios";

import { getCoverImage } from "@/core/collect/media";
import { buildBarcodePlaceholderItemName } from "@/core/collect/placeholderName";
import {
  isReceivablePresence,
  pickPreferredReceivableMatch,
  type ReceivableShelfItem,
} from "@/core/collect/receivableMatches";
import {
  guessShelfFromBarcodeLookup,
  shelfSearchHintsFromBarcodePayload,
} from "@/core/identify/query";
import { getMetadataPreview } from "@/lib/api/metadata";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import {
  suggestShelfForScan,
  type SuggestShelfRow,
} from "@/lib/collect/suggestShelfForScan";
import type { SessionLock } from "@/lib/client/scan/scanSession";
import type { MetadataResult } from "@/types/metadataProvider";

export type OwnedScanHit = {
  id: string;
  name: string;
  shelfId: string;
  shelfName: string | null;
  barcode: string | null;
  printKey: string | null;
  imageUrl: string | null;
  /** True when we scanned a barcode the owned copy is missing. */
  completable: boolean;
  /**
   * Absent copy — offer « Recevoir » instead of treating it as already on the shelf.
   */
  receivable: boolean;
  presence?: string | null;
  absenceReason?: string | null;
};

export type HydrateHit = {
  title: string;
  imageUrl: string | null;
  imageSource: "barcode" | "metadata" | "face" | "none";
  metadataPreview: MetadataResult | null;
};

export type HydratedScanLock = {
  lockId: string;
  kind: SessionLock["kind"];
  key: string;
  title: string;
  imageUrl: string | null;
  language: string | null;
  packId: string | null;
  shelfType: string | null;
  suggestedShelfId: string | null;
  shelfSure: boolean;
  owned: OwnedScanHit | null;
  hits: HydrateHit[];
  selectedHitIndex: number;
  status: "loading" | "ready" | "error";
  metadataPreview: MetadataResult | null;
  /**
   * Catalogue sealed resolve from barcode hydrate (sure skuKey, or doubt list).
   * Visual sealed locks use `kind: "sealed"` instead.
   */
  sealedSkuKey?: string | null;
  sealedHits?: Array<{
    productKey: string;
    packId: string;
    name: string;
    imageUrl: string | null;
  }>;
};

export type HydrateScanContext = {
  shelves: readonly SuggestShelfRow[];
  preferredShelfId?: string | null;
  pathname?: string | null;
  signal?: AbortSignal;
  /** Called as progressive cover/title updates land. */
  onProgress?: (partial: HydratedScanLock) => void;
};

export type OwnedApiItem = {
  id: string;
  name: string;
  shelfId: string;
  barcode?: string | null;
  printKey?: string | null;
  imageUrl?: string | null;
  presence?: string | null;
  absenceReason?: string | null;
  shelf?: { id: string; name: string } | null;
};

function emptyHydrated(lock: SessionLock): HydratedScanLock {
  return {
    lockId: lock.id,
    kind: lock.kind,
    key: lock.key,
    title: lock.label || lock.key,
    imageUrl: lock.faceUrl ?? null,
    language: lock.language ?? null,
    packId: lock.packId ?? null,
    shelfType:
      lock.kind === "card" || lock.kind === "sealed" ? "tcg" : null,
    suggestedShelfId: null,
    shelfSure: false,
    owned: null,
    hits: [],
    selectedHitIndex: 0,
    status: "loading",
    metadataPreview: null,
  };
}

function mapOwned(
  item: OwnedApiItem,
  scannedBarcode: string | null,
): OwnedScanHit {
  const receivable = isReceivablePresence(item.presence);
  return {
    id: item.id,
    name: item.name,
    shelfId: item.shelfId,
    shelfName: item.shelf?.name ?? null,
    barcode: item.barcode ?? null,
    printKey: item.printKey ?? null,
    imageUrl: item.imageUrl ?? null,
    completable:
      !receivable &&
      Boolean(scannedBarcode?.trim()) &&
      !item.barcode?.trim(),
    receivable,
    presence: item.presence ?? null,
    absenceReason: item.absenceReason ?? null,
  };
}

function asReceivableShelfItem(item: OwnedApiItem): ReceivableShelfItem {
  return {
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    printKey: item.printKey,
    presence: item.presence,
    absenceReason: item.absenceReason,
  };
}

async function fetchOwnedByBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<OwnedApiItem[]> {
  const { data } = await axios.get<OwnedApiItem[]>("/api/items", {
    params: { q: barcode, barcodeExact: "true", includeMetadata: "false" },
    signal,
  });
  return Array.isArray(data) ? data : [];
}

async function fetchOwnedByQuery(
  query: string,
  signal?: AbortSignal,
): Promise<OwnedApiItem[]> {
  if (!query.trim()) return [];
  const { data } = await axios.get<OwnedApiItem[]>("/api/items", {
    params: { q: query, includeMetadata: "false" },
    signal,
  });
  return Array.isArray(data) ? data : [];
}

/** Exported for unit tests — prefer receivable exact hits over plain owned. */
export function pickOwnedScanHit(
  exact: OwnedApiItem[],
  byTitle: OwnedApiItem[],
  scannedBarcode: string | null,
): OwnedScanHit | null {
  // Prefer an away/wanted copy when several share the barcode/print —
  // scanning the arrival of an order should offer Receive, not "already in".
  const receivableExact = pickPreferredReceivableMatch(
    exact.filter((item) => isReceivablePresence(item.presence)).map(
      asReceivableShelfItem,
    ),
  );
  if (receivableExact) {
    const full = exact.find((item) => item.id === receivableExact.id);
    if (full) return mapOwned(full, scannedBarcode);
  }
  if (exact[0]) return mapOwned(exact[0], scannedBarcode);
  const receivableTitle = pickPreferredReceivableMatch(
    byTitle
      .filter(
        (item) =>
          !item.barcode?.trim() && isReceivablePresence(item.presence),
      )
      .map(asReceivableShelfItem),
  );
  if (receivableTitle) {
    const full = byTitle.find((item) => item.id === receivableTitle.id);
    if (full) return mapOwned(full, scannedBarcode);
  }
  const titleOnly = byTitle.find((item) => !item.barcode?.trim());
  if (titleOnly) return mapOwned(titleOnly, scannedBarcode);
  return null;
}

async function hydrateBarcodeImages(
  hits: HydrateHit[],
  opts: {
    code: string;
    type: string | null;
    platform: string | null;
    shelfName: string | null;
    signal?: AbortSignal;
    onHit?: (index: number, hit: HydrateHit) => void;
  },
): Promise<HydrateHit[]> {
  const next = [...hits];
  await Promise.all(
    next.map(async (hit, index) => {
      if (!opts.type) return;
      try {
        const metadata = await getMetadataPreview(
          hit.title,
          opts.type,
          opts.code,
          opts.platform,
          opts.shelfName,
        );
        if (opts.signal?.aborted) return;
        const imageUrl = metadata ? getCoverImage({ metadata }) : null;
        const updated: HydrateHit = {
          ...hit,
          imageUrl: imageUrl || hit.imageUrl,
          imageSource: imageUrl ? "metadata" : hit.imageSource,
          metadataPreview: metadata || null,
        };
        next[index] = updated;
        opts.onHit?.(index, updated);
      } catch {
        // Keep barcode cover; progressive enrich is best-effort.
      }
    }),
  );
  return next;
}

async function hydrateBarcodeLock(
  lock: SessionLock,
  ctx: HydrateScanContext,
): Promise<HydratedScanLock> {
  const base = emptyHydrated(lock);
  const code = lock.key.trim();
  if (!code) {
    return { ...base, status: "ready", title: lock.note || lock.label || "—" };
  }

  ctx.onProgress?.(base);

  let payload: Record<string, unknown> = {};
  try {
    const params = new URLSearchParams({ q: code });
    const res = await axios.get(`/api/barcode?${params.toString()}`, {
      signal: ctx.signal,
    });
    payload = res.data || {};
  } catch {
    return {
      ...base,
      status: "error",
      title: buildBarcodePlaceholderItemName(code),
    };
  }

  if (ctx.signal?.aborted) return base;

  const sealed = payload.sealed as
    | {
        confidence?: string;
        productKey?: string;
        packId?: string;
        name?: string;
        imageUrl?: string | null;
        language?: string | null;
        hits?: Array<{
          productKey: string;
          packId: string;
          name: string;
          imageUrl: string | null;
        }>;
      }
    | null
    | undefined;

  const matches = (payload.matches as Array<{ name?: string; coverUrl?: string }> | undefined) || [];
  const resolvedShelfType =
    sealed?.confidence === "sure" || sealed?.confidence === "doubt"
      ? "tcg"
      : (payload.shelfType as string | undefined) || null;
  const platformKey = (payload.platformKey as string | undefined) || null;
  const hideBarcodeImage = resolvedShelfType === "games";

  let hits: HydrateHit[] =
    matches.length > 0
      ? matches.map((m) => ({
          title: m.name || code,
          imageUrl: hideBarcodeImage ? null : m.coverUrl || null,
          imageSource:
            m.coverUrl && !hideBarcodeImage ? ("barcode" as const) : ("none" as const),
          metadataPreview: null,
        }))
      : [
          {
            title:
              (payload.cleanName as string | undefined) ||
              (payload.displayName as string | undefined) ||
              buildBarcodePlaceholderItemName(code),
            imageUrl: null,
            imageSource: "none",
            metadataPreview: null,
          },
        ];

  // Surfacing sealed catalogue hits ahead of generic metadata matches.
  if (sealed?.confidence === "sure" && sealed.productKey) {
    hits = [
      {
        title: sealed.name || sealed.productKey,
        imageUrl: sealed.imageUrl || null,
        imageSource: sealed.imageUrl ? "face" : "none",
        metadataPreview: null,
      },
      ...hits,
    ];
  } else if (sealed?.confidence === "doubt" && sealed.hits?.length) {
    hits = [
      ...sealed.hits.map((row) => ({
        title: row.name || row.productKey,
        imageUrl: row.imageUrl || null,
        imageSource: (row.imageUrl ? "face" : "none") as HydrateHit["imageSource"],
        metadataPreview: null,
      })),
      ...hits,
    ];
  }

  const shelfHints = shelfSearchHintsFromBarcodePayload(payload || {});
  const searchNames = Array.from(
    new Set([
      ...shelfHints,
      ...(payload.cleanName ? [String(payload.cleanName)] : []),
      ...((payload.rawNames as string[] | undefined) || []),
      ...((payload.suggestions as string[] | undefined) || []),
      ...hits.map((h) => h.title),
    ]),
  ).filter(Boolean);

  const barcodeGuess =
    ctx.shelves.length > 0
      ? guessShelfFromBarcodeLookup({
          shelfType: resolvedShelfType,
          platformKey,
          searchNames,
          shelves: [...ctx.shelves],
          preferredShelfId: ctx.preferredShelfId ?? null,
        })
      : null;

  const suggestion = suggestShelfForScan({
    shelves: ctx.shelves,
    itemType: resolvedShelfType,
    pathname: ctx.pathname,
    preferredShelfId: ctx.preferredShelfId,
    searchNames,
    barcodeGuessShelfId: barcodeGuess?.shelfId ?? null,
  });

  const primary = hits[0]!;
  let current: HydratedScanLock = {
    ...base,
    title: primary.title,
    imageUrl: primary.imageUrl || lock.faceUrl || null,
    language: sealed?.language ?? base.language,
    packId: sealed?.packId ?? base.packId,
    shelfType: resolvedShelfType,
    suggestedShelfId: suggestion.shelfId,
    shelfSure: suggestion.confidence === "sure",
    hits,
    sealedSkuKey:
      sealed?.confidence === "sure" ? sealed.productKey ?? null : null,
    sealedHits:
      sealed?.confidence === "doubt" ? sealed.hits ?? [] : undefined,
    status: "loading",
  };
  ctx.onProgress?.(current);

  const ownedExact = await fetchOwnedByBarcode(code, ctx.signal).catch(() => []);
  const ownedTitle = await fetchOwnedByQuery(primary.title, ctx.signal).catch(
    () => [],
  );
  if (ctx.signal?.aborted) return current;

  current = {
    ...current,
    owned: pickOwnedScanHit(ownedExact, ownedTitle, code),
  };
  ctx.onProgress?.(current);

  const guessedShelf = ctx.shelves.find((s) => s.id === suggestion.shelfId);
  hits = await hydrateBarcodeImages(hits, {
    code,
    type: resolvedShelfType,
    platform: platformKey,
    shelfName: guessedShelf?.name ?? null,
    signal: ctx.signal,
    onHit: (index, hit) => {
      const nextHits = [...hits];
      nextHits[index] = hit;
      hits = nextHits;
      const selected = nextHits[current.selectedHitIndex] ?? nextHits[0]!;
      ctx.onProgress?.({
        ...current,
        hits: nextHits,
        title: selected.title,
        imageUrl: selected.imageUrl || current.imageUrl,
        metadataPreview: selected.metadataPreview,
      });
    },
  });

  const selected = hits[0]!;
  return {
    ...current,
    hits,
    title: selected.title,
    imageUrl: selected.imageUrl || current.imageUrl,
    metadataPreview: selected.metadataPreview,
    status: "ready",
  };
}

async function hydrateCardLock(
  lock: SessionLock,
  ctx: HydrateScanContext,
): Promise<HydratedScanLock> {
  const base = emptyHydrated(lock);
  const printKey = lock.key.trim();
  ctx.onProgress?.(base);

  const pack = cataloguePackInfo(lock.packId);
  const catalogueLabels = pack
    ? [pack.labelFr, pack.labelEn, pack.lineLabelFr, pack.lineLabelEn].filter(
        Boolean,
      )
    : [];

  const suggestion = suggestShelfForScan({
    shelves: ctx.shelves,
    itemType: "tcg",
    pathname: ctx.pathname,
    preferredShelfId: ctx.preferredShelfId,
    catalogueLabels,
  });

  let title = lock.label?.trim() || printKey;
  let imageUrl = lock.faceUrl ?? null;
  let metadataPreview: MetadataResult | null = null;

  try {
    const params = new URLSearchParams({
      printKey,
      type: "tcg",
    });
    if (lock.language) params.set("language", lock.language);
    const res = await axios.get(`/api/prints?${params.toString()}`, {
      signal: ctx.signal,
    });
    const candidate = res.data?.candidate as
      | {
          name?: string;
          title?: string;
          imageUrl?: string | null;
          coverUrl?: string | null;
        }
      | null
      | undefined;
    if (candidate) {
      title =
        candidate.name?.trim() ||
        candidate.title?.trim() ||
        title;
      imageUrl =
        candidate.imageUrl || candidate.coverUrl || imageUrl;
    }
  } catch {
    // Catalogue miss — keep printKey / face from identify.
  }

  if (ctx.signal?.aborted) return base;

  const ownedExact = await fetchOwnedByQuery(printKey, ctx.signal).catch(
    () => [],
  );
  const byPrint = ownedExact.filter(
    (item) =>
      item.printKey?.trim().toLowerCase() === printKey.toLowerCase() ||
      item.name.trim().toLowerCase() === printKey.toLowerCase(),
  );
  const ownedTitle =
    byPrint.length > 0
      ? []
      : await fetchOwnedByQuery(title, ctx.signal).catch(() => []);

  const owned = pickOwnedScanHit(
    byPrint.length > 0 ? byPrint : ownedExact.filter((i) => i.printKey),
    ownedTitle,
    null,
  );

  const hit: HydrateHit = {
    title,
    imageUrl,
    imageSource: imageUrl ? "face" : "none",
    metadataPreview,
  };

  return {
    ...base,
    title,
    imageUrl,
    shelfType: "tcg",
    suggestedShelfId: suggestion.shelfId,
    shelfSure: suggestion.confidence === "sure",
    owned,
    hits: [hit],
    metadataPreview,
    status: "ready",
  };
}

async function hydrateSealedLock(
  lock: SessionLock,
  ctx: HydrateScanContext,
): Promise<HydratedScanLock> {
  const base = emptyHydrated(lock);
  const skuKey = lock.key.trim();
  ctx.onProgress?.(base);

  const suggestion = suggestShelfForScan({
    shelves: ctx.shelves,
    itemType: "tcg",
    pathname: ctx.pathname,
    preferredShelfId: ctx.preferredShelfId,
  });

  let title = lock.label?.trim() || skuKey;
  let imageUrl = lock.faceUrl ?? null;
  let language = lock.language ?? null;
  let packId = lock.packId ?? null;

  try {
    const params = new URLSearchParams({ skuKey });
    const res = await axios.get(`/api/identify/product?${params.toString()}`, {
      signal: ctx.signal,
    });
    const data = res.data as {
      name?: string;
      imageUrl?: string | null;
      language?: string | null;
      packId?: string | null;
    };
    if (data?.name?.trim()) title = data.name.trim();
    if (data?.imageUrl) imageUrl = data.imageUrl;
    if (data?.language) language = data.language;
    if (data?.packId) packId = data.packId;
  } catch {
    // Catalogue miss — keep skuKey / face from identify or barcode resolve.
  }

  if (ctx.signal?.aborted) return base;

  const ownedExact = await fetchOwnedByQuery(skuKey, ctx.signal).catch(
    () => [],
  );
  const owned = pickOwnedScanHit(
    ownedExact.filter((item) => {
      const itemSku =
        (item as { skuKey?: string | null }).skuKey?.trim() ||
        item.printKey?.trim() ||
        "";
      return itemSku.toLowerCase() === skuKey.toLowerCase();
    }),
    [],
    null,
  );

  const hit: HydrateHit = {
    title,
    imageUrl,
    imageSource: imageUrl ? "face" : "none",
    metadataPreview: null,
  };

  return {
    ...base,
    title,
    imageUrl,
    language,
    packId,
    shelfType: "tcg",
    suggestedShelfId: suggestion.shelfId,
    shelfSure: suggestion.confidence === "sure",
    owned,
    hits: [hit],
    status: "ready",
  };
}

async function hydrateManualLock(
  lock: SessionLock,
  ctx: HydrateScanContext,
): Promise<HydratedScanLock> {
  const code = lock.key.trim();
  // Key must *be* a barcode — not `manual:1739…` (digits after stripping
  // the prefix look like an EAN and used to become « Objet 1739… »).
  const looksLikeBarcode = /^\d{8,14}$/.test(code);

  if (looksLikeBarcode) {
    return hydrateBarcodeLock(
      { ...lock, kind: "barcode", key: code },
      ctx,
    );
  }

  const title = lock.note?.trim() || lock.label?.trim() || code || "—";
  const suggestion = suggestShelfForScan({
    shelves: ctx.shelves,
    pathname: ctx.pathname,
    preferredShelfId: ctx.preferredShelfId,
    searchNames: [title],
  });
  const guessedShelf = ctx.shelves.find((s) => s.id === suggestion.shelfId);
  const shelfType = guessedShelf?.type ?? null;

  const ownedTitle = await fetchOwnedByQuery(title, ctx.signal).catch(() => []);
  const owned = pickOwnedScanHit([], ownedTitle, null);

  let imageUrl = lock.faceUrl ?? owned?.imageUrl ?? null;
  let imageSource: HydrateHit["imageSource"] = lock.faceUrl
    ? "face"
    : owned?.imageUrl
      ? "metadata"
      : "none";
  let metadataPreview: MetadataResult | null = null;
  let displayTitle = title;

  let current: HydratedScanLock = {
    ...emptyHydrated(lock),
    title: displayTitle,
    imageUrl,
    shelfType,
    suggestedShelfId: suggestion.shelfId,
    shelfSure: suggestion.confidence === "sure",
    owned,
    hits: [
      {
        title: displayTitle,
        imageUrl,
        imageSource,
        metadataPreview: null,
      },
    ],
    status: "loading",
  };
  ctx.onProgress?.(current);

  // Title-only manual add: no barcode/face — ask metadata for a cover when we
  // have a shelf type (pathname / preferred / name score). Honest miss stays empty.
  if (shelfType && !ctx.signal?.aborted) {
    try {
      const metadata = await getMetadataPreview(
        title,
        shelfType,
        null,
        null,
        guessedShelf?.name ?? null,
      );
      if (!ctx.signal?.aborted && metadata) {
        metadataPreview = metadata;
        const cover = getCoverImage({ metadata });
        if (cover) {
          imageUrl = cover;
          imageSource = "metadata";
        }
        const metaTitle =
          typeof metadata.title === "string" ? metadata.title.trim() : "";
        if (metaTitle) displayTitle = metaTitle;
      }
    } catch {
      // Best-effort preview — keep typed title / owned cover.
    }
  }

  current = {
    ...current,
    title: displayTitle,
    imageUrl,
    metadataPreview,
    hits: [
      {
        title: displayTitle,
        imageUrl,
        imageSource,
        metadataPreview,
      },
    ],
    status: "ready",
  };
  return current;
}

/** Hydrate one session lock. Ignores results after abort / undo via signal. */
export async function hydrateScanLock(
  lock: SessionLock,
  ctx: HydrateScanContext,
): Promise<HydratedScanLock> {
  try {
    if (lock.kind === "card") return await hydrateCardLock(lock, ctx);
    if (lock.kind === "sealed") return await hydrateSealedLock(lock, ctx);
    if (lock.kind === "manual") return await hydrateManualLock(lock, ctx);
    return await hydrateBarcodeLock(lock, ctx);
  } catch (error) {
    if (ctx.signal?.aborted) {
      return { ...emptyHydrated(lock), status: "error" };
    }
    console.warn("[hydrateScanLock]", lock.id, error);
    return {
      ...emptyHydrated(lock),
      status: "error",
      title: lock.label || lock.key,
    };
  }
}

/** Prefill payload for ItemModal from a hydrated lock. */
export function prefillFromHydrated(
  hydrated: HydratedScanLock,
  hitIndex = hydrated.selectedHitIndex,
): {
  name: string;
  imageUrl: string | null;
  barcode: string;
  shelfId?: string;
  printKey?: string | null;
  skuKey?: string | null;
  language?: string | null;
  shelfType?: string | null;
  shelfSure?: boolean;
  metadataPreview?: MetadataResult | null;
} {
  const hit = hydrated.hits[hitIndex] ?? hydrated.hits[0];
  const isCard = hydrated.kind === "card";
  const isSealed = hydrated.kind === "sealed";
  const isBarcode =
    hydrated.kind === "barcode" ||
    (hydrated.kind === "manual" && /^\d{8,14}$/.test(hydrated.key));

  const sealedFromBarcode =
    hydrated.kind === "barcode" ? hydrated.sealedSkuKey : null;
  const sealedDoubtHit =
    hydrated.kind === "barcode" &&
    hydrated.sealedHits?.length &&
    hitIndex < hydrated.sealedHits.length
      ? hydrated.sealedHits[hitIndex]?.productKey
      : null;

  return {
    name: hit?.title || hydrated.title,
    imageUrl: hit?.imageUrl || hydrated.imageUrl,
    barcode: isBarcode ? hydrated.key : "",
    shelfId: hydrated.suggestedShelfId || undefined,
    printKey: isCard ? hydrated.key : null,
    skuKey: isSealed
      ? hydrated.key
      : sealedFromBarcode || sealedDoubtHit || null,
    language: hydrated.language,
    shelfType: hydrated.shelfType,
    shelfSure: hydrated.shelfSure,
    metadataPreview: hit?.metadataPreview || hydrated.metadataPreview,
  };
}
