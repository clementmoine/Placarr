"use client";

import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense, useCallback, useMemo, useState, useEffect, memo } from "react";
import { Compass, Plus, Wrench, Pizza, Search, ChevronDown, ListPlus, ScanLine, Layers, CheckSquare, ArrowRightLeft, RefreshCw, Loader2, X } from "lucide-react";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, LayoutGroup } from "framer-motion";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/Header";
import { ItemCard } from "@/components/ItemCard";
import {
  ItemCollectionFilterBar,
  ItemCollectionSortSelect,
} from "@/components/ItemCollectionControls";
import { ItemModal } from "@/components/modals/ItemModal";
import { BulkAddModal, type BulkAddTab } from "@/components/modals/BulkAddModal";
import { BulkMoveModal } from "@/components/modals/BulkMoveModal";
import { ScannerButton } from "@/components/ScannerButton";
import { ShelfModal } from "@/components/modals/ShelfModal";
import { ScanFAB } from "@/components/ScanFAB";

import { saveItem, refreshItemsBatch } from "@/lib/api/items";
import { useDebounce } from "@/lib/client/hooks/useDebounce";
import { getShelf, saveShelf } from "@/lib/api/shelves";
import { useAccount } from "@/lib/client/hooks/useAccount";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import colorLib from "color";
import { getAspectRatio } from "@/lib/text/cardFormat";
import { itemPath, slugify } from "@/lib/routing/slugs";
import { syncItemQueries, syncShelfQueries } from "@/lib/item/queryCache";
import {
  collectionFiltersToSearchParams,
  parseItemCollectionFilters,
  parseItemCollectionSort,
  queryCollectionItems,
  sumCollectionEstimatedValue,
  type ItemCollectionFilters,
  type ItemCollectionSort,
} from "@/lib/item/collectionQuery";
import { useRefetchShelfItemsWhenMetadataIdle } from "@/lib/item/useRefetchItemWhenMetadataIdle";
import { cn } from "@/lib/core/utils";
import { isItemMetadataBusy } from "@/lib/item/enrichment";
import { releaseStuckOverlayLocks } from "@/lib/dev/overlayLock";

import type { Shelf, Prisma, Item } from "@prisma/client";
import type { ShelfWithItemCount } from "@/types/shelves";
import type { ItemWithMetadata } from "@/types/items";

const itemSearchSchema = z.object({
  search: z.string(),
});

type FormValues = z.infer<typeof itemSearchSchema>;

type ShelfGridItemProps = {
  item: ItemWithMetadata;
  index: number;
  shelf?: Shelf & { cardFormat?: string | null };
  resolvedShelfId: string;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (itemId: string) => void;
};

const ShelfGridItem = memo(function ShelfGridItem({
  item,
  index,
  shelf,
  resolvedShelfId,
  selectionMode,
  isSelected,
  onToggleSelect,
}: ShelfGridItemProps) {
  const queryClient = useQueryClient();
  const cardItem = useMemo(() => {
    const cached = queryClient.getQueryData<ItemWithMetadata>([
      "shelf",
      resolvedShelfId,
      "items",
      item.id,
    ]);
    if (!cached) return item;
    return {
      ...item,
      priceNew: item.priceNew ?? cached.priceNew ?? null,
      priceUsed: item.priceUsed ?? cached.priceUsed ?? null,
      priceUsedCIB: item.priceUsedCIB ?? cached.priceUsedCIB ?? null,
    };
  }, [item, queryClient, resolvedShelfId]);

  const card = (
    <ItemCard
      {...cardItem}
      shelfType={shelf?.type}
      cardFormat={shelf?.cardFormat}
      priority={index < 4}
    />
  );

  if (selectionMode) {
    return (
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => onToggleSelect(item.id)}
        className={cn(
          "relative block w-full rounded-2xl text-left transition-[box-shadow,transform]",
          isSelected &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        {card}
        {isSelected && (
          <span className="absolute top-2 right-2 z-20 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            <CheckSquare className="size-3.5" />
          </span>
        )}
      </button>
    );
  }

  return (
    <motion.div
      layoutId={`item-card-${item.id}`}
      layout
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
    >
      <Link href={itemPath(shelf || { id: resolvedShelfId }, item)}>{card}</Link>
    </motion.div>
  );
});

function ShelfComponent() {
  const params = useParams();
  const { isGuest, isAuthenticated, hasPermission } = useAccount();
  const { t } = useLocale();
  const shelfId = params.shelfId as Shelf["id"];

  const [editingItemId, setEditingItemId] = useState<Item["id"]>();
  const [visibleModal, setVisibleModal] = useState<"shelf" | "item" | "bulk">();
  const [bulkInitialTab, setBulkInitialTab] = useState<BulkAddTab>("names");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const searchParams = useSearchParams();
  const sortParam = searchParams.get("sort");
  const [sortBy, setSortBy] = useState<ItemCollectionSort>(
    parseItemCollectionSort(sortParam),
  );
  const [filters, setFilters] = useState<ItemCollectionFilters>(() =>
    parseItemCollectionFilters(searchParams),
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [moveModalOpen, setMoveModalOpen] = useState(false);

  const router = useRouter();
  const q = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(q);

  const form = useForm<FormValues>({
    resolver: zodResolver(itemSearchSchema),
    defaultValues: { search: q },
  });

  const debounce = useDebounce();

  const queryClient = useQueryClient();

  useEffect(() => {
    form.setValue("search", q);
    setSearchQuery(q);
    setSortBy(parseItemCollectionSort(searchParams.get("sort")));
    setFilters(parseItemCollectionFilters(searchParams));
  }, [q, searchParams, form]);

  const replaceCollectionParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const {
    data: shelf,
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["shelf", shelfId, searchQuery],
    queryFn: () => getShelf(shelfId, searchQuery),
    staleTime: 60_000,
    refetchOnMount: true,
    // While any freshly-added item is still being enriched in the background,
    // poll so its metadata appears as soon as it lands; stop once none remain.
    refetchInterval: (query) => {
      const items = (query.state.data as { items?: unknown[] } | undefined)
        ?.items;
      if (!Array.isArray(items)) return false;
      return items.some((item) =>
        isItemMetadataBusy(item as Parameters<typeof isItemMetadataBusy>[0]),
      )
        ? 2500
        : false;
    },
    placeholderData: (previousData) => {
      if (previousData) return previousData;

      const shelf = queryClient
        .getQueryData<ShelfWithItemCount[]>(["shelves"])
        ?.find(
          (s) =>
            s.id === shelfId ||
            s.slug === shelfId ||
            slugify(s.name) === shelfId,
        );

      if (!shelf) return undefined;

      // Fake items for proper skeleton
      return {
        ...(shelf as Shelf),
        items: Array.from({ length: shelf._count.items ?? 1 }).map<Item>(
          () => ({
            id: "",
            name: "",
            slug: null,
            imageUrl: null,
            backgroundImageUrl: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            shelfId: shelfId,
            description: null,
            barcode: null,
            condition: "new",
            metadataId: null,
            metadataRefreshStartedAt: null,
            userId: shelf?.userId || "",
          }),
        ),
      } as any;
    },
  });

  useRefetchShelfItemsWhenMetadataIdle(queryClient, shelf?.items, shelfId);

  const { mutate: shelfMutate } = useMutation<
    Shelf,
    Error,
    Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput
  >({
    mutationFn: saveShelf,
    onSuccess: (updatedShelf: Shelf) => {
      void syncShelfQueries(queryClient, updatedShelf);
    },
    onError: () => {
      toast.error(t("shelves.createUpdateError"));
    },
  });

  const { mutate: itemMutate } = useMutation<
    Item,
    Error,
    Prisma.ItemCreateInput | Prisma.ItemUpdateInput
  >({
    mutationFn: saveItem,
    onSuccess: (item, variables) => {
      const isCreate = !("id" in variables && variables.id);
      void syncItemQueries(queryClient, item, [item.shelfId], { isCreate });
    },
    onError: () => {
      toast.error(t("items.saveFailed"));
    },
  });

  const sortedItems = useMemo(() => {
    if (!shelf?.items) return [];

    const items = shelf.items as unknown as ItemWithMetadata[];

    return queryCollectionItems(items, {
      sortBy,
      filters,
      shelfType: shelf.type,
    });
  }, [shelf?.items, shelf?.type, sortBy, filters]);

  const totalValue = useMemo(() => {
    if (!shelf?.items) return 0;
    const items = shelf.items as unknown as ItemWithMetadata[];
    return sumCollectionEstimatedValue(
      queryCollectionItems(items, {
        sortBy: "name_asc",
        filters,
        shelfType: shelf.type,
      }),
      shelf.type,
    );
  }, [shelf?.items, shelf?.type, filters]);

  const handleModalClose = useCallback(() => {
    setVisibleModal(undefined);
    setEditingItemId(undefined);
    releaseStuckOverlayLocks();
  }, []);

  const handleShelfModalSubmit = useCallback(
    async (shelf: Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput) => {
      return new Promise<void>((resolve, reject) => {
        shelfMutate(shelf, {
          onSuccess: () => resolve(),
          onError: (error) => reject(error),
        });
      });
    },
    [shelfMutate],
  );

  const handleItemModalSubmit = useCallback(
    async (item: Prisma.ItemCreateInput | Prisma.ItemUpdateInput) => {
      return new Promise<void>((resolve, reject) => {
        itemMutate(item, {
          onSuccess: () => resolve(),
          onError: (error) => reject(error),
        });
      });
    },
    [itemMutate],
  );

  const handleSearch = (values: FormValues) => {
    const value = values.search;
    setSearchQuery(value);
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setValue("search", value);
    debounce(() => {
      setSearchQuery(value);
      const params = new URLSearchParams(window.location.search);
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      try {
        History.prototype.replaceState.call(
          window.history,
          { ...window.history.state, as: newUrl, url: newUrl },
          "",
          newUrl,
        );
      } catch {
        window.history.replaceState(
          { ...window.history.state, as: newUrl, url: newUrl },
          "",
          newUrl,
        );
      }
    });
  };

  const handleModalOpen = useCallback(
    (modal: "shelf" | "item" | "bulk", id?: Item["id"], bulkTab?: BulkAddTab) => {
      if (bulkTab) setBulkInitialTab(bulkTab);
      setVisibleModal(modal);

      if (id !== null) {
        setEditingItemId(id);
      }
    },
    [],
  );

  const openModalFromAddMenu = useCallback(
    (modal: "item" | "bulk", bulkTab: BulkAddTab = "names") => {
      setAddMenuOpen(false);
      window.setTimeout(() => {
        releaseStuckOverlayLocks();
        setEditingItemId(undefined);
        setBulkInitialTab(bulkTab);
        setVisibleModal(modal);
      }, 0);
    },
    [],
  );

  const handleBulkAddSuccess = useCallback(
    (count: number) => {
      if (count <= 0) return;
      queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
    },
    [queryClient, shelfId],
  );

  const selectedItemIdsArray = useMemo(
    () => Array.from(selectedItemIds),
    [selectedItemIds],
  );

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedItemIds(new Set());
    setMoveModalOpen(false);
  }, []);

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const selectAllVisibleItems = useCallback(() => {
    setSelectedItemIds(
      new Set(sortedItems.map((item) => item.id).filter(Boolean)),
    );
  }, [sortedItems]);

  const handleBulkMoveSuccess = useCallback(
    (result: {
      count: number;
      targetShelfId: string;
      sourceShelfIds: string[];
    }) => {
      exitSelectionMode();
      for (const id of new Set([...result.sourceShelfIds, result.targetShelfId])) {
        queryClient.invalidateQueries({ queryKey: ["shelf", id] });
      }
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
      queryClient.invalidateQueries({ queryKey: ["collectionItems"] });
      queryClient.invalidateQueries({ queryKey: ["searchItems"] });
    },
    [exitSelectionMode, queryClient],
  );

  const { mutate: bulkRefreshMutation, isPending: isBulkRefreshing } =
    useMutation({
      mutationFn: refreshItemsBatch,
      onSuccess: (result) => {
        toast.success(
          t("items.bulkRefresh.success").replace("{count}", String(result.count)),
        );
        queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
        queryClient.invalidateQueries({ queryKey: ["shelves"] });
      },
      onError: () => {
        toast.error(t("items.bulkRefresh.failed"));
      },
    });

  const handleBulkRefresh = useCallback(() => {
    if (selectedItemIds.size === 0) return;
    bulkRefreshMutation({
      itemIds: selectedItemIdsArray,
      sourceShelfId: shelfId,
    });
  }, [bulkRefreshMutation, selectedItemIds.size, selectedItemIdsArray, shelfId]);

  const canEdit = useMemo(() => {
    if (!shelf) return false;

    return hasPermission(shelf.userId);
  }, [shelf, hasPermission]);

  const resolvedShelfId = shelf?.id || shelfId;

  const safeColor = useMemo(() => {
    if (!shelf?.color) return undefined;
    try {
      return colorLib(shelf.color);
    } catch {
      return undefined;
    }
  }, [shelf?.color]);

  const shelfTextColor = useMemo(() => {
    if (!safeColor) return undefined;
    return safeColor.lighten(0.1).string();
  }, [safeColor]);

  const skeletonAspectRatio = useMemo(() => {
    return getAspectRatio(shelf?.cardFormat, shelf?.type);
  }, [shelf?.cardFormat, shelf?.type]);

  if (!isLoading && (isError || !shelf?.id)) {
    return (
      <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground z-0">
        <Header />
        <div className="overflow-y-auto">
          <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 p-6 text-center">
            <Compass className="size-10 text-muted-foreground" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("errors.notFoundTitle")}
              </h1>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("errors.notFoundMessage")}
              </p>
            </div>
            <Button asChild>
              <Link href="/shelves">{t("errors.goHome")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-dvh overflow-hidden bg-background text-foreground z-0">
      {/* Header */}
      <Header />

      {/* Modals */}
      {isAuthenticated && !isGuest && canEdit && (
        <>
          <ShelfModal
            shelfId={shelf?.id}
            isOpen={visibleModal === "shelf"}
            onClose={handleModalClose}
            onSubmit={handleShelfModalSubmit}
          />
          <ItemModal
            shelfId={resolvedShelfId}
            shelfType={shelf?.type}
            itemId={editingItemId}
            isOpen={visibleModal === "item"}
            onClose={handleModalClose}
            onSubmit={handleItemModalSubmit}
          />
          {visibleModal === "bulk" && (
            <BulkAddModal
              shelfId={resolvedShelfId}
              shelfName={shelf?.name}
              shelfType={shelf?.type}
              initialTab={bulkInitialTab}
              isOpen
              onClose={handleModalClose}
              onSuccess={handleBulkAddSuccess}
            />
          )}
          <BulkMoveModal
            isOpen={moveModalOpen}
            onClose={() => setMoveModalOpen(false)}
            itemIds={selectedItemIdsArray}
            sourceShelfId={resolvedShelfId}
            onSuccess={handleBulkMoveSuccess}
          />
        </>
      )}

      {/* Content */}
      <div className="overflow-y-auto">
        <div className={cn(
          "flex-1 p-4 md:p-6 flex flex-col gap-6 max-w-7xl w-full mx-auto animate-fade-in duration-300",
          selectionMode ? "pb-36 md:pb-28" : "pb-24 md:pb-6",
        )}>
          {/* Clean Shelf Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2 w-full">
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-foreground dark:text-white">
                <ShelfTypeIcon type={shelf?.type} className="size-8" />
              </span>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground dark:text-white leading-none">
                    {shelf?.name || "..."}
                  </h1>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {isAuthenticated && !isGuest && canEdit && (
              <div className="flex items-center gap-2 shrink-0 select-none">
                {selectionMode ? (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary">
                    <CheckSquare className="size-4 shrink-0" />
                    <span>{t("items.bulkMove.selectMode")}</span>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      className="rounded-xl h-10 px-4 text-sm font-bold shadow-sm cursor-pointer flex items-center gap-1.5 bg-card hover:bg-accent hover:text-accent-foreground text-foreground border border-border dark:border-zinc-800"
                      onClick={() => setSelectionMode(true)}
                    >
                      <CheckSquare className="size-4" />
                      {t("items.bulkMove.selectMode")}
                    </Button>

                    <Button
                      variant="secondary"
                      className="bg-card hover:bg-accent hover:text-accent-foreground text-foreground border border-border dark:border-zinc-800 rounded-xl h-10 px-4 text-sm font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
                      onClick={() => handleModalOpen("shelf")}
                    >
                      <Wrench className="size-4" />
                      {t("shelves.editShelf")}
                    </Button>

                    <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen} modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button className="rounded-xl h-10 px-4 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer flex items-center gap-1.5">
                          <Plus className="size-4" />
                          {t("items.addItem")}
                          <ChevronDown className="size-4 opacity-80" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem
                          className="cursor-pointer font-medium"
                          onSelect={() => openModalFromAddMenu("item")}
                        >
                          <Plus className="size-4 mr-2" />
                          {t("items.addItem")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer font-medium"
                          onSelect={() => openModalFromAddMenu("bulk", "names")}
                        >
                          <ListPlus className="size-4 mr-2" />
                          {t("items.bulkAdd.menuLabel")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer font-medium"
                          onSelect={() => openModalFromAddMenu("bulk", "scan")}
                        >
                          <ScanLine className="size-4 mr-2" />
                          {t("items.bulkAdd.tabScan")}
                        </DropdownMenuItem>
                        {shelf?.type === "books" && (
                          <DropdownMenuItem
                            className="cursor-pointer font-medium"
                            onSelect={() => openModalFromAddMenu("bulk", "series")}
                          >
                            <Layers className="size-4 mr-2" />
                            {t("items.bulkSeries.menuLabel")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Search and Sort controls */}
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <div className="flex-1">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSearch)}>
                  <FormField
                    control={form.control}
                    name="search"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="hidden">
                          {t("common.search")}
                        </FormLabel>
                        <FormControl>
                          <div className="relative w-full flex items-center">
                            <Search className="absolute left-3.5 size-4 text-muted-foreground pointer-events-none z-10" />
                            <Input
                              type="search"
                              autoFocus
                              className="w-full pr-10 pl-10 bg-zinc-50/5 dark:bg-zinc-950/20 backdrop-blur-md border border-border/80 dark:border-zinc-800/80 rounded-2xl h-11 focus:ring-2 focus:ring-primary/20 transition-all duration-300 [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none"
                              placeholder={t("common.search")}
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                handleSearchChange(e);
                              }}
                            />
                            <ScannerButton
                              className="absolute right-1 rounded-xl"
                              onScan={(barcode) => {
                                handleSearch({ search: barcode });
                              }}
                            />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </div>

            <div className="w-full sm:w-[220px] shrink-0">
              <ItemCollectionSortSelect
                value={sortBy}
                onValueChange={(value) => {
                  setSortBy(value);
                  replaceCollectionParams({ sort: value });
                }}
              />
            </div>
          </div>

          <ItemCollectionFilterBar
            filters={filters}
            onChange={(next) => {
              setFilters(next);
              replaceCollectionParams(collectionFiltersToSearchParams(next));
            }}
          />

          {/* Items Grid */}
          <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
            <h2 className="text-xl font-semibold">
              {sortedItems.length || 0}{" "}
              {sortedItems.length === 1 ? "item" : "items"}
            </h2>

            {totalValue > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm backdrop-blur-md">
                <span>Valeur estimée :</span>
                <span className="font-extrabold text-sm">
                  {totalValue.toFixed(2)} €
                </span>
              </div>
            )}
          </div>
          <LayoutGroup id={selectionMode ? "shelf-select" : "shelf-grid"}>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 mt-4">
              {sortedItems.map((item, index) =>
                isLoading || !item.id ? (
                  <Skeleton
                    key={`skeleton-${index}`}
                    className="flex rounded-xl w-full"
                    style={{
                      aspectRatio: skeletonAspectRatio,
                    }}
                  />
                ) : (
                  <ShelfGridItem
                    key={item.id}
                    item={item}
                    index={index}
                    shelf={shelf}
                    resolvedShelfId={resolvedShelfId}
                    selectionMode={selectionMode}
                    isSelected={selectedItemIds.has(item.id)}
                    onToggleSelect={toggleItemSelection}
                  />
                ),
              )}

              {/* Plus Add Item Card in the items grid */}
              {!isLoading && isAuthenticated && !isGuest && canEdit && !selectionMode && (
                <motion.button
                  layout
                  layoutId="add-item-btn"
                  onClick={() => handleModalOpen("item")}
                  className="w-full flex flex-col items-center justify-center border border-dashed border-border/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/5 hover:bg-zinc-100/10 dark:bg-zinc-950/5 dark:hover:bg-zinc-900/10 transition-all duration-300 gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm font-bold shadow-sm select-none"
                  style={{ aspectRatio: skeletonAspectRatio }}
                >
                  <Plus className="size-5 text-primary" />
                  <span>{t("items.addItem")}</span>
                </motion.button>
              )}
            </div>
          </LayoutGroup>

          {/* Empty state for non-editable shelves */}
          {sortedItems.length === 0 &&
            !isLoading &&
            (!isAuthenticated || isGuest || !canEdit) && (
              <div className="flex flex-col items-center justify-center py-12 select-none">
                <Pizza className="size-12 text-zinc-400 dark:text-zinc-650 mb-3 animate-pulse" />
                <p className="text-muted-foreground text-xs">
                  {t("items.noItems")}
                </p>
              </div>
            )}
        </div>
      </div>

      {selectionMode && canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 backdrop-blur-md shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-7xl flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-xl gap-1.5 font-semibold"
                onClick={exitSelectionMode}
              >
                <X className="size-4" />
                {t("items.bulkMove.cancelSelection")}
              </Button>
              <span className="truncate text-sm font-semibold text-foreground">
                {t("items.bulkMove.selectedCount").replace(
                  "{count}",
                  String(selectedItemIds.size),
                )}
              </span>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:justify-end">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl px-3"
                  onClick={selectAllVisibleItems}
                >
                  {t("items.bulkMove.selectAll")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl px-3"
                  onClick={() => setSelectedItemIds(new Set())}
                >
                  {t("items.bulkMove.clearSelection")}
                </Button>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5 px-3"
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
        </div>
      )}

      {!selectionMode && <ScanFAB />}
    </div>
  );
}

export default function ShelfPage() {
  const { t } = useLocale();

  return (
    <Suspense fallback={<div>{t("common.loading")}</div>}>
      <ShelfComponent />
    </Suspense>
  );
}
