/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { toast } from "sonner";
import { Search, Barcode, ExternalLink, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/lib/providers/LocaleProvider";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cleanManualBarcode,
  ManualBarcodeEntry,
} from "@/components/ManualBarcodeEntry";

import { BaseModal } from "@/components/modals/BaseModal";
import { getMetadataPreview } from "@/lib/api/metadata";
import { getShelves } from "@/lib/api/shelves";
import { getCoverImage } from "@/lib/itemMedia";
import { RemoteImage } from "@/components/RemoteImage";
import { guessShelfFromBarcodeLookup } from "@/lib/barcode/query";
import { itemPath, slugify } from "@/lib/slugs";
import type { MetadataResult } from "@/types/metadataProvider";

type QuickScanResult = {
  id: string;
  title: string;
  imageUrl: string | null;
  placeholderImageUrl?: string | null;
  imageSource: "barcode" | "metadata" | "none";
  shelfType?: string | null;
  isHydrating: boolean;
  metadataPreview?: MetadataResult | null;
};

type ExistingQuickItem = {
  id: string;
  name: string;
  shelfId: string;
  condition: string;
  imageUrl?: string | null;
  shelf?: {
    id: string;
    name: string;
  } | null;
};

const MIN_BACKGROUND_LOADING_MS = 250;

export function QuickScanModal({
  isOpen,
  onClose,
  barcode,
  defaultShelfId,
  onSelectProduct,
}: {
  isOpen: boolean;
  onClose: () => void;
  barcode: string;
  defaultShelfId?: string;
  onSelectProduct: (product: {
    name: string;
    imageUrl: string | null;
    barcode: string;
    shelfId?: string;
    metadataPreview?: MetadataResult | null;
  }) => void;
}) {
  const { t } = useLocale();
  const router = useRouter();

  const [selectedShelfId, setSelectedShelfId] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false);
  const [results, setResults] = useState<QuickScanResult[]>([]);
  const [customName, setCustomName] = useState<string>("");
  const [guessedShelfId, setGuessedShelfId] = useState<string | null>(null);
  const [activeBarcode, setActiveBarcode] = useState<string>("");
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const activeLookupKeyRef = useRef<string>("");
  const skipNextLookupForAutoShelfRef = useRef(false);

  // Get user's shelves
  const { data: shelves } = useQuery({
    queryKey: ["shelves"],
    queryFn: () => getShelves(),
    enabled: isOpen,
  });

  // Query if the user already owns an item with this barcode
  const { data: existingItems } = useQuery<ExistingQuickItem[]>({
    queryKey: ["existingItems", activeBarcode],
    queryFn: async () => {
      const { data } = await axios.get("/api/items", {
        params: {
          q: activeBarcode,
          includeMetadata: "false",
        },
      });
      return data as ExistingQuickItem[];
    },
    enabled: isOpen && !!activeBarcode,
  });

  const defaultShelf = defaultShelfId
    ? shelves?.find(
        (s) =>
          s.id === defaultShelfId ||
          s.slug === defaultShelfId ||
          slugify(s.name) === defaultShelfId,
      )
    : undefined;

  // Automatically select the current shelf when the quick scan starts from one.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedShelfId(defaultShelf?.id || "");
  }, [isOpen, defaultShelf?.id]);

  const activeShelf = shelves?.find((s) => s.id === selectedShelfId);
  const shelfType = activeShelf?.type;
  const isResolvingShelves = isOpen && !shelves;
  const isResolvingDefaultShelf = !!defaultShelfId && !shelves;
  const platformContext = activeShelf?.name || null;

  useEffect(() => {
    if (!isOpen) return;
    const cleanedBarcode = cleanManualBarcode(barcode);
    setActiveBarcode(cleanedBarcode);
    setBarcodeInput(cleanedBarcode);
  }, [isOpen, barcode]);

  const hydrateResultImages = useCallback(
    async (
      lookupKey: string,
      code: string,
      type: string,
      platform: string | null,
      initialResults: QuickScanResult[],
    ) => {
      const toHydrate = initialResults;
      await Promise.all(
        toHydrate.map(async (result) => {
          try {
            const metadata = await getMetadataPreview(
              result.title,
              type,
              code,
              platform,
            );
            if (activeLookupKeyRef.current !== lookupKey) return;
            const hydratedImageUrl = metadata
              ? getCoverImage({ metadata })
              : null;
            setResults((prev) =>
              prev.map((entry) => {
                if (entry.id !== result.id) return entry;
                if (hydratedImageUrl) {
                  return {
                    ...entry,
                    imageUrl: hydratedImageUrl,
                    imageSource: "metadata",
                    isHydrating: false,
                    metadataPreview: metadata || null,
                  };
                }
                return {
                  ...entry,
                  isHydrating: false,
                  metadataPreview: metadata || null,
                };
              }),
            );
          } catch (error) {
            if (activeLookupKeyRef.current !== lookupKey) return;
            console.warn(
              `[QuickScan] Metadata preview failed for "${result.title}"`,
              error,
            );
            setResults((prev) =>
              prev.map((entry) =>
                entry.id === result.id
                  ? { ...entry, isHydrating: false }
                  : entry,
              ),
            );
          }
        }),
      );
    },
    [],
  );

  const applyLookupResponse = useCallback(
    (
      payload: any,
      lookupKey: string,
      code: string,
      requestedType?: string,
      options: {
        suppressNoMatchToast?: boolean;
        keepPreviousResultsOnNoMatches?: boolean;
      } = {},
    ) => {
      if (activeLookupKeyRef.current !== lookupKey) {
        return { hasMatches: false, usedCache: false };
      }

      const matches = payload?.matches || [];
      const suggestions = payload?.suggestions || [];
      const cleanName = payload?.cleanName;
      const rawNames = payload?.rawNames || [];
      const resolvedShelfType = payload?.shelfType as string | undefined;
      const platformKey = payload?.platformKey;
      const metadataType = requestedType || resolvedShelfType;
      const usedCache =
        typeof payload?.provider === "string" &&
        /canonical-v\d+/i.test(payload.provider);

      if (matches.length === 0) {
        if (!options.suppressNoMatchToast) {
          toast.info(t("scanner.noMatches"));
        }
        if (!options.keepPreviousResultsOnNoMatches) {
          setResults([]);
          setGuessedShelfId(null);
        }
        return { hasMatches: false, usedCache };
      }

      const resolvedList: QuickScanResult[] = matches.map(
        (m: any, index: number) => {
          const shouldHideBarcodeImage = metadataType === "games";
          return {
            id: `${index}:${m.name || "match"}`,
            title: m.name,
            imageUrl: shouldHideBarcodeImage ? null : m.coverUrl || null,
            placeholderImageUrl: shouldHideBarcodeImage
              ? m.coverUrl || null
              : null,
            imageSource:
              m.coverUrl && !shouldHideBarcodeImage ? "barcode" : "none",
            shelfType: metadataType || resolvedShelfType || null,
            isHydrating: Boolean(metadataType),
            metadataPreview: null,
          };
        },
      );
      setResults((previousResults) => {
        const previousByTitle = new Map(
          previousResults.map((entry) => [
            entry.title.toLowerCase().trim(),
            entry,
          ]),
        );
        return resolvedList.map((entry) => {
          const previous = previousByTitle.get(
            entry.title.toLowerCase().trim(),
          );
          if (!previous?.metadataPreview) return entry;
          return {
            ...entry,
            imageUrl: previous.imageUrl || entry.imageUrl,
            imageSource:
              previous.imageSource === "metadata"
                ? previous.imageSource
                : entry.imageSource,
            isHydrating: false,
            metadataPreview: previous.metadataPreview,
          };
        });
      });
      // Try to guess shelf from rawNames, cleanName, suggestions
      const allSearchNames = Array.from(
        new Set([
          ...(cleanName ? [cleanName] : []),
          ...rawNames,
          ...suggestions,
          ...matches.map((m: any) => m.name),
        ]),
      ).filter(Boolean) as string[];
      let guessedId: string | null = null;
      let guessedPlatformContext = platformContext;
      if (shelves && shelves.length > 0) {
        const fallbackShelfId = selectedShelfId || defaultShelf?.id || null;
        const shelfGuess = guessShelfFromBarcodeLookup({
          platformKey,
          searchNames: allSearchNames,
          shelves,
          preferredShelfId: fallbackShelfId,
        });
        guessedId = shelfGuess?.shelfId ?? fallbackShelfId;
        guessedPlatformContext =
          shelves.find((s) => s.id === guessedId)?.name ||
          guessedPlatformContext;
      }

      setGuessedShelfId(guessedId);
      if (guessedId && guessedId !== selectedShelfId) {
        skipNextLookupForAutoShelfRef.current = true;
        setSelectedShelfId(guessedId);
      }
      if (metadataType) {
        void hydrateResultImages(
          lookupKey,
          code,
          metadataType,
          guessedPlatformContext || null,
          resolvedList,
        );
      }
      return { hasMatches: true, usedCache };
    },
    [
      t,
      shelves,
      selectedShelfId,
      defaultShelf?.id,
      hydrateResultImages,
      platformContext,
    ],
  );

  const performBarcodeLookup = useCallback(
    async (code: string, type?: string) => {
      if (!code) return;
      const lookupKey = `${code}|${type || "generic"}|${Date.now()}`;
      activeLookupKeyRef.current = lookupKey;
      setIsSearching(true);
      setIsRevalidating(false);
      setResults([]);
      setCustomName("");
      setGuessedShelfId(null);

      try {
        const params = new URLSearchParams({ q: code });
        if (type) params.set("type", type);
        const res = await axios.get(`/api/barcode?${params.toString()}`);
        if (activeLookupKeyRef.current !== lookupKey) return;

        const initial = applyLookupResponse(res.data, lookupKey, code, type);
        if (activeLookupKeyRef.current !== lookupKey) return;
        setIsSearching(false);

        // Stale-while-revalidate: if response likely comes from cache, refresh silently.
        if (initial.hasMatches && initial.usedCache) {
          setIsRevalidating(true);
          const refreshStartedAt = Date.now();
          try {
            const refreshParams = new URLSearchParams({
              q: code,
              refresh: "1",
            });
            if (type) refreshParams.set("type", type);
            const refreshRes = await axios.get(
              `/api/barcode?${refreshParams.toString()}`,
            );
            if (activeLookupKeyRef.current !== lookupKey) return;

            applyLookupResponse(refreshRes.data, lookupKey, code, type, {
              suppressNoMatchToast: true,
              keepPreviousResultsOnNoMatches: true,
            });
          } catch (refreshError) {
            if (activeLookupKeyRef.current !== lookupKey) return;
            console.warn(
              "[QuickScan] Background refresh failed:",
              refreshError,
            );
          } finally {
            const elapsed = Date.now() - refreshStartedAt;
            if (elapsed < MIN_BACKGROUND_LOADING_MS) {
              await new Promise((resolve) =>
                setTimeout(resolve, MIN_BACKGROUND_LOADING_MS - elapsed),
              );
            }
            if (activeLookupKeyRef.current === lookupKey) {
              setIsRevalidating(false);
            }
          }
        }
      } catch (error) {
        if (activeLookupKeyRef.current !== lookupKey) return;
        console.error("Barcode lookup failed:", error);
        toast.error(t("scanner.error"));
        setGuessedShelfId(null);
      } finally {
        if (activeLookupKeyRef.current === lookupKey) {
          setIsSearching(false);
          setIsRevalidating(false);
        }
      }
    },
    [t, applyLookupResponse],
  );

  // Trigger lookup when modal opens or shelf category changes
  useEffect(() => {
    if (
      isOpen &&
      activeBarcode &&
      !isResolvingShelves &&
      !isResolvingDefaultShelf
    ) {
      if (skipNextLookupForAutoShelfRef.current) {
        skipNextLookupForAutoShelfRef.current = false;
        return;
      }
      performBarcodeLookup(activeBarcode, shelfType);
    }
  }, [
    isOpen,
    activeBarcode,
    shelfType,
    isResolvingShelves,
    isResolvingDefaultShelf,
    performBarcodeLookup,
  ]);

  const handleManualBarcodeSubmit = useCallback(
    (code: string) => {
      setBarcodeInput(code);
      if (code === activeBarcode) {
        performBarcodeLookup(code, shelfType);
        return;
      }
      setActiveBarcode(code);
    },
    [activeBarcode, performBarcodeLookup, shelfType],
  );

  const handleClose = useCallback(() => {
    activeLookupKeyRef.current = "";
    skipNextLookupForAutoShelfRef.current = false;
    setIsSearching(false);
    setIsRevalidating(false);
    setCustomName("");
    setGuessedShelfId(null);
    setActiveBarcode("");
    setBarcodeInput("");
    setSelectedShelfId("");
    onClose();
  }, [onClose]);

  const handleSelectProduct = useCallback(
    (product: {
      title: string;
      imageUrl: string | null;
      imageSource?: QuickScanResult["imageSource"];
      shelfType?: string | null;
      metadataPreview?: MetadataResult | null;
    }) => {
      const shelfGuess =
        guessedShelfId ||
        guessShelfFromBarcodeLookup({
          searchNames: [product.title],
          shelves: shelves || [],
          preferredShelfId: selectedShelfId || defaultShelf?.id || null,
        })?.shelfId ||
        selectedShelfId ||
        defaultShelf?.id ||
        "";
      const productShelfType =
        product.shelfType ||
        shelves?.find((s) => s.id === shelfGuess)?.type ||
        activeShelf?.type ||
        null;
      const shouldLetMetadataOwnImage = productShelfType === "games";

      onSelectProduct({
        name: product.title,
        imageUrl: shouldLetMetadataOwnImage ? null : product.imageUrl,
        barcode: activeBarcode,
        shelfId: shelfGuess || undefined,
        metadataPreview: product.metadataPreview || null,
      });
    },
    [
      activeBarcode,
      selectedShelfId,
      defaultShelf?.id,
      shelves,
      guessedShelfId,
      activeShelf?.type,
      onSelectProduct,
    ],
  );

  const getOwnedStatusForProduct = (productTitle: string) => {
    if (!existingItems || existingItems.length === 0) return null;

    const titleNorm = productTitle.toLowerCase().trim();

    // 1. Try to find exact/close name match first
    const exactMatch = existingItems.find(
      (item) => item.name.toLowerCase().trim() === titleNorm,
    );
    if (exactMatch) return exactMatch;

    // 2. Token overlap fuzzy check to catch spelling or punctuation variations
    // but prevent matching completely unrelated titles
    const sugTokens = new Set(titleNorm.split(/[^a-z0-9]+/));
    for (const item of existingItems) {
      const dbNorm = item.name.toLowerCase().trim();
      const dbTokens = new Set(dbNorm.split(/[^a-z0-9]+/));

      const intersection = [...sugTokens].filter(
        (t) => t.length > 2 && dbTokens.has(t),
      );
      if (
        intersection.length >= 2 ||
        (sugTokens.size <= 2 && intersection.length >= 1)
      ) {
        return item;
      }
    }

    return null;
  };

  const hasExistingItems = Boolean(existingItems && existingItems.length > 0);
  const shouldShowSuggestionsSkeleton =
    (isResolvingShelves || isSearching || isRevalidating) &&
    results.length === 0;

  const renderSuggestionSkeletons = (count = 3) => (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`quick-scan-skeleton-${index}`}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-zinc-50/50 dark:bg-zinc-900/20 border border-border/40 rounded-2xl"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <Skeleton className="w-12 h-16 rounded-xl shrink-0 bg-zinc-200/80 dark:bg-zinc-800/70" />
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <Skeleton className="h-4 w-5/6 rounded-md bg-zinc-200/80 dark:bg-zinc-800/70" />
              <Skeleton className="h-3 w-1/2 rounded-md bg-zinc-200/70 dark:bg-zinc-800/60" />
            </div>
          </div>
          <div className="flex gap-2 shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
            <Skeleton className="h-10 sm:h-9 w-full sm:w-24 rounded-xl bg-zinc-200/80 dark:bg-zinc-800/70" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <Barcode className="size-5" />
          <span>{t("scanner.quickScan")}</span>
        </div>
      }
      size="lg"
      footer={null}
    >
      <div className="flex flex-col gap-4">
        <ManualBarcodeEntry
          value={barcodeInput}
          onValueChange={setBarcodeInput}
          onSubmit={handleManualBarcodeSubmit}
          disabled={isResolvingShelves || isSearching}
        />

        <div className="flex flex-col gap-3 mt-2">
          {!activeBarcode ? (
            <p className="text-xs text-muted-foreground italic select-none py-4">
              {t("scanner.manualBarcodeHelp")}
            </p>
          ) : shouldShowSuggestionsSkeleton && !hasExistingItems ? (
            <div className="flex flex-col gap-2.5 py-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide select-none">
                {t("scanner.searching")}
              </span>
              {renderSuggestionSkeletons()}
            </div>
          ) : results.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {results.map((product) => {
                const ownedItem = getOwnedStatusForProduct(product.title);
                const isOwned = !!ownedItem;

                return (
                  <div
                    key={product.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-zinc-50/50 dark:bg-zinc-900/20 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20 border border-border/40 rounded-2xl transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {product.imageUrl ? (
                        <RemoteImage
                          src={product.imageUrl}
                          alt=""
                          className="w-12 h-16 rounded-xl object-cover shrink-0 bg-muted/10 border border-border/50 shadow-sm transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : product.placeholderImageUrl && product.isHydrating ? (
                        <div className="relative w-12 h-16 rounded-xl shrink-0 overflow-hidden bg-muted/10 border border-border/50 shadow-sm">
                          <RemoteImage
                            src={product.placeholderImageUrl}
                            alt=""
                            className="w-full h-full object-cover blur-sm scale-110 opacity-55"
                          />
                          <div className="absolute inset-0 bg-background/35 animate-pulse" />
                        </div>
                      ) : product.isHydrating ? (
                        <Skeleton className="w-12 h-16 rounded-xl shrink-0 bg-zinc-200/80 dark:bg-zinc-800/70" />
                      ) : (
                        <div className="w-12 h-16 rounded-xl bg-zinc-100 dark:bg-zinc-950/20 shrink-0 border border-border/50 shadow-sm flex items-center justify-center">
                          <Search className="size-5 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex flex-col min-w-0 gap-1.5">
                        <span className="text-sm font-bold text-foreground leading-tight group-hover:text-primary transition-colors line-clamp-2">
                          {product.title}
                        </span>
                        {isOwned && ownedItem && (
                          <div className="flex select-none">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/10">
                              {t("scanner.alreadyIn")} {ownedItem.shelf?.name}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
                      {isOwned && ownedItem && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            handleClose();
                            router.push(
                              itemPath(
                                ownedItem.shelf || { id: ownedItem.shelfId },
                                ownedItem,
                              ),
                            );
                          }}
                          className="h-10 sm:h-9 px-4 sm:px-3 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 border border-border/40 cursor-pointer w-full sm:w-auto flex items-center justify-center shadow-sm"
                          title={t("scanner.viewExisting")}
                        >
                          <ExternalLink className="size-3.5 mr-1.5" />
                          {t("scanner.viewExisting") || "Consulter"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleSelectProduct(product)}
                        className="h-10 sm:h-9 px-4 sm:px-3 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 cursor-pointer shadow-sm flex items-center justify-center w-full sm:w-auto"
                      >
                        <Plus className="size-4 mr-1.5 shrink-0" />
                        {t("common.add") || "Ajouter"}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {isRevalidating && (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide select-none">
                    {t("scanner.searching")}
                  </span>
                  {renderSuggestionSkeletons(1)}
                </div>
              )}

              {/* Inline Manual Add Form for Quick Adding Custom items */}
              <div className="flex flex-col gap-2.5 pt-4 border-t border-border/40 mt-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                  {t("scanner.addItem") || "Ajouter un objet personnalisé"}
                </span>
                <div className="relative flex items-center">
                  <Input
                    type="text"
                    placeholder={t("scanner.customName") || "Nom de l'objet..."}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950/20 pr-24 text-xs h-10 border-border/60 focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customName.trim()) {
                        handleSelectProduct({
                          title: customName.trim(),
                          imageUrl: null,
                        });
                      }
                    }}
                  />
                  <Button
                    onClick={() =>
                      handleSelectProduct({
                        title: customName.trim(),
                        imageUrl: null,
                      })
                    }
                    disabled={!customName.trim()}
                    size="sm"
                    className="absolute right-1 h-8 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 cursor-pointer flex items-center"
                  >
                    <Plus className="size-3.5 mr-1" />
                    {t("common.add") || "Ajouter"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {hasExistingItems && (
                <div className="flex flex-col gap-2.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                    {t("scanner.alreadyOwn")}
                  </span>
                  {(existingItems || []).map((existItem) => (
                    <div
                      key={existItem.id}
                      className="flex items-center justify-between gap-4 p-3 bg-zinc-50/50 dark:bg-zinc-900/20 border border-border/40 rounded-2xl"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {existItem.imageUrl ? (
                          <RemoteImage
                            src={existItem.imageUrl}
                            alt=""
                            className="w-12 h-16 rounded-xl object-cover shrink-0 bg-muted/10 border border-border/50 shadow-sm"
                          />
                        ) : (
                          <div className="w-12 h-16 rounded-xl bg-zinc-100 dark:bg-zinc-950/20 shrink-0 border border-border/50 shadow-sm flex items-center justify-center">
                            <Search className="size-5 text-muted-foreground/50" />
                          </div>
                        )}
                        <div className="flex flex-col min-w-0 gap-1">
                          <span className="text-sm font-bold text-foreground truncate">
                            {existItem.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground capitalize select-none font-medium">
                            {t("items.shelf")}:{" "}
                            {existItem.shelf?.name || "Placarr"} (
                            {existItem.condition})
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          handleClose();
                          router.push(
                            itemPath(
                              existItem.shelf || { id: existItem.shelfId },
                              existItem,
                            ),
                          );
                        }}
                        className="h-9 px-3 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 border border-border/40 cursor-pointer"
                      >
                        <ExternalLink className="size-3.5 mr-1" />
                        {t("scanner.viewExisting") || "Consulter"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {shouldShowSuggestionsSkeleton && (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide select-none">
                    {t("scanner.searching")}
                  </span>
                  {renderSuggestionSkeletons(hasExistingItems ? 1 : 2)}
                </div>
              )}

              {!hasExistingItems && !shouldShowSuggestionsSkeleton && (
                <p className="text-xs text-muted-foreground italic select-none py-4">
                  {t("scanner.noMatches")}
                </p>
              )}

              {/* Custom Item Form */}
              <div className="flex flex-col gap-2.5 pt-4 border-t border-border/40 mt-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                  {t("scanner.addItem")}
                </span>
                <div className="relative flex items-center">
                  <Input
                    type="text"
                    placeholder={t("scanner.customName")}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950/20 pr-24 text-xs h-10 border-border/60 focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customName.trim()) {
                        handleSelectProduct({
                          title: customName.trim(),
                          imageUrl: null,
                        });
                      }
                    }}
                  />
                  <Button
                    onClick={() =>
                      handleSelectProduct({
                        title: customName.trim(),
                        imageUrl: null,
                      })
                    }
                    disabled={!customName.trim()}
                    size="sm"
                    className="absolute right-1 h-8 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 cursor-pointer flex items-center"
                  >
                    <Plus className="size-3.5 mr-1" />
                    {t("common.add") || "Ajouter"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
