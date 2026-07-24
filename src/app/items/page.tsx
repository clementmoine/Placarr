"use client";

import { z } from "zod";
import Link from "next/link";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { LayoutGroup, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Check,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import Header from "@/components/Header";
import { ScanFAB } from "@/components/ScanFAB";
import { ItemCard } from "@/components/ItemCard";
import { ItemCollectionSortSelect } from "@/components/ItemCollectionControls";
import { BulkDeleteModal } from "@/components/modals/BulkDeleteModal";
import { BulkMoveModal } from "@/components/modals/BulkMoveModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { cn } from "@/lib/shared/utils";
import {
  getItems,
  refreshItemsBatch,
} from "@/lib/api/items";
import { useAccount } from "@/lib/client/hooks/useAccount";
import { useDebounce } from "@/lib/client/hooks/useDebounce";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { itemPath } from "@/lib/routing/slugs";
import { invalidateShelfQueries } from "@/core/collect/queryCache";
import {
  DEFAULT_ITEM_COLLECTION_FILTERS,
  parseItemCollectionSort,
  queryCollectionItems,
  summarizeCollectionEstimatedValue,
  type ItemCollectionSort,
} from "@/core/collect/collectionQuery";
import { metadataBusyRefetchInterval } from "@/core/collect/enrichment";
import { itemIdsInVisibleRange } from "@/core/collect/selectionRange";
import { useRefetchCollectionItemsWhenMetadataIdle } from "@/core/collect/useRefetchItemWhenMetadataIdle";

import type { ItemWithMetadata } from "@/types/items";

const searchSchema = z.object({
  search: z.string(),
});

type FormValues = z.infer<typeof searchSchema>;

const COLLECTION_SHELF_TYPES = [
  "games",
  "movies",
  "musics",
  "books",
  "boardgames",
  "hardware",
  "tcg",
  "toys",
] as const;

type CollectionShelfType = (typeof COLLECTION_SHELF_TYPES)[number];

type CollectionGridItemProps = {
  item: ItemWithMetadata;
  index: number;
  selectionMode: boolean;
  isSelected: boolean;
  canSelect: boolean;
  onSelect: (itemId: string, options?: { shiftKey?: boolean }) => void;
};

const CollectionGridItem = memo(function CollectionGridItem({
  item,
  index,
  selectionMode,
  isSelected,
  canSelect,
  onSelect,
}: CollectionGridItemProps) {
  const { t } = useLocale();

  const card = (
    <ItemCard
      {...item}
      shelfType={item.shelf?.type}
      shelfName={item.shelf?.name}
      cardFormat={item.shelf?.cardFormat}
      priority={index < 4}
    />
  );

  const checkbox = canSelect ? (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={
        isSelected
          ? t("items.bulkMove.clearSelection")
          : t("items.bulkMove.selectMode")
      }
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(item.id, { shiftKey: event.shiftKey });
      }}
      className={cn(
        "absolute top-2 left-2 z-30 flex size-6 items-center justify-center rounded-full border-2 shadow-md transition-all duration-200",
        isSelected
          ? "border-primary bg-primary text-primary-foreground scale-100"
          : "border-white/90 bg-black/45 text-transparent backdrop-blur-sm hover:bg-black/65",
        selectionMode || isSelected
          ? "opacity-100"
          : "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </button>
  ) : null;

  return (
    <motion.div
      layoutId={`collection-item-card-${item.id}`}
      layout={!selectionMode}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
      className={cn(
        "group relative block w-full rounded-2xl",
        isSelected &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      {selectionMode ? (
        <button
          type="button"
          aria-pressed={isSelected}
          onClick={(event) =>
            onSelect(item.id, { shiftKey: event.shiftKey })
          }
          className="block w-full text-left"
        >
          {card}
        </button>
      ) : (
        <Link href={itemPath(item.shelf || { id: item.shelfId }, item)}>
          {card}
        </Link>
      )}
      {checkbox}
    </motion.div>
  );
});

function ItemsPageComponent() {
  const { t } = useLocale();
  const { isGuest, isAuthenticated, hasPermission } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const debounce = useDebounce();

  const q = searchParams.get("q") || "";
  const typeParam = searchParams.get("type") || "all";
  const sortParam = searchParams.get("sort") || "name_asc";

  const [searchQuery, setSearchQuery] = useState(q);
  const [typeFilter, setTypeFilter] = useState(typeParam);
  const [sortBy, setSortBy] = useState<ItemCollectionSort>(
    parseItemCollectionSort(sortParam),
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const selectionAnchorIdRef = useRef<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: q },
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["collectionItems", searchQuery, typeFilter],
    queryFn: () =>
      getItems(searchQuery || null, null, {
        shelfTypes:
          typeFilter !== "all" &&
          COLLECTION_SHELF_TYPES.includes(typeFilter as CollectionShelfType)
            ? [typeFilter]
            : undefined,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      metadataBusyRefetchInterval(query.state.data as ItemWithMetadata[]),
    refetchIntervalInBackground: true,
  });

  useRefetchCollectionItemsWhenMetadataIdle(queryClient, items);

  const sortedItems = useMemo(() => {
    if (!items?.length) return [] as ItemWithMetadata[];

    return queryCollectionItems(items, {
      sortBy,
      filters: DEFAULT_ITEM_COLLECTION_FILTERS,
    });
  }, [items, sortBy]);

  const totalValue = useMemo(() => {
    if (!items?.length) return { total: 0, includesEstimates: false };
    return summarizeCollectionEstimatedValue(
      queryCollectionItems(items, {
        sortBy: "name_asc",
        filters: DEFAULT_ITEM_COLLECTION_FILTERS,
      }),
    );
  }, [items]);

  const canSelectItems = Boolean(isAuthenticated && !isGuest);

  const selectableItems = useMemo(
    () =>
      sortedItems.filter(
        (item) => item.id && hasPermission(item.userId ?? item.shelf?.userId),
      ),
    [sortedItems, hasPermission],
  );

  const visibleItemIds = useMemo(
    () => selectableItems.map((item) => item.id).filter(Boolean) as string[],
    [selectableItems],
  );

  const selectedItemIdsArray = useMemo(
    () => Array.from(selectedItemIds),
    [selectedItemIds],
  );

  const selectedSourceShelfIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of sortedItems) {
      if (!item.id || !selectedItemIds.has(item.id)) continue;
      if (item.shelfId) ids.add(item.shelfId);
    }
    return Array.from(ids);
  }, [sortedItems, selectedItemIds]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedItemIds(new Set());
    selectionAnchorIdRef.current = null;
    setMoveModalOpen(false);
    setDeleteModalOpen(false);
  }, []);

  useEffect(() => {
    if (!selectionMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitSelectionMode();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode, exitSelectionMode]);

  const beginSelection = useCallback(
    (itemId: string, options?: { shiftKey?: boolean }) => {
      setSelectionMode(true);

      if (options?.shiftKey && selectionAnchorIdRef.current) {
        const rangeIds = itemIdsInVisibleRange(
          visibleItemIds,
          selectionAnchorIdRef.current,
          itemId,
        );
        if (rangeIds.length > 0) {
          setSelectedItemIds((current) => {
            const next = new Set(current);
            for (const id of rangeIds) next.add(id);
            return next;
          });
          return;
        }
      }

      selectionAnchorIdRef.current = itemId;
      setSelectedItemIds((current) => {
        const next = new Set(current);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
    },
    [visibleItemIds],
  );

  const selectAllVisibleItems = useCallback(() => {
    setSelectedItemIds(new Set(visibleItemIds));
  }, [visibleItemIds]);

  const selectableItemCount = visibleItemIds.length;
  const allVisibleSelected =
    selectableItemCount > 0 && selectedItemIds.size >= selectableItemCount;

  const invalidateAfterBulk = useCallback(
    (sourceShelfIds: string[], targetShelfId?: string) => {
      const ids = [
        ...sourceShelfIds,
        ...(targetShelfId ? [targetShelfId] : []),
      ];
      void invalidateShelfQueries(queryClient, ids);
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
      queryClient.invalidateQueries({ queryKey: ["collectionItems"] });
      queryClient.invalidateQueries({ queryKey: ["searchItems"] });
    },
    [queryClient],
  );

  const handleBulkMoveSuccess = useCallback(
    (result: {
      count: number;
      targetShelfId: string;
      sourceShelfIds: string[];
    }) => {
      exitSelectionMode();
      invalidateAfterBulk(result.sourceShelfIds, result.targetShelfId);
    },
    [exitSelectionMode, invalidateAfterBulk],
  );

  const handleBulkDeleteSuccess = useCallback(
    (result: { count: number; sourceShelfIds: string[] }) => {
      exitSelectionMode();
      invalidateAfterBulk(result.sourceShelfIds);
    },
    [exitSelectionMode, invalidateAfterBulk],
  );

  const { mutate: bulkRefreshMutation, isPending: isBulkRefreshing } =
    useMutation({
      mutationFn: refreshItemsBatch,
      onSuccess: (result) => {
        toast.success(
          t("items.bulkRefresh.success").replace(
            "{count}",
            String(result.count),
          ),
        );
        queryClient.invalidateQueries({ queryKey: ["collectionItems"] });
        queryClient.invalidateQueries({ queryKey: ["shelves"] });
        for (const id of selectedSourceShelfIds) {
          queryClient.invalidateQueries({ queryKey: ["shelf", id] });
        }
      },
      onError: () => {
        toast.error(t("items.bulkRefresh.failed"));
      },
    });

  const handleBulkRefresh = useCallback(() => {
    if (selectedItemIds.size === 0) return;
    bulkRefreshMutation({ itemIds: selectedItemIdsArray });
  }, [bulkRefreshMutation, selectedItemIds.size, selectedItemIdsArray]);

  const replaceParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleSearch = (values: FormValues) => {
    setSearchQuery(values.search);
    replaceParams({ q: values.search || null });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setValue("search", value);
    debounce(() => {
      setSearchQuery(value);
      replaceParams({ q: value || null });
    });
  };

  // L'état local suit le paramètre d'URL : ajusté pendant le render (pattern
  // « adjust state when props change ») ; seule l'écriture du store externe
  // react-hook-form reste dans un effect.
  const paramsKey = searchParams.toString();
  const [prevParamsKey, setPrevParamsKey] = useState(paramsKey);
  if (prevParamsKey !== paramsKey) {
    setPrevParamsKey(paramsKey);
    setSearchQuery(q);
    setTypeFilter(typeParam);
    setSortBy(parseItemCollectionSort(sortParam));
  }
  useEffect(() => {
    form.setValue("search", q);
  }, [q, form]);

  return (
    <div className="relative flex flex-col h-dvh overflow-hidden bg-background text-foreground z-0">
      <Header />

      {canSelectItems && (
        <>
          <BulkMoveModal
            isOpen={moveModalOpen}
            onClose={() => setMoveModalOpen(false)}
            itemIds={selectedItemIdsArray}
            excludeShelfIds={selectedSourceShelfIds}
            onSuccess={handleBulkMoveSuccess}
          />
          <BulkDeleteModal
            isOpen={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            itemIds={selectedItemIdsArray}
            onSuccess={handleBulkDeleteSuccess}
          />
        </>
      )}

      <div
        className={cn(
          "flex-1 overflow-y-auto p-4 md:p-6",
          selectionMode ? "pb-28" : "pb-24 md:pb-6",
        )}
      >
        <div className="max-w-7xl w-full mx-auto flex flex-col gap-6 animate-fade-in duration-300">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <LayoutGrid className="size-6 text-primary" />
              <h1 className="text-xl md:text-2xl font-black tracking-tight">
                {t("items.title")}
              </h1>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {t("items.collection.subtitle")}
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSearch)}
                className="flex-1"
              >
                <FormField
                  control={form.control}
                  name="search"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="relative w-full flex items-center">
                          <Search className="pointer-events-none absolute left-3.5 z-10 size-4 text-muted-foreground" />
                          <Input
                            type="search"
                            placeholder={t("common.search")}
                            className="h-11 w-full rounded-2xl border border-border/80 bg-zinc-50/5 pl-10 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/20"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              handleSearchChange(e);
                            }}
                          />
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            <ItemCollectionSortSelect
              value={sortBy}
              onValueChange={(value) => {
                setSortBy(value);
                replaceParams({ sort: value });
              }}
              className="w-full md:w-52 rounded-2xl h-11"
              placeholderKey="items.collection.sortBy"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setTypeFilter("all");
                replaceParams({ type: null });
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-colors",
                typeFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-zinc-50/5 dark:bg-zinc-950/20 border-border/80 text-muted-foreground hover:text-foreground",
              )}
            >
              {t("items.collection.filters.all")}
            </button>
            {COLLECTION_SHELF_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setTypeFilter(type);
                  replaceParams({ type });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-colors",
                  typeFilter === type
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-zinc-50/5 dark:bg-zinc-950/20 border-border/80 text-muted-foreground hover:text-foreground",
                )}
              >
                <ShelfTypeIcon type={type} className="size-3.5" />
                {t(`shelf.type.${type}`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>
              {sortedItems.length}{" "}
              {sortedItems.length === 1 ? t("common.item") : t("common.items")}
            </span>
            {totalValue.total > 0 && (
              <span className="text-emerald-500">
                {t("items.collection.estimatedValue")}:{" "}
                {totalValue.includesEstimates ? "~" : ""}
                {totalValue.total.toFixed(2)} €
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
              {Array.from({ length: 16 }).map((_, idx) => (
                <Skeleton
                  key={idx}
                  className="rounded-2xl w-full"
                  style={{ aspectRatio: "1 / 1.4" }}
                />
              ))}
            </div>
          ) : sortedItems.length > 0 ? (
            <LayoutGroup id="collection-grid">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                {sortedItems.map((item, index) =>
                  !item.id ? (
                    <Skeleton
                      key={`skeleton-${index}`}
                      className="rounded-2xl w-full"
                      style={{ aspectRatio: "1 / 1.4" }}
                    />
                  ) : (
                    <CollectionGridItem
                      key={item.id}
                      item={item}
                      index={index}
                      selectionMode={selectionMode}
                      isSelected={selectedItemIds.has(item.id)}
                      canSelect={
                        canSelectItems &&
                        hasPermission(item.userId ?? item.shelf?.userId)
                      }
                      onSelect={beginSelection}
                    />
                  ),
                )}
              </div>
            </LayoutGroup>
          ) : (
            <div className="text-sm text-muted-foreground py-16 text-center bg-zinc-50/10 dark:bg-zinc-950/20 border border-dashed border-border rounded-3xl">
              {t("items.collection.noItems")}
            </div>
          )}
        </div>
      </div>

      {selectionMode && canSelectItems && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 backdrop-blur-md shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={exitSelectionMode}
              aria-label={t("items.bulkMove.cancelSelection")}
            >
              <X className="size-5" />
            </Button>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {t("items.bulkMove.selectedCount").replace(
                "{count}",
                String(selectedItemIds.size),
              )}
            </span>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl px-2.5 sm:px-3"
                onClick={() =>
                  allVisibleSelected
                    ? setSelectedItemIds(new Set())
                    : selectAllVisibleItems()
                }
              >
                {allVisibleSelected
                  ? t("items.bulkMove.clearSelection")
                  : t("items.bulkMove.selectAll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 px-2.5 sm:px-3"
                disabled={selectedItemIds.size === 0 || isBulkRefreshing}
                onClick={handleBulkRefresh}
              >
                {isBulkRefreshing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                <span className="hidden sm:inline">
                  {t("items.bulkRefresh.action")}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 px-2.5 sm:px-3 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                disabled={selectedItemIds.size === 0}
                onClick={() => setDeleteModalOpen(true)}
              >
                <Trash2 className="size-4" />
                <span className="hidden sm:inline">
                  {t("items.bulkDelete.action")}
                </span>
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-xl gap-1.5 px-3 font-semibold"
                disabled={selectedItemIds.size === 0}
                onClick={() => setMoveModalOpen(true)}
              >
                <ArrowRightLeft className="size-4" />
                {t("items.bulkMove.moveAction")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!selectionMode && <ScanFAB />}
    </div>
  );
}

export default function ItemsPage() {
  const { t } = useLocale();

  return (
    <Suspense
      fallback={<div className="p-6 text-sm">{t("common.loading")}</div>}
    >
      <ItemsPageComponent />
    </Suspense>
  );
}
