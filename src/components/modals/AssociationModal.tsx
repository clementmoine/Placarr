/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { toast } from "sonner";
import { Loader2, Check, Search, Link2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/lib/providers/LocaleProvider";
import Image from "next/image";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BaseModal } from "@/components/modals/BaseModal";

import { saveItem } from "@/lib/api/items";
import { getMetadataPreview, getMetadataSuggestions } from "@/lib/api/metadata";
import { syncItemQueries } from "@/lib/itemQueryCache";
import { cn } from "@/lib/utils";
import type { ItemWithMetadata } from "@/types/items";
import type { Shelf } from "@prisma/client";

export function AssociationModal({
  isOpen,
  onClose,
  itemId,
  routeShelfId,
  item,
  shelfType,
  shelfName,
}: {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  routeShelfId?: string;
  item?: ItemWithMetadata | null;
  shelfType?: Shelf["type"];
  shelfName?: string;
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const [associationSearchName, setAssociationSearchName] =
    useState<string>("");
  const [associationBarcode, setAssociationBarcode] = useState<string>("");
  const [isSearchingAssociation, setIsSearchingAssociation] =
    useState<boolean>(false);
  const [associationResults, setAssociationResults] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null); // holds the title being associated

  const performSearch = useCallback(
    async (searchName: string, barcodeStr: string) => {
      const trimmedName = searchName.trim();
      const trimmedBarcode = barcodeStr.trim();
      if (!trimmedName && !trimmedBarcode) return;

      setIsSearchingAssociation(true);
      setAssociationResults([]);

      try {
        const resolvedType = shelfType || item?.shelf?.type || "games";
        let allNames: string[] = [];

        if (!trimmedName && trimmedBarcode) {
          const typeParam = shelfType ? `&type=${shelfType}` : "";
          const barcodeRes = await axios.get(
            `/api/barcode?q=${trimmedBarcode}${typeParam}`,
          );
          const barcodeData = barcodeRes.data;

          const matches = barcodeData.matches || [];
          const suggestionsList = barcodeData.suggestions || [];

          allNames = Array.from(
            new Set([
              ...(barcodeData.cleanName ? [barcodeData.cleanName] : []),
              ...matches.map((m: any) => m.name),
              ...suggestionsList,
            ]),
          ).filter(Boolean) as string[];
        } else if (trimmedName) {
          const suggestionsList = await getMetadataSuggestions(
            trimmedName,
            resolvedType,
            shelfName || item?.shelf?.name || null,
          );
          allNames = suggestionsList || [];

          if (allNames.length === 0) {
            allNames = [trimmedName];
          }
        }

        if (allNames.length > 0) {
          const slicedNames = allNames.slice(0, 5);
          const previews = await Promise.all(
            slicedNames.map(async (nameStr) => {
              try {
                const res = await getMetadataPreview(
                  nameStr,
                  resolvedType,
                  trimmedBarcode || null,
                  shelfName || item?.shelf?.name,
                );
                return res;
              } catch (e) {
                console.error(`Failed to fetch preview for "${nameStr}":`, e);
                return null;
              }
            }),
          );

          const validPreviews = previews.filter(Boolean);

          // Deduplicate search results by title and year to avoid showing duplicate cards
          const seen = new Set<string>();
          const uniquePreviews: any[] = [];
          for (const p of validPreviews) {
            if (!p) continue;
            const titleNorm = (p.title || "").toLowerCase().trim();
            const year = p.releaseDate
              ? new Date(p.releaseDate).getFullYear()
              : "";
            const key = `${titleNorm}_${year}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniquePreviews.push(p);
            }
          }

          setAssociationResults(uniquePreviews);

          if (uniquePreviews.length === 0) {
            toast.error(t("common.noResults"));
          }
        } else {
          toast.error(t("common.noResults"));
        }
      } catch (e) {
        console.error(e);
        toast.error(t("common.error"));
      } finally {
        setIsSearchingAssociation(false);
      }
    },
    [shelfType, shelfName, item, t],
  );

  // Initialize search inputs from the item when modal opens and trigger search
  useEffect(() => {
    if (isOpen && item) {
      const initialName = item.name || "";
      const initialBarcode = item.barcode || "";
      setAssociationSearchName(initialName);
      setAssociationBarcode(initialBarcode);
      setAssociationResults([]);

      if (initialName.trim() || initialBarcode.trim()) {
        performSearch(initialName, initialBarcode);
      }
    }
  }, [isOpen, item, performSearch]);

  const handleSearch = useCallback(async () => {
    performSearch(associationSearchName, associationBarcode);
  }, [performSearch, associationSearchName, associationBarcode]);

  const handleAssociate = useCallback(
    async (selectedTitle: string) => {
      setIsSubmitting(selectedTitle);
      try {
        const updatedItem = await saveItem({
          id: itemId,
          shelfId: item?.shelfId,
          refreshMetadata: true,
          lookupQuery: selectedTitle,
          barcode: associationBarcode.trim() || undefined,
        });

        await syncItemQueries(queryClient, updatedItem, [
          routeShelfId,
          item?.shelfId,
        ]);

        toast.success(t("common.success"));
        onClose();
      } catch (error) {
        console.error("Error associating metadata:", error);
        toast.error(t("items.saveFailed"));
      } finally {
        setIsSubmitting(null);
      }
    },
    [
      itemId,
      routeShelfId,
      associationBarcode,
      item?.shelfId,
      queryClient,
      onClose,
      t,
    ],
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Link2 className="size-5" />
          <span>{t("items.editTabs.searchMetadata")}</span>
        </div>
      }
      size="lg"
      cancelLabel={t("common.close") || "Fermer"}
      onCancel={onClose}
    >
      <div className="flex flex-col gap-4">
        {item?.metadata && (
          <div className="p-4 bg-zinc-950/5 dark:bg-zinc-950/20 border border-border/80 rounded-xl mb-2 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {t("items.editTabs.currentAssociation")}
            </span>
            <span className="text-sm font-bold text-foreground">
              {item.metadata.title}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">
              {item.metadata.sourceType}
              {item.metadata.sourceQuery
                ? ` (${item.metadata.sourceQuery})`
                : ""}
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 items-end sm:items-center">
          <div className="flex-1 w-full flex flex-col gap-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
              {t("common.name")}
            </label>
            <Input
              type="text"
              placeholder={t("items.enterName")}
              value={associationSearchName}
              onChange={(e) => setAssociationSearchName(e.target.value)}
              className="w-full bg-background text-foreground text-xs h-10"
            />
          </div>
          <div className="w-full sm:w-48 flex flex-col gap-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
              {t("items.barcode")}
            </label>
            <Input
              type="text"
              placeholder={t("items.barcode")}
              value={associationBarcode}
              onChange={(e) => setAssociationBarcode(e.target.value)}
              className="w-full bg-background text-foreground text-xs h-10"
            />
          </div>
          <Button
            type="button"
            onClick={handleSearch}
            disabled={
              isSearchingAssociation ||
              (!associationSearchName.trim() && !associationBarcode.trim())
            }
            className="w-full sm:w-auto h-10 px-6 text-xs font-semibold cursor-pointer bg-primary hover:bg-primary/95"
          >
            {isSearchingAssociation ? (
              <Loader2 className="size-4 animate-spin mr-1" />
            ) : (
              <Search className="size-4 mr-1.5" />
            )}
            {t("items.editTabs.search")}
          </Button>
        </div>

        {/* Search Results / Previews Grid */}
        {associationResults.length > 0 ? (
          <div className="flex flex-col gap-3 mt-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
              {t("items.searchResults")} ({associationResults.length})
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {associationResults.map((preview, idx) => {
                const isCurrent = item?.metadata?.title === preview.title;

                const coverUrl =
                  preview.attachments?.find((a: any) => a.type === "cover")
                    ?.url ||
                  preview.imageUrl ||
                  preview.attachments?.find((a: any) => a.type === "artwork")
                    ?.url;

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex gap-4 p-4 border rounded-xl bg-zinc-950/5 dark:bg-zinc-950/20 transition-all duration-200",
                      isCurrent
                        ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-md bg-emerald-500/5 dark:bg-emerald-500/5"
                        : "border-border/60 hover:border-border hover:shadow-xs",
                    )}
                  >
                    {coverUrl && (
                      <Image
                        src={coverUrl}
                        alt={preview.title}
                        width={512}
                        height={512}
                        className="w-20 h-28 rounded-lg object-cover bg-zinc-950/20 shrink-0 border border-border/40 shadow-xs select-none"
                      />
                    )}
                    <div className="flex flex-col gap-1.5 min-w-0 flex-1 justify-between">
                      <div className="flex flex-col gap-1 min-w-0">
                        <h4 className="text-sm font-bold text-foreground truncate max-w-full">
                          {preview.title}
                          {preview.releaseDate && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground select-none">
                              ({new Date(preview.releaseDate).getFullYear()})
                            </span>
                          )}
                        </h4>
                        {preview.publishers &&
                          preview.publishers.length > 0 && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-full select-none">
                              {t("items.publishers")}:{" "}
                              {preview.publishers
                                .map((p: any) => p.name)
                                .join(", ")}
                            </span>
                          )}
                        {preview.description && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mt-1 select-none">
                            {preview.description}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={isCurrent ? "secondary" : "default"}
                        size="sm"
                        onClick={() => handleAssociate(preview.title)}
                        disabled={isSubmitting !== null}
                        className={cn(
                          "mt-2 text-xs font-semibold cursor-pointer w-full h-8 rounded-lg",
                          isCurrent
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950"
                            : "bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-zinc-950",
                        )}
                      >
                        {isSubmitting === preview.title ? (
                          <Loader2 className="size-3.5 animate-spin mr-1" />
                        ) : isCurrent ? (
                          <Check className="size-3.5 mr-1" />
                        ) : null}
                        {isCurrent
                          ? t("items.associated")
                          : t("items.editTabs.associateThis")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          !isSearchingAssociation && (
            <div className="text-xs text-muted-foreground py-12 text-center bg-zinc-950/5 dark:bg-zinc-950/10 border border-dashed border-border rounded-xl mt-2 select-none">
              {t("items.editTabs.noAssociation")}
            </div>
          )
        )}
      </div>
    </BaseModal>
  );
}
