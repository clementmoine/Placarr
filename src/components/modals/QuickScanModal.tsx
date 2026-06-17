/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { toast } from "sonner";
import { Loader2, Search, Barcode, ExternalLink, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/lib/providers/LocaleProvider";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { BaseModal } from "@/components/modals/BaseModal";
import { getItems } from "@/lib/api/items";
import { getShelves } from "@/lib/api/shelves";
import Image from "next/image";
import { guessBestShelf, guessShelfByPlatformKey } from "@/lib/barcodeQuery";
import { itemPath } from "@/lib/slugs";

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
  }) => void;
}) {
  const { t } = useLocale();
  const router = useRouter();

  const [selectedShelfId, setSelectedShelfId] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [results, setResults] = useState<any[]>([]);
  const [customName, setCustomName] = useState<string>("");
  const [guessedShelfId, setGuessedShelfId] = useState<string | null>(null);

  // Get user's shelves
  const { data: shelves } = useQuery({
    queryKey: ["shelves"],
    queryFn: () => getShelves(),
    enabled: isOpen,
  });

  // Query if the user already owns an item with this barcode
  const { data: existingItems, isFetching: isFetchingExisting } = useQuery({
    queryKey: ["existingItems", barcode],
    queryFn: () => getItems(barcode),
    enabled: isOpen && !!barcode,
  });

  // Automatically select default/active shelf in background
  useEffect(() => {
    if (isOpen) {
      if (defaultShelfId) {
        setSelectedShelfId(defaultShelfId);
      } else if (shelves && shelves.length > 0) {
        setSelectedShelfId(shelves[0].id);
      }
    }
  }, [isOpen, defaultShelfId, shelves]);

  const activeShelf = shelves?.find((s) => s.id === selectedShelfId);
  const shelfType = activeShelf?.type;

  const performBarcodeLookup = useCallback(
    async (code: string, type?: string) => {
      if (!code) return;
      setIsSearching(true);
      setResults([]);
      setCustomName("");
      setGuessedShelfId(null);

      try {
        const typeParam = type ? `&type=${type}` : "";
        const res = await axios.get(`/api/barcode?q=${code}${typeParam}`);

        const matches = res.data.matches || [];
        const suggestions = res.data.suggestions || [];
        const cleanName = res.data.cleanName;
        const rawNames = res.data.rawNames || [];
        const resolvedShelfType = res.data.shelfType;
        const platformKey = res.data.platformKey;

        // Build results from matches (clusters) only — one entry per distinct media
        // suggestions are name variants within a cluster, not separate items
        if (matches.length > 0) {
          const resolvedList = matches.map((m: any) => ({
            title: m.name,
            imageUrl: m.coverUrl || null,
          }));
          setResults(resolvedList);

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
          if (shelves && shelves.length > 0) {
            const platformGuess = guessShelfByPlatformKey(platformKey, shelves);
            if (platformGuess) {
              guessedId = platformGuess.shelfId;
            }

            // 2. Try to guess based on matching name keywords
            if (!guessedId) {
              for (const name of allSearchNames) {
                const guess = guessBestShelf(name, shelves);
                if (guess) {
                  guessedId = guess.shelfId;
                  break;
                }
              }
            }

            // 3. Fallback to matching resolved shelf type
            if (!guessedId && resolvedShelfType) {
              const matchingShelf = shelves.find(
                (s) => s.type === resolvedShelfType,
              );
              if (matchingShelf) {
                guessedId = matchingShelf.id;
              }
            }
          }

          setGuessedShelfId(guessedId);
        } else {
          toast.info(t("scanner.noMatches"));
          setGuessedShelfId(null);
        }
      } catch (error) {
        console.error("Barcode lookup failed:", error);
        toast.error(t("scanner.error"));
        setGuessedShelfId(null);
      } finally {
        setIsSearching(false);
      }
    },
    [t, shelves],
  );

  // Trigger lookup when modal opens or shelf category changes
  useEffect(() => {
    if (isOpen && barcode) {
      performBarcodeLookup(barcode, shelfType);
    }
  }, [isOpen, barcode, shelfType, performBarcodeLookup]);

  const handleClose = useCallback(() => {
    setCustomName("");
    setGuessedShelfId(null);
    onClose();
  }, [onClose]);

  const handleSelectProduct = useCallback(
    (product: { title: string; imageUrl: string | null }) => {
      let targetShelfId = "";
      if (shelves && shelves.length > 0) {
        const customGuess = guessBestShelf(product.title, shelves);
        if (customGuess) {
          targetShelfId = customGuess.shelfId;
        }
      }

      if (!targetShelfId && guessedShelfId) {
        targetShelfId = guessedShelfId;
      }

      if (!targetShelfId) {
        targetShelfId =
          selectedShelfId ||
          (shelves && shelves.length > 0 ? shelves[0].id : "");
      }

      onSelectProduct({
        name: product.title,
        imageUrl: product.imageUrl,
        barcode: barcode,
        shelfId: targetShelfId,
      });
    },
    [barcode, selectedShelfId, shelves, guessedShelfId, onSelectProduct],
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
        <div className="flex flex-col gap-3 mt-2">
          {isFetchingExisting || isSearching ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="size-7 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground font-medium select-none">
                {isSearching ? t("scanner.searching") : t("common.loading")}
              </span>
            </div>
          ) : results.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {results.map((product, idx) => {
                const ownedItem = getOwnedStatusForProduct(product.title);
                const isOwned = !!ownedItem;

                return (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-zinc-50/50 dark:bg-zinc-900/20 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20 border border-border/40 rounded-2xl transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt=""
                          width={512}
                          height={512}
                          className="w-12 h-16 rounded-xl object-cover shrink-0 bg-muted/10 border border-border/50 shadow-sm transition-transform duration-300 group-hover:scale-105"
                        />
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
              {existingItems && existingItems.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                    {t("scanner.alreadyOwn")}
                  </span>
                  {existingItems.map((existItem: any) => (
                    <div
                      key={existItem.id}
                      className="flex items-center justify-between gap-4 p-3 bg-zinc-50/50 dark:bg-zinc-900/20 border border-border/40 rounded-2xl"
                    >
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

              {(!existingItems || existingItems.length === 0) && (
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
