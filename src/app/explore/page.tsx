"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { Search, Compass, Sparkles, BookOpen } from "lucide-react";

import Header from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemCard } from "@/components/ItemCard";
import { ShelfCard } from "@/components/ShelfCard";
import { ExploreItemModal } from "@/components/modals/ExploreItemModal";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useDebounce } from "@/lib/client/hooks/useDebounce";

const searchSchema = z.object({
  search: z.string(),
});

type FormValues = z.infer<typeof searchSchema>;

const defaultValues: FormValues = {
  search: "",
};

function ExplorePageComponent() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounce = useDebounce();

  const q = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(q);

  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues,
  });

  const { data: results, isLoading } = useQuery({
    queryKey: ["explore", searchQuery],
    queryFn: async () => {
      const { data } = await axios.get(
        searchQuery
          ? `/api/explore?q=${encodeURIComponent(searchQuery)}`
          : "/api/explore",
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });

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

  useEffect(() => {
    form.setValue("search", q);
    setSearchQuery(q);
  }, [q, form]);

  const items = useMemo(() => {
    if (!searchQuery) return [];
    return (results as any[]) || [];
  }, [searchQuery, results]);

  const publicShelves = useMemo(() => {
    if (searchQuery) return [];
    return (results as any[]) || [];
  }, [searchQuery, results]);

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground z-0">
      {/* Header */}
      <Header />

      {/* Explore Item Modal */}
      <ExploreItemModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedItem(null);
        }}
        item={selectedItem}
      />

      {/* Main layout */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 flex flex-col gap-6 max-w-7xl w-full mx-auto animate-fade-in duration-300">
        {/* Page title and description */}
        <div className="flex flex-col gap-2 mt-4">
          <div className="flex items-center gap-2">
            <Compass className="size-6 text-primary" />
            <h2 className="text-xl md:text-2xl font-black tracking-tight">
              {t("navigation.explore") || "Exploration"}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Explorez les étagères publiques des autres membres de la communauté,
            recherchez des objets partagés et empruntez des livres, jeux ou
            films.
          </p>
        </div>

        {/* Search bar */}
        <div className="w-full max-w-md">
          <form
            onSubmit={form.handleSubmit(handleSearch)}
            className="relative flex items-center"
          >
            <Search className="absolute left-3.5 size-4 text-muted-foreground pointer-events-none z-10" />
            <Input
              type="search"
              autoFocus
              placeholder="Rechercher des objets chez d'autres collectionneurs..."
              className="w-full pr-10 pl-10 bg-zinc-50/5 dark:bg-zinc-950/20 backdrop-blur-md border border-border/80 dark:border-zinc-800/80 rounded-2xl h-11 focus:ring-2 focus:ring-primary/20 transition-all duration-300 [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none"
              {...form.register("search")}
              onChange={handleSearchChange}
            />
          </form>
        </div>

        {/* Results grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col aspect-[1/1.4] w-full rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-border animate-pulse"
              />
            ))}
          </div>
        ) : searchQuery ? (
          items.length > 0 ? (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-none flex items-center gap-1.5 select-none">
                <Sparkles className="size-3.5 text-amber-500" />
                Résultats trouvés ({items.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="relative group cursor-pointer"
                    onClick={() => {
                      setSelectedItem(item);
                      setIsModalOpen(true);
                    }}
                  >
                    <ItemCard
                      {...item}
                      shelfType={item.shelf?.type}
                      cardFormat={item.shelf?.cardFormat}
                    />
                    {/* Owner badge top right */}
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/85 backdrop-blur text-white shadow-sm border border-white/10 max-w-[100px] select-none pointer-events-none">
                      <Avatar className="size-3.5 shrink-0 border border-white/20 select-none pointer-events-none">
                        <AvatarImage
                          src={item.user?.image || undefined}
                          className="object-cover"
                        />
                        <AvatarFallback className="text-[6px] font-black text-amber-700 bg-white leading-none">
                          {item.user?.name?.substring(0, 2).toUpperCase() ||
                            "?"}
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
          ) : (
            <div className="text-sm text-muted-foreground py-12 text-center bg-zinc-50/10 dark:bg-zinc-950/20 border border-dashed border-border rounded-3xl select-none">
              {t("common.noResults") ||
                "Aucun objet trouvé chez d'autres collectionneurs."}
            </div>
          )
        ) : (
          /* Landing state: public shelves */
          <div className="flex flex-col gap-4">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-none flex items-center gap-1.5 select-none">
              <BookOpen className="size-3.5 text-primary" />
              Étagères publiques de la communauté ({publicShelves.length})
            </span>
            {publicShelves.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {publicShelves.map((shelf: any) => (
                  <div
                    key={shelf.id}
                    onClick={() => {
                      form.setValue("search", shelf.name);
                      setSearchQuery(shelf.name);
                      const params = new URLSearchParams(
                        window.location.search,
                      );
                      params.set("q", shelf.name);
                      router.replace(`?${params.toString()}`, {
                        scroll: false,
                      });
                    }}
                    className="relative group select-none hover:-translate-y-1 transition-all duration-300 ease-out"
                  >
                    <ShelfCard {...shelf} />

                    {/* Owner badge top right */}
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/85 backdrop-blur text-white shadow-sm border border-white/10 max-w-[120px] select-none pointer-events-none">
                      <Avatar className="size-3.5 shrink-0 border border-white/20 select-none pointer-events-none">
                        <AvatarImage
                          src={shelf.user?.image || undefined}
                          className="object-cover"
                        />
                        <AvatarFallback className="text-[6px] font-black text-amber-700 bg-white leading-none">
                          {shelf.user?.name?.substring(0, 2).toUpperCase() ||
                            "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[8px] font-black uppercase truncate">
                        {shelf.user?.name || shelf.user?.email}
                      </span>
                    </div>

                    {/* Item count badge top left */}
                    <div className="absolute top-2 left-2 z-10 pointer-events-none">
                      <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-zinc-900/80 dark:bg-zinc-100/80 backdrop-blur text-zinc-100 dark:text-zinc-900 shadow-sm max-w-[80px] truncate inline-block">
                        {shelf._count?.items || 0}{" "}
                        {t("common.items") || "objets"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-12 text-center bg-zinc-50/10 dark:bg-zinc-950/20 border border-dashed border-border rounded-3xl select-none">
                Aucune étagère publique partagée pour le moment.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center text-sm text-muted-foreground">
          Chargement...
        </div>
      }
    >
      <ExplorePageComponent />
    </Suspense>
  );
}
