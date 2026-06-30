"use client";

import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, LibraryBig, Search, Scan, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState, useEffect, Suspense } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { motion, LayoutGroup } from "framer-motion";

import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import Header from "@/components/Header";
import { ShelfCard } from "@/components/ShelfCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShelfModal } from "@/components/modals/ShelfModal";
import { ScanFAB } from "@/components/ScanFAB";
import { ScannerButton } from "@/components/ScannerButton";
import { QuickScanModal } from "@/components/modals/QuickScanModal";
import { ItemModal } from "@/components/modals/ItemModal";
import { ManualBarcodeEntry } from "@/components/ManualBarcodeEntry";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  BarcodeScannerView,
  type BarcodeScannerResult,
} from "@/components/BarcodeScannerView";

import { cn } from "@/lib/core/utils";
import { useDebounce } from "@/lib/client/hooks/useDebounce";
import { getShelves, saveShelf } from "@/lib/api/shelves";
import { getItems, saveItem } from "@/lib/api/items";
import { ItemCard } from "@/components/ItemCard";
import { useAccount } from "@/lib/client/hooks/useAccount";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { itemPath, shelfPath } from "@/lib/routing/slugs";
import { syncItemQueries, syncShelfQueries } from "@/lib/item/queryCache";
import axios from "axios";
import { ExploreItemModal } from "@/components/modals/ExploreItemModal";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import type { Shelf, Prisma } from "@prisma/client";
import type { MetadataResult } from "@/types/metadataProvider";

import styles from "./shelves.module.css";

const shelfSchema = z.object({
  search: z.string(),
});

type FormValues = z.infer<typeof shelfSchema>;

const defaultValues: FormValues = {
  search: "",
};

function ShelvesComponent() {
  const form = useForm({
    resolver: zodResolver(shelfSchema),
    defaultValues,
  });

  const router = useRouter();
  const debounce = useDebounce();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isGuest, isAuthenticated } = useAccount();
  const { t } = useLocale();

  const [editingShelfId, setEditingShelfId] = useState<Shelf["id"]>();
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  // Hero scanner states
  const [heroScannerOpen, setHeroScannerOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>("");
  const [manualBarcode, setManualBarcode] = useState<string>("");
  const [quickScanOpen, setQuickScanOpen] = useState<boolean>(false);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [prefilledItemValues, setPrefilledItemValues] = useState<
    | {
        name: string;
        imageUrl: string | null;
        barcode: string;
        shelfId?: string;
        metadataPreview?: MetadataResult | null;
      }
    | undefined
  >(undefined);

  const [selectedExploreItem, setSelectedExploreItem] = useState<any | null>(
    null,
  );
  const [exploreModalOpen, setExploreModalOpen] = useState(false);

  const q = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(q);

  const { data: shelves, isLoading } = useQuery({
    queryKey: ["shelves", searchQuery],
    queryFn: () => getShelves(searchQuery),
    placeholderData: keepPreviousData,
  });

  const { data: recentItems, isFetching: isFetchingRecent } = useQuery({
    queryKey: ["recentItems"],
    queryFn: () => getItems(),
  });

  // Search items across all shelves
  const { data: searchItems, isLoading: isLoadingSearchItems } = useQuery({
    queryKey: ["searchItems", searchQuery],
    queryFn: () => getItems(searchQuery),
    enabled: !!searchQuery,
    placeholderData: keepPreviousData,
  });

  // Search items in other users' public shelves
  const { data: exploreItems, isFetching: isFetchingExploreItems } = useQuery({
    queryKey: ["exploreItems", searchQuery],
    queryFn: async () => {
      const { data } = await axios.get(
        `/api/explore?q=${encodeURIComponent(searchQuery)}`,
      );
      return data as any[];
    },
    enabled: !!searchQuery,
  });

  const { mutate } = useMutation<
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

  const sortedShelves = useMemo(
    () => shelves?.sort((a, b) => a.name.localeCompare(b.name)) || [],
    [shelves],
  );

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setEditingShelfId(undefined);
  }, []);

  const handleModalSubmit = useCallback(
    async (shelf: Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput) => {
      return new Promise<void>((resolve, reject) => {
        mutate(shelf, {
          onSuccess: () => resolve(),
          onError: (error) => reject(error),
        });
      });
    },
    [mutate],
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

  const handleModalOpen = useCallback((id?: Shelf["id"]) => {
    setModalVisible(true);
    if (id !== null) {
      setEditingShelfId(id);
    }
  }, []);

  const handleHeroScan = (detectedCodes: BarcodeScannerResult) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const barcode = detectedCodes[0].rawValue;
      setHeroScannerOpen(false);
      toast.success(
        t("scanner.scannedSuccessfully") || "Scanned successfully!",
      );
      setScannedBarcode(barcode);
      setQuickScanOpen(true);
    }
  };

  const handleHeroScannerError = (error: unknown) => {
    console.error("Scanner error:", error);
    toast.error(t("scanner.error") || "Error scanning");
  };

  const handleManualBarcodeSubmit = (barcode: string) => {
    setManualBarcode("");
    setHeroScannerOpen(false);
    setScannedBarcode(barcode);
    setQuickScanOpen(true);
  };

  const handleSelectProduct = (product: {
    name: string;
    imageUrl: string | null;
    barcode: string;
    shelfId?: string;
    metadataPreview?: MetadataResult | null;
  }) => {
    setQuickScanOpen(false);
    setPrefilledItemValues(product);
    setIsItemModalOpen(true);
  };

  const handleItemModalSubmit = async (itemData: any) => {
    try {
      const newItem = await saveItem({
        ...itemData,
        refreshMetadata: true,
      });

      await syncItemQueries(queryClient, newItem, [newItem.shelfId], {
        isCreate: true,
      });

      toast.success(t("common.success"));
      router.push(
        itemPath((newItem as any).shelf || { id: newItem.shelfId }, newItem),
      );
    } catch (error) {
      console.error("Failed to save scanned item:", error);
      toast.error(t("items.saveFailed"));
      throw error;
    }
  };

  useEffect(() => {
    form.setValue("search", q);
    setSearchQuery(q);
  }, [q, form]);

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground z-0">
      {/* Header */}
      <Header />

      {/* Modals */}
      {isAuthenticated && !isGuest && (
        <ShelfModal
          shelfId={editingShelfId}
          isOpen={modalVisible}
          onClose={handleModalClose}
          onSubmit={handleModalSubmit}
        />
      )}

      {/* Hero Scanner Dialog */}
      <Dialog
        open={heroScannerOpen}
        onOpenChange={(open) => {
          setHeroScannerOpen(open);
          if (!open) setManualBarcode("");
        }}
      >
        <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh] w-[95vw] sm:max-w-md rounded-2xl border border-border dark:border-zinc-800 shadow-2xl">
          <DialogHeader className="p-5 border-b shrink-0 flex flex-col gap-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Scan className="size-5 text-primary" />
              {t("scanner.title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
              {t("scanner.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="relative overflow-hidden aspect-square bg-zinc-950">
            {heroScannerOpen && (
              <BarcodeScannerView
                onScan={handleHeroScan}
                onError={handleHeroScannerError}
              />
            )}

            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className="w-4/5 max-w-[280px] aspect-[1.3/1] relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]">
                {/* Sci-fi scanner corners */}
                <div className="absolute top-0 left-0 size-4 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 size-4 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 size-4 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 size-4 border-b-2 border-r-2 border-primary rounded-br-lg" />

                {/* Animated Laser Line */}
                <div
                  className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444,0_0_3px_#ef4444]"
                  style={{
                    animation: "scan-laser 2.5s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 p-4">
            <ManualBarcodeEntry
              value={manualBarcode}
              onValueChange={setManualBarcode}
              onSubmit={handleManualBarcodeSubmit}
            />
          </div>
        </DialogContent>
      </Dialog>

      <QuickScanModal
        isOpen={quickScanOpen}
        onClose={() => setQuickScanOpen(false)}
        barcode={scannedBarcode}
        onSelectProduct={handleSelectProduct}
      />

      {isItemModalOpen && prefilledItemValues && (
        <ItemModal
          isOpen={isItemModalOpen}
          onClose={() => {
            setIsItemModalOpen(false);
            setPrefilledItemValues(undefined);
          }}
          onSubmit={handleItemModalSubmit}
          shelfId={prefilledItemValues.shelfId || ""}
          prefilledValues={prefilledItemValues}
        />
      )}

      <ExploreItemModal
        isOpen={exploreModalOpen}
        onClose={() => {
          setExploreModalOpen(false);
          setSelectedExploreItem(null);
        }}
        item={selectedExploreItem}
      />

      {/* Content */}
      <div className=" overflow-y-auto">
        <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 flex flex-col gap-6 max-w-7xl w-full mx-auto animate-fade-in duration-300">
          <LayoutGroup>
            {/* Always visible single Search Bar */}
            <div className="w-full">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSearch)}>
                  <FormField
                    control={form.control}
                    name="search"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative w-full flex items-center">
                            <Search className="absolute left-3.5 size-4 text-muted-foreground pointer-events-none z-10" />
                            <Input
                              type="search"
                              autoFocus
                              className="w-full pr-10 pl-10 bg-zinc-50/5 dark:bg-zinc-950/20 backdrop-blur-md border border-border/80 dark:border-zinc-800/80 rounded-2xl h-11 focus:ring-2 focus:ring-primary/20 transition-all duration-300"
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

            {/* Search Header (only if searching) */}
            {searchQuery && (
              <div className="flex flex-col gap-1 border-b border-border/60 pb-4 mt-2">
                <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                  <Search className="size-6 text-primary" />
                  {t("items.searchResults")}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Showing results for &ldquo;{searchQuery}&rdquo;
                </p>
              </div>
            )}

            {/* SHELVES (COLLECTIONS) GRID - RENDERED ONCE AND ANIMATED */}
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-bold tracking-tight text-foreground dark:text-zinc-200">
                {searchQuery
                  ? t("common.collections")
                  : t("navigation.shelves")}
              </h2>

              {isLoading ? (
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <Skeleton
                      key={idx}
                      className="rounded-2xl aspect-[3/2] md:aspect-[1.618/1] w-full"
                    />
                  ))}
                </div>
              ) : sortedShelves.length > 0 ? (
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                  {sortedShelves.map((shelf) => (
                    <motion.div
                      key={shelf.id}
                      layoutId={`shelf-card-${shelf.id}`}
                      layout
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                      }}
                    >
                      <Link href={shelfPath(shelf)}>
                        <ShelfCard {...shelf} />
                      </Link>
                    </motion.div>
                  ))}

                  {/* Plus Create New Shelf Card inside the grid */}
                  {!searchQuery && isAuthenticated && !isGuest && (
                    <motion.button
                      layout
                      layoutId="add-shelf-btn"
                      onClick={() => handleModalOpen()}
                      className="w-full flex flex-col items-center justify-center border border-dashed border-border/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/5 hover:bg-zinc-100/10 dark:bg-zinc-950/5 dark:hover:bg-zinc-900/10 transition-all duration-300 gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm font-bold shadow-sm select-none aspect-[3/2] md:aspect-[1.618/1]"
                    >
                      <Plus className="size-5 text-primary" />
                      <span>{t("shelves.addShelf")}</span>
                    </motion.button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                  {/* Plus Create New Shelf Card when no shelves exist */}
                  {!searchQuery && isAuthenticated && !isGuest && (
                    <motion.button
                      layout
                      layoutId="add-shelf-btn"
                      onClick={() => handleModalOpen()}
                      className="w-full flex flex-col items-center justify-center border border-dashed border-border/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/5 hover:bg-zinc-100/10 dark:bg-zinc-950/5 dark:hover:bg-zinc-900/10 transition-all duration-300 gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm font-bold shadow-sm select-none aspect-[3/2] md:aspect-[1.618/1]"
                    >
                      <Plus className="size-5 text-primary" />
                      <span>{t("shelves.addShelf")}</span>
                    </motion.button>
                  )}
                  {!searchQuery && (!isAuthenticated || isGuest) && (
                    <div className="col-span-full text-xs text-muted-foreground italic py-6 select-none">
                      {t("shelves.noShelves")}
                    </div>
                  )}
                  {searchQuery && (
                    <p className="text-xs text-muted-foreground italic col-span-full">
                      {t("common.noResults")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {searchQuery ? (
              /* Search Results Additional Sections */
              <>
                {/* Matching Items Grid */}
                <div className="flex flex-col gap-3 mt-2">
                  <h2 className="text-lg font-bold tracking-tight text-foreground dark:text-zinc-200">
                    {t("items.title")}
                  </h2>
                  {isLoadingSearchItems ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                      {Array.from({ length: 8 }).map((_, idx) => (
                        <Skeleton
                          key={idx}
                          className="rounded-2xl aspect-[1/1.4] w-full"
                        />
                      ))}
                    </div>
                  ) : searchItems && searchItems.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                      {searchItems.map((item) => (
                        <Link
                          key={item.id}
                          href={itemPath(
                            item.shelf || { id: item.shelfId },
                            item,
                          )}
                        >
                          <ItemCard
                            {...item}
                            shelfType={item.shelf?.type}
                            cardFormat={item.shelf?.cardFormat}
                          />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      {t("common.noResults")}
                    </p>
                  )}
                </div>

                {/* Community Items Fallback */}
                {exploreItems && exploreItems.length > 0 && (
                  <div className="flex flex-col gap-3 mt-4">
                    <h2 className="text-lg font-bold tracking-tight text-foreground dark:text-zinc-200 flex items-center gap-1.5 select-none animate-fade-in">
                      <Sparkles className="size-4.5 text-amber-500" />
                      Disponible chez d'autres collectionneurs
                    </h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                      {exploreItems.map((item) => (
                        <div
                          key={item.id}
                          className="relative group cursor-pointer animate-fade-in"
                          onClick={() => {
                            setSelectedExploreItem(item);
                            setExploreModalOpen(true);
                          }}
                        >
                          <ItemCard
                            {...item}
                            shelfType={item.shelf?.type}
                            cardFormat={item.shelf?.cardFormat}
                          />
                          {/* Owner badge top right */}
                          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/85 backdrop-blur text-white shadow-sm border border-white/10 max-w-[80px] select-none pointer-events-none">
                            <Avatar className="size-3.5 shrink-0 border border-white/20 select-none pointer-events-none">
                              <AvatarImage
                                src={item.user?.image || undefined}
                                className="object-cover"
                              />
                              <AvatarFallback className="text-[6px] font-black text-amber-700 bg-white leading-none">
                                {item.user?.name
                                  ?.substring(0, 2)
                                  .toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-[7px] font-black uppercase truncate">
                              {item.user?.name || item.user?.email}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Landing State Additional Sections */
              <>
                {/* Horizontal Recent Additions Row */}
                {recentItems && recentItems.length > 0 && (
                  <div className="flex flex-col gap-3 mt-2 w-full animate-fade-in duration-300">
                    <h2 className="text-lg font-black tracking-tight text-foreground dark:text-zinc-200 select-none">
                      {t("home.recentAdditions")}
                    </h2>
                    <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                      {recentItems.slice(0, 15).map((item) => (
                        <div key={item.id} className="w-28 sm:w-32 shrink-0">
                          <Link
                            href={itemPath(
                              item.shelf || { id: item.shelfId },
                              item,
                            )}
                          >
                            <ItemCard
                              {...item}
                              shelfType={item.shelf?.type}
                              cardFormat={item.shelf?.cardFormat}
                            />
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isFetchingRecent && (
                  <div className="flex flex-col gap-3 mt-2 w-full">
                    <Skeleton className="h-5 w-32 rounded-md" />
                    <div className="flex gap-4 overflow-x-auto pb-3">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <Skeleton
                          key={idx}
                          className="w-28 sm:w-32 rounded-2xl shrink-0"
                          style={{ aspectRatio: "1 / 1.4" }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </LayoutGroup>
        </div>
      </div>

      <ScanFAB />
    </div>
  );
}

export default function ShelvesPage() {
  const { t } = useLocale();
  return (
    <Suspense
      fallback={<div className="p-6 text-sm">{t("common.loading")}</div>}
    >
      <ShelvesComponent />
    </Suspense>
  );
}
