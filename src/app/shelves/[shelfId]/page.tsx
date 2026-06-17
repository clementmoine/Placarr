"use client";

import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense, useCallback, useMemo, useState } from "react";
import { Plus, Wrench, Pizza, Search } from "lucide-react";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Header from "@/components/Header";
import { ItemCard } from "@/components/ItemCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemModal } from "@/components/modals/ItemModal";
import { ScannerButton } from "@/components/ScannerButton";
import { ShelfModal } from "@/components/modals/ShelfModal";
import { ScanFAB } from "@/components/ScanFAB";

import { saveItem } from "@/lib/api/items";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { getShelf, saveShelf } from "@/lib/api/shelves";
import { useAccount } from "@/lib/hooks/useAccount";
import { useLocale } from "@/lib/providers/LocaleProvider";
import colorLib from "color";
import { getAspectRatio } from "@/lib/cardFormat";
import { itemPath } from "@/lib/slugs";
import { syncItemQueries } from "@/lib/itemQueryCache";
import { getEstimatedItemValueCents } from "@/lib/itemValue";

import type { Shelf, Prisma, Item } from "@prisma/client";
import type { ShelfWithItemCount } from "@/types/shelves";
import type { ItemWithMetadata } from "@/types/items";

const itemSearchSchema = z.object({
  search: z.string(),
});

type FormValues = z.infer<typeof itemSearchSchema>;

function ShelfComponent() {
  const params = useParams();
  const { isGuest, isAuthenticated, hasPermission } = useAccount();
  const { t } = useLocale();
  const shelfId = params.shelfId as Shelf["id"];

  const [editingItemId, setEditingItemId] = useState<Item["id"]>();
  const [visibleModal, setVisibleModal] = useState<"shelf" | "item">();
  const [sortBy, setSortBy] = useState<string>("name_asc");

  const searchParams = useSearchParams();

  const router = useRouter();
  const q = searchParams.get("q") || "";

  const form = useForm<FormValues>({
    resolver: zodResolver(itemSearchSchema),
    defaultValues: { search: q },
  });

  const debounce = useDebounce();

  const queryClient = useQueryClient();

  const { data: shelf, isFetching } = useQuery({
    queryKey: ["shelf", shelfId, q],
    queryFn: () => getShelf(shelfId, q),
    initialData: () => {
      const shelf = queryClient
        .getQueryData<ShelfWithItemCount[]>(["shelves"])
        ?.find((s) => s.id === shelfId);

      // Fake items for proper skeleton
      return {
        ...(shelf as Shelf),
        items: Array.from({ length: shelf?._count.items || 1 }).map<Item>(
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
            userId: shelf?.userId || "",
          }),
        ),
      };
    },
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(["shelves"])?.dataUpdatedAt,
  });

  const { mutate: shelfMutate } = useMutation<
    Shelf,
    Error,
    Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput
  >({
    mutationFn: saveShelf,
    onSuccess: (shelf: Shelf) => {
      const shelfId = shelf.id;

      queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
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
    onSuccess: (item: Item) => {
      const shelfId = item.shelfId;

      void syncItemQueries(queryClient, item, [shelfId]);
    },
    onError: () => {
      toast.error(t("items.saveFailed"));
    },
  });

  const sortedItems = useMemo(() => {
    if (!shelf?.items) return [];

    const items = shelf.items as unknown as ItemWithMetadata[];

    return [...items].sort((a, b) => {
      switch (sortBy) {
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "added_desc":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "added_asc":
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        case "release_desc": {
          const timeA = a.metadata?.releaseDate
            ? new Date(a.metadata.releaseDate).getTime()
            : 0;
          const timeB = b.metadata?.releaseDate
            ? new Date(b.metadata.releaseDate).getTime()
            : 0;
          return timeB - timeA;
        }
        case "release_asc": {
          const timeA = a.metadata?.releaseDate
            ? new Date(a.metadata.releaseDate).getTime()
            : 9999999999999;
          const timeB = b.metadata?.releaseDate
            ? new Date(b.metadata.releaseDate).getTime()
            : 9999999999999;
          return timeA - timeB;
        }
        case "name_asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [shelf?.items, sortBy]);

  const totalValue = useMemo(() => {
    if (!shelf?.items) return 0;
    const totalCents = shelf.items.reduce((sum, item: any) => {
      const price =
        getEstimatedItemValueCents({
          ...item,
          shelfType: shelf.type,
        }) ?? 0;
      return sum + price;
    }, 0);
    return totalCents / 100;
  }, [shelf?.items]);

  const handleModalClose = useCallback(() => {
    setVisibleModal(undefined);
    setEditingItemId(undefined);
  }, []);

  const handleShelfModalSubmit = useCallback(
    async (shelf: Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput) => {
      return new Promise<void>((resolve, reject) => {
        shelfMutate(shelf, {
          onSuccess: () => resolve(),
          onError: () => reject(),
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
          onError: () => reject(),
        });
      });
    },
    [itemMutate],
  );

  const handleSearch = async (values: FormValues) => {
    const value = values.search;

    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    router.replace(`?${params.toString()}`);
  };

  const handleModalOpen = useCallback(
    (modal: "shelf" | "item", id?: Item["id"]) => {
      setVisibleModal(modal);

      if (id !== null) {
        setEditingItemId(id);
      }
    },
    [],
  );

  const canEdit = useMemo(() => {
    if (!shelf) return false;

    return hasPermission(shelf.userId);
  }, [shelf, hasPermission]);

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

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground z-0">
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
            shelfId={shelfId}
            shelfType={shelf?.type}
            itemId={editingItemId}
            isOpen={visibleModal === "item"}
            onClose={handleModalClose}
            onSubmit={handleItemModalSubmit}
          />
        </>
      )}

      {/* Content */}
      <div className="overflow-y-auto">
        <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 flex flex-col gap-6 max-w-7xl w-full mx-auto animate-fade-in duration-300">
          {/* Clean Shelf Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2 w-full">
            <div className="flex items-center gap-3">
              {shelf?.imageUrl ? (
                <Image
                  src={shelf.imageUrl}
                  alt=""
                  width={128}
                  height={128}
                  className="size-10 object-contain select-none shrink-0 aspect-square p-1 rounded-md"
                  style={{
                    backgroundColor: shelf?.color || undefined,
                  }}
                />
              ) : shelf?.type ? (
                <span
                  className="shrink-0"
                  style={{ color: shelfTextColor || "var(--primary)" }}
                >
                  <ShelfTypeIcon type={shelf.type} className="size-8" />
                </span>
              ) : null}

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
                <Button
                  variant="secondary"
                  className="bg-card hover:bg-accent hover:text-accent-foreground text-foreground border border-border dark:border-zinc-800 rounded-xl h-10 px-4 text-sm font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
                  onClick={() => handleModalOpen("shelf")}
                >
                  <Wrench className="size-4" />
                  {t("shelves.editShelf")}
                </Button>

                <Button
                  className="rounded-xl h-10 px-4 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer flex items-center gap-1.5"
                  onClick={() => handleModalOpen("item")}
                >
                  <Plus className="size-4" />
                  {t("items.addItem")}
                </Button>
              </div>
            )}
          </div>

          {/* Search and Sort controls */}
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <div className="flex-1">
              <Form {...form}>
                <form
                  onChange={(e) => {
                    const search = (e.target as HTMLInputElement).value;
                    debounce(() => handleSearch({ search }));
                  }}
                  onSubmit={form.handleSubmit(() => {})}
                >
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
                              className="w-full pr-10 pl-10 bg-zinc-50/5 dark:bg-zinc-950/20 backdrop-blur-md border border-border/80 dark:border-zinc-800/80 rounded-2xl h-11 focus:ring-2 focus:ring-primary/20 transition-all duration-300 [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none"
                              placeholder={t("common.search")}
                              {...field}
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
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full bg-zinc-50/5 dark:bg-zinc-950/20 backdrop-blur-md border border-border/80 dark:border-zinc-800/80 rounded-2xl h-11 focus:ring-2 focus:ring-primary/20 transition-all duration-300 cursor-pointer">
                  <SelectValue placeholder={t("sorting.title")} />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border dark:border-zinc-800 rounded-xl shadow-lg">
                  <SelectItem value="name_asc" className="cursor-pointer">
                    {t("sorting.nameAsc")}
                  </SelectItem>
                  <SelectItem value="name_desc" className="cursor-pointer">
                    {t("sorting.nameDesc")}
                  </SelectItem>
                  <SelectItem value="added_desc" className="cursor-pointer">
                    {t("sorting.addedDesc")}
                  </SelectItem>
                  <SelectItem value="added_asc" className="cursor-pointer">
                    {t("sorting.addedAsc")}
                  </SelectItem>
                  <SelectItem value="release_desc" className="cursor-pointer">
                    {t("sorting.releaseDesc")}
                  </SelectItem>
                  <SelectItem value="release_asc" className="cursor-pointer">
                    {t("sorting.releaseAsc")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
            <h2 className="text-xl font-semibold">
              {shelf?.items?.length || 0}{" "}
              {shelf?.items?.length === 1 ? "item" : "items"}
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

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 mt-4">
            {sortedItems.map((item, index) =>
              isFetching ? (
                <Skeleton
                  key={index}
                  className="flex rounded-xl w-full"
                  style={{
                    aspectRatio: skeletonAspectRatio,
                  }}
                />
              ) : (
                <Link
                  key={`${item.id}-${index}`}
                  href={itemPath(
                    shelf || { id: shelfId },
                    item,
                  )}
                >
                  <ItemCard
                    {...item}
                    shelfType={shelf?.type}
                    cardFormat={shelf?.cardFormat}
                  />
                </Link>
              ),
            )}

            {/* Plus Add Item Card in the items grid */}
            {!isFetching && isAuthenticated && !isGuest && canEdit && (
              <button
                onClick={() => handleModalOpen("item")}
                className="w-full flex flex-col items-center justify-center border border-dashed border-border/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/5 hover:bg-zinc-100/10 dark:bg-zinc-950/5 dark:hover:bg-zinc-900/10 transition-all duration-300 gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm font-bold shadow-sm select-none"
                style={{ aspectRatio: skeletonAspectRatio }}
              >
                <Plus className="size-5 text-primary" />
                <span>{t("items.addItem")}</span>
              </button>
            )}
          </div>

          {/* Empty state for non-editable shelves */}
          {sortedItems.length === 0 &&
            !isFetching &&
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

      <ScanFAB />
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
