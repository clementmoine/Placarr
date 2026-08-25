"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { OrientedMediaFrame } from "@/components/OrientedMediaFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArtFaceOrientation } from "@/lib/client/hooks/useArtFaceOrientation";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import type { CatalogueCardRow } from "@/lib/admin/catalogueCardsTypes";

type CatalogueCardsResponse = {
  pack: CataloguePackId;
  total: number;
  offset: number;
  limit: number;
  cards: CatalogueCardRow[];
};

const PAGE = 48;

function CatalogueCardArt({
  card,
  fr,
}: {
  card: CatalogueCardRow;
  fr: boolean;
}) {
  const artUrl = card.thumbUrl ?? card.artUrl;
  const orient = useArtFaceOrientation(artUrl, {
    landscapeFace: card.landscapeFace,
    faceQuarterTurns: card.faceQuarterTurns,
    landscapePrint: card.landscapePrint,
  });
  const wide = orient.landscapeFace || (orient.faceQuarterTurns ?? 0) % 2 === 1;

  return (
    <div
      className={`relative overflow-hidden rounded-md bg-muted/40 ${
        wide ? "aspect-[88/63]" : "aspect-[63/88]"
      }`}
    >
      {card.missingArt || !artUrl ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center">
          <span className="text-[10px] font-medium text-muted-foreground">
            {fr ? "sans image" : "no art"}
          </span>
        </div>
      ) : (
        <OrientedMediaFrame
          aspectRatio="63 / 88"
          faceQuarterTurns={orient.faceQuarterTurns}
          landscapeFace={orient.landscapeFace}
          className="h-full w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artUrl}
            alt={card.label}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain"
          />
        </OrientedMediaFrame>
      )}
    </div>
  );
}

async function fetchPage(input: {
  pack: CataloguePackId;
  offset: number;
  q: string;
  preferLang: string;
  allLocales: boolean;
}): Promise<CatalogueCardsResponse> {
  const params = new URLSearchParams({
    pack: input.pack,
    offset: String(input.offset),
    limit: String(PAGE),
    locales: input.allLocales ? "all" : "preferred",
  });
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.preferLang) params.set("lang", input.preferLang);
  const res = await fetch(`/api/admin/catalogue-cards?${params}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as CatalogueCardsResponse;
}

/**
 * Flat grid of every local catalogue face (cards-index), for Catalogue → Toutes
 * and for packs without a foil playroom (Naruto).
 */
export function CatalogueBrowser({
  packId,
  locale,
}: {
  packId: CataloguePackId;
  locale: string;
}) {
  const fr = locale === "fr";
  const preferLang = fr ? "fr" : "en";
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [allLocales, setAllLocales] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const {
    data,
    isFetching,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["catalogueCards", packId, debouncedQ, preferLang, allLocales],
    queryFn: ({ pageParam }) =>
      fetchPage({
        pack: packId,
        offset: pageParam,
        q: debouncedQ,
        preferLang,
        allLocales,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, page) => n + page.cards.length, 0);
      return loaded < lastPage.total
        ? lastPage.offset + lastPage.cards.length
        : undefined;
    },
  });

  const cards = data?.pages.flatMap((page) => page.cards) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const hasMore = Boolean(hasNextPage);
  const loadMore = () => {
    void fetchNextPage();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={fr ? "Rechercher set / n°…" : "Search set / #…"}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {fr
            ? `${cards.length.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")} cartes`
            : `${cards.length.toLocaleString("en-GB")} / ${total.toLocaleString("en-GB")} cards`}
        </p>
        <Button
          type="button"
          variant={allLocales ? "secondary" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setAllLocales((on) => !on)}
        >
          {allLocales
            ? fr
              ? "Toutes locales"
              : "All locales"
            : fr
              ? `Locale ${preferLang.toUpperCase()}`
              : `${preferLang.toUpperCase()} only`}
        </Button>
        {isFetching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : String(error)}
          <Button
            type="button"
            variant="link"
            className="ml-2 h-auto p-0"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </p>
      ) : null}

      {!isFetching && cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fr
            ? "Aucune carte dans le catalogue local. Lance une sync depuis la barre d’outils."
            : "No cards in the local catalogue. Run a sync from the toolbar."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {cards.map((card) => (
            <figure
              key={`${card.printKey}:${card.lang}`}
              className="flex flex-col gap-1"
            >
              <CatalogueCardArt card={card} fr={fr} />
              <figcaption className="truncate text-[11px] text-muted-foreground">
                {card.label}
                {/* Six locales share one set+number: without this the grid
                    shows six identical captions for six different cards. */}
                {card.lang && card.lang !== "—" ? (
                  <span className="ml-1 font-medium uppercase text-foreground/80">
                    {card.lang}
                  </span>
                ) : null}
                {card.printed === false ? (
                  <span className="ml-1 text-foreground/70">· non éditée</span>
                ) : null}
                {card.hasFoil ? (
                  <span className="ml-1 text-foreground/70">· foil</span>
                ) : null}
                {card.kind === "pack-back" || card.kind === "set-back" ? (
                  <span className="ml-1 text-foreground/70">· back</span>
                ) : card.missingArt ? (
                  <span className="ml-1 text-foreground/70">· stub</span>
                ) : card.versoOnly ? (
                  <span className="ml-1 text-foreground/70">· verso</span>
                ) : card.artLocaleFrom ? (
                  <span className="ml-1 text-foreground/70">
                    {fr
                      ? `· art ${card.artLocaleFrom.toUpperCase()}`
                      : `· ${card.artLocaleFrom.toUpperCase()} art`}
                  </span>
                ) : card.artFallbackFrom ? (
                  <span className="ml-1 text-foreground/70">
                    {fr ? "· art booster" : "· booster art"}
                  </span>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={loadMore}
          >
            {isFetching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {fr ? "Charger plus" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
