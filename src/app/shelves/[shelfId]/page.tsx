"use client";

import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  memo,
} from "react";
import {
  Compass,
  Plus,
  Wrench,
  Pizza,
  Search,
  ChevronDown,
  ListPlus,
  ScanLine,
  Layers,
  Check,
  ArrowRightLeft,
  RefreshCw,
  Loader2,
  X,
  Trash2,
} from "lucide-react";
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
import { groupCopies } from "@/core/collect/groupCopies";
import { ItemCollectionSortSelect } from "@/components/ItemCollectionControls";
import { ItemModal } from "@/components/modals/ItemModal";
import { PrintPickerModal } from "@/components/modals/PrintPickerModal";
import {
  BulkAddModal,
  type BulkAddTab,
} from "@/components/modals/BulkAddModal";
import { BulkMoveModal } from "@/components/modals/BulkMoveModal";
import { BulkDeleteModal } from "@/components/modals/BulkDeleteModal";
import { ScannerButton } from "@/components/ScannerButton";
import { ShelfModal } from "@/components/modals/ShelfModal";
import { ScanFAB } from "@/components/ScanFAB";

import { saveItem, refreshItemsBatch } from "@/lib/api/items";
import { useDebounce } from "@/lib/client/hooks/useDebounce";
import { useDocumentTitle } from "@/lib/client/hooks/useDocumentTitle";
import { getShelf, saveShelf } from "@/lib/api/shelves";
import { useAccount } from "@/lib/client/hooks/useAccount";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { getAspectRatio } from "@/lib/text/cardFormat";
import { itemPath, slugify } from "@/lib/routing/slugs";
import {
  syncItemQueries,
  syncShelfQueries,
  invalidateShelfQueries,
} from "@/core/collect/queryCache";
import { itemIdsInVisibleRange } from "@/core/collect/selectionRange";
import {
  parseItemCollectionSort,
  queryCollectionItems,
  summarizeCollectionEstimatedValue,
  type ItemCollectionSort,
} from "@/core/collect/collectionQuery";
import { useRefetchShelfItemsWhenMetadataIdle } from "@/core/collect/useRefetchItemWhenMetadataIdle";
import { cn } from "@/lib/shared/utils";
import { metadataBusyRefetchInterval } from "@/core/collect/enrichment";
import type { ItemMetadataIdleFields } from "@/core/collect/useRefetchItemWhenMetadataIdle";
import { releaseStuckOverlayLocks } from "@/lib/dev/overlayLock";

import type { Shelf, Prisma, Item } from "@/generated/prisma/browser";
import type { ShelfWithItemCount } from "@/types/shelves";
import { usesPrintSearch } from "@/lib/printSearchTypes";
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
  canSelect: boolean;
  /** How many copies this tile stands for. 1 means it stands for itself. */
  copyCount: number;
  onSelect: (itemId: string, options?: { shiftKey?: boolean }) => void;
};

const ShelfGridItem = memo(function ShelfGridItem({
  item,
  index,
  shelf,
  resolvedShelfId,
  selectionMode,
  isSelected,
  canSelect,
  copyCount,
  onSelect,
}: ShelfGridItemProps) {
  const { t } = useLocale();

  const card = (
    <ItemCard
      {...item}
      copyCount={copyCount}
      shelfType={shelf?.type}
      shelfName={shelf?.name}
      cardFormat={shelf?.cardFormat}
      priority={index < 4}
    />
  );

  // Checkbox affordance: hidden until hover on pointer devices, always shown on
  // touch and whenever selecting. Clicking it starts/continues selection —
  // there is no separate "enter selection mode" button. Shift+click selects
  // the contiguous range from the last clicked item.
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

  // Keep one outer shell in both modes so entering selection does not remount
  // the grid (framer-motion layout + Link→button swap was scrolling to top).
  return (
    <motion.div
      layoutId={`item-card-${item.id}`}
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
          onClick={(event) => onSelect(item.id, { shiftKey: event.shiftKey })}
          className="block w-full text-left"
        >
          {card}
        </button>
      ) : (
        <Link href={itemPath(shelf || { id: resolvedShelfId }, item)}>
          {card}
        </Link>
      )}
      {checkbox}
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Anchor for Shift+click range select (last plain click). Cleared on exit.
  const selectionAnchorIdRef = useRef<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const router = useRouter();
  const q = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(q);

  const form = useForm<FormValues>({
    resolver: zodResolver(itemSearchSchema),
    defaultValues: { search: q },
  });

  const debounce = useDebounce();

  const queryClient = useQueryClient();

  // L'état local suit le paramètre d'URL : ajusté pendant le render (pattern
  // « adjust state when props change ») ; seule l'écriture du store externe
  // react-hook-form reste dans un effect.
  const paramsKey = searchParams.toString();
  const [prevParamsKey, setPrevParamsKey] = useState(paramsKey);
  if (prevParamsKey !== paramsKey) {
    setPrevParamsKey(paramsKey);
    setSearchQuery(q);
    setSortBy(parseItemCollectionSort(searchParams.get("sort")));
  }
  useEffect(() => {
    form.setValue("search", q);
  }, [q, form]);

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
      return metadataBusyRefetchInterval(items as ItemMetadataIdleFields[]);
    },
    refetchIntervalInBackground: true,
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
            printKey: null,
            variant: null,
            barcode: null,
            condition: "new",
            metadataId: null,
            metadataRefreshStartedAt: null,
            metadataRefreshGeneration: 0,
            userId: shelf?.userId || "",
          }),
        ),
      };
    },
  });

  useDocumentTitle(shelf?.name);
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
      const itemShelfSlug =
        "shelf" in item &&
        item.shelf &&
        typeof item.shelf === "object" &&
        "slug" in item.shelf
          ? (item.shelf.slug as string | null | undefined)
          : undefined;
      void syncItemQueries(
        queryClient,
        item,
        [item.shelfId, shelfId, itemShelfSlug],
        { isCreate },
      );
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
      shelfType: shelf.type,
    });
  }, [shelf, sortBy]);

  /**
   * Copies of the same object share a tile.
   *
   * `Item` stays one physical copy — each has its own condition, price and
   * loan — so this is purely a display fold, applied after sorting so a group
   * appears where its first copy did. See `docs/tcg_support.md` §4.
   */
  const groupedItems = useMemo(() => groupCopies(sortedItems), [sortedItems]);

  const totalValue = useMemo(() => {
    if (!shelf?.items) return { total: 0, includesEstimates: false };
    const items = shelf.items as unknown as ItemWithMetadata[];
    return summarizeCollectionEstimatedValue(
      queryCollectionItems(items, {
        sortBy: "name_asc",
        shelfType: shelf.type,
      }),
      shelf.type,
    );
  }, [shelf]);

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

  /**
   * Nothing on this shelf carries a barcode, so every scan affordance is dead
   * weight here — worse, the scan FAB pre-fills the current shelf and would
   * file a boxed product among the singles.
   */
  const isPrintSearchShelf = usesPrintSearch(shelf?.type);
  /** Adding to a barcode-less shelf goes through the print picker instead. */
  const usesPrintPicker = isPrintSearchShelf && !editingItemId;

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
    (
      modal: "shelf" | "item" | "bulk",
      id?: Item["id"],
      bulkTab?: BulkAddTab,
    ) => {
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
    selectionAnchorIdRef.current = null;
    setMoveModalOpen(false);
    setDeleteModalOpen(false);
  }, []);

  // Escape mirrors the single "close" affordance in the selection bar.
  useEffect(() => {
    if (!selectionMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitSelectionMode();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode, exitSelectionMode]);

  const visibleItemIds = useMemo(
    () => sortedItems.map((item) => item.id).filter(Boolean) as string[],
    [sortedItems],
  );

  // Single entry point: (re)enter selection and toggle / range-select.
  // Plain click toggles and sets the Shift anchor; Shift+click selects the
  // contiguous visible range from the anchor to the clicked item.
  const beginSelection = useCallback(
    (itemId: string, options?: { shiftKey?: boolean }) => {
      setAddMenuOpen(false);
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

  const handleBulkMoveSuccess = useCallback(
    (result: {
      count: number;
      targetShelfId: string;
      sourceShelfIds: string[];
    }) => {
      exitSelectionMode();
      void invalidateShelfQueries(queryClient, [
        ...result.sourceShelfIds,
        result.targetShelfId,
      ]);
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
      queryClient.invalidateQueries({ queryKey: ["collectionItems"] });
      queryClient.invalidateQueries({ queryKey: ["searchItems"] });
    },
    [exitSelectionMode, queryClient],
  );

  const handleBulkDeleteSuccess = useCallback(
    (result: { count: number; sourceShelfIds: string[] }) => {
      exitSelectionMode();
      void invalidateShelfQueries(queryClient, result.sourceShelfIds);
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
          t("items.bulkRefresh.success").replace(
            "{count}",
            String(result.count),
          ),
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
  }, [
    bulkRefreshMutation,
    selectedItemIds.size,
    selectedItemIdsArray,
    shelfId,
  ]);

  const canEdit = useMemo(() => {
    if (!shelf) return false;

    return hasPermission(shelf.userId);
  }, [shelf, hasPermission]);

  const resolvedShelfId = shelf?.id || shelfId;

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
          {/* Cards have no barcode: adding one starts from a print search,
              not from the scan-oriented item form. Editing keeps the normal
              form, which is about the copy rather than the printing. */}
          <ItemModal
            shelfId={resolvedShelfId}
            shelfType={shelf?.type}
            itemId={editingItemId}
            isOpen={visibleModal === "item" && !usesPrintPicker}
            onClose={handleModalClose}
            onSubmit={handleItemModalSubmit}
          />
          {shelf?.type && (
            <PrintPickerModal
              shelfId={resolvedShelfId}
              shelfType={shelf.type}
              isOpen={visibleModal === "item" && usesPrintPicker}
              onClose={handleModalClose}
              onAdded={() => {
                void queryClient.invalidateQueries({
                  queryKey: ["shelf", shelfId],
                });
              }}
            />
          )}
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
          <BulkDeleteModal
            isOpen={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            itemIds={selectedItemIdsArray}
            sourceShelfId={resolvedShelfId}
            onSuccess={handleBulkDeleteSuccess}
          />
        </>
      )}

      {/* Content */}
      <div className="overflow-y-auto">
        <div
          className={cn(
            "flex-1 p-4 md:p-6 flex flex-col gap-6 max-w-7xl w-full mx-auto animate-fade-in duration-300",
            // Always reserve space for the fixed selection bar when the user can
            // edit — toggling pb-* on first select was shifting the scrollport.
            isAuthenticated && !isGuest && canEdit
              ? "pb-36 md:pb-28"
              : "pb-24 md:pb-6",
          )}
        >
          {/* Shelf header — title + primary actions only */}
          <div className="flex items-center justify-between gap-3 mt-2 w-full">
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 text-foreground dark:text-white">
                <ShelfTypeIcon type={shelf?.type} className="size-8" />
              </span>
              <h1 className="truncate text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground dark:text-white leading-none">
                {shelf?.name || "..."}
              </h1>
            </div>

            {/* Primary actions — keep in layout while selecting (invisible) so
                the header height does not collapse and jump scroll to top. */}
            {isAuthenticated && !isGuest && canEdit && (
              <div
                className={cn(
                  "flex items-center gap-2 shrink-0 select-none",
                  selectionMode && "invisible pointer-events-none",
                )}
                aria-hidden={selectionMode || undefined}
              >
                <Button
                  variant="secondary"
                  className="bg-card hover:bg-accent hover:text-accent-foreground text-foreground border border-border dark:border-zinc-800 rounded-xl h-10 px-3 sm:px-4 text-sm font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
                  onClick={() => handleModalOpen("shelf")}
                  tabIndex={selectionMode ? -1 : undefined}
                >
                  <Wrench className="size-4" />
                  <span className="hidden sm:inline">
                    {t("shelves.editShelf")}
                  </span>
                </Button>

                <DropdownMenu
                  open={addMenuOpen}
                  onOpenChange={setAddMenuOpen}
                  modal={false}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="rounded-xl h-10 px-4 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer flex items-center gap-1.5"
                      tabIndex={selectionMode ? -1 : undefined}
                    >
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
                    {!isPrintSearchShelf && (
                      <DropdownMenuItem
                        className="cursor-pointer font-medium"
                        onSelect={() => openModalFromAddMenu("bulk", "scan")}
                      >
                        <ScanLine className="size-4 mr-2" />
                        {t("items.bulkAdd.tabScan")}
                      </DropdownMenuItem>
                    )}
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
                            {!isPrintSearchShelf && (
                              <ScannerButton
                                className="absolute right-1 rounded-xl"
                                onScan={(barcode) => {
                                  handleSearch({ search: barcode });
                                }}
                              />
                            )}
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
                shelfType={shelf?.type}
                onValueChange={(value) => {
                  setSortBy(value);
                  replaceCollectionParams({ sort: value });
                }}
              />
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
            <h2 className="text-xl font-semibold">
              {sortedItems.length || 0}{" "}
              {sortedItems.length === 1 ? "item" : "items"}
            </h2>

            {totalValue.total > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm backdrop-blur-md">
                <span>Valeur estimée :</span>
                <span className="font-extrabold text-sm">
                  {totalValue.includesEstimates ? "~" : ""}
                  {totalValue.total.toFixed(2)} €
                </span>
              </div>
            )}
          </div>
          <LayoutGroup id="shelf-grid">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 mt-4">
              {groupedItems.map(({ key, lead: item, copies }, index) =>
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
                    key={key}
                    item={item}
                    copyCount={copies.length}
                    index={index}
                    shelf={shelf}
                    resolvedShelfId={resolvedShelfId}
                    selectionMode={selectionMode}
                    isSelected={selectedItemIds.has(item.id)}
                    canSelect={Boolean(isAuthenticated && !isGuest && canEdit)}
                    onSelect={beginSelection}
                  />
                ),
              )}

              {/* Plus Add Item Card in the items grid — keep the slot while
                  selecting so layout animations do not reflow the whole grid. */}
              {!isLoading && isAuthenticated && !isGuest && canEdit && (
                <motion.button
                  layout={!selectionMode}
                  layoutId="add-item-btn"
                  onClick={() => handleModalOpen("item")}
                  tabIndex={selectionMode ? -1 : undefined}
                  aria-hidden={selectionMode || undefined}
                  className={cn(
                    "w-full flex flex-col items-center justify-center border border-dashed border-border/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/5 hover:bg-zinc-100/10 dark:bg-zinc-950/5 dark:hover:bg-zinc-900/10 transition-all duration-300 gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm font-bold shadow-sm select-none",
                    selectionMode && "invisible pointer-events-none",
                  )}
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

      {!selectionMode &&
        (isPrintSearchShelf ? (
          /* Scanning is meaningless here, but the shortcut is not: the same
             corner offers the flow that does work — searching a printing. */
          <div className="fixed bottom-24 sm:bottom-6 right-6 z-40">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleModalOpen("item")}
              aria-label={t("items.addItem")}
              title={t("items.addItem")}
              className="size-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center focus:outline-none cursor-pointer border border-primary-foreground/10"
            >
              <Plus className="size-6" />
            </motion.button>
          </div>
        ) : (
          <ScanFAB />
        ))}
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
