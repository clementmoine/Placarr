"use client";

import { z } from "zod";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { LayoutGrid, Search } from "lucide-react";

import Header from "@/components/Header";
import { ScanFAB } from "@/components/ScanFAB";
import { ItemCard } from "@/components/ItemCard";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { cn } from "@/lib/utils";
import { getItems } from "@/lib/api/items";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useLocale } from "@/lib/providers/LocaleProvider";
import { itemPath } from "@/lib/slugs";
import { compareTitlesForSort } from "@/lib/titleSort";
import { getEstimatedItemValueCents } from "@/lib/itemValue";

import type { ItemWithMetadata } from "@/types/items";

const searchSchema = z.object({
  search: z.string(),
});

type FormValues = z.infer<typeof searchSchema>;

const COLLECTION_SHELF_TYPES = [
  "games",
  "movies",
  "musics",
  "boardgames",
] as const;

type CollectionShelfType = (typeof COLLECTION_SHELF_TYPES)[number];

function ItemsPageComponent() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounce = useDebounce();

  const q = searchParams.get("q") || "";
  const typeParam = searchParams.get("type") || "all";
  const sortParam = searchParams.get("sort") || "name_asc";

  const [searchQuery, setSearchQuery] = useState(q);
  const [typeFilter, setTypeFilter] = useState(typeParam);
  const [sortBy, setSortBy] = useState(sortParam);

  const form = useForm<FormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: q },
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["collectionItems", searchQuery, typeFilter],
    queryFn: () =>
      getItems(searchQuery || null, null, {
        excludeShelfTypes: typeFilter === "all" ? ["books"] : undefined,
        shelfTypes:
          typeFilter !== "all" &&
          COLLECTION_SHELF_TYPES.includes(typeFilter as CollectionShelfType)
            ? [typeFilter]
            : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const sortedItems = useMemo(() => {
    if (!items?.length) return [] as ItemWithMetadata[];

    return [...items].sort((a, b) => {
      switch (sortBy) {
        case "name_desc":
          return compareTitlesForSort(a.name, b.name, "desc");
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
          return compareTitlesForSort(a.name, b.name);
      }
    });
  }, [items, sortBy]);

  const totalValue = useMemo(() => {
    if (!items?.length) return 0;
    const totalCents = items.reduce((sum, item) => {
      const price =
        getEstimatedItemValueCents({
          ...item,
          shelfType: item.shelf?.type,
        }) ?? 0;
      return sum + price;
    }, 0);
    return totalCents / 100;
  }, [items]);

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

  useEffect(() => {
    form.setValue("search", q);
    setSearchQuery(q);
    setTypeFilter(typeParam);
    setSortBy(sortParam);
  }, [q, typeParam, sortParam, form]);

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground z-0">
      <Header />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
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
                        <div className="relative">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                          <Input
                            type="search"
                            placeholder={t("common.search")}
                            className="pl-10 bg-zinc-50/5 dark:bg-zinc-950/20 backdrop-blur-md border border-border/80 dark:border-zinc-800/80 rounded-2xl h-11"
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

            <Select
              value={sortBy}
              onValueChange={(value) => {
                setSortBy(value);
                replaceParams({ sort: value });
              }}
            >
              <SelectTrigger className="w-full md:w-52 rounded-2xl h-11">
                <SelectValue placeholder={t("items.collection.sortBy")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">
                  {t("items.collection.sort.nameAsc")}
                </SelectItem>
                <SelectItem value="name_desc">
                  {t("items.collection.sort.nameDesc")}
                </SelectItem>
                <SelectItem value="added_desc">
                  {t("items.collection.sort.addedDesc")}
                </SelectItem>
                <SelectItem value="added_asc">
                  {t("items.collection.sort.addedAsc")}
                </SelectItem>
                <SelectItem value="release_desc">
                  {t("items.collection.sort.releaseDesc")}
                </SelectItem>
                <SelectItem value="release_asc">
                  {t("items.collection.sort.releaseAsc")}
                </SelectItem>
              </SelectContent>
            </Select>
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
            {totalValue > 0 && (
              <span className="text-emerald-500">
                {t("items.collection.estimatedValue")}: {totalValue.toFixed(2)}{" "}
                €
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
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
              {sortedItems.map((item) => (
                <Link
                  key={item.id}
                  href={itemPath(item.shelf || { id: item.shelfId }, item)}
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
            <div className="text-sm text-muted-foreground py-16 text-center bg-zinc-50/10 dark:bg-zinc-950/20 border border-dashed border-border rounded-3xl">
              {t("items.collection.noItems")}
            </div>
          )}
        </div>
      </div>

      <ScanFAB />
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
