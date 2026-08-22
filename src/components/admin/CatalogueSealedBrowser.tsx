"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import type { CatalogueSealedRow } from "@/lib/admin/catalogueProductsTypes";

type CatalogueProductsResponse = {
  pack: CataloguePackId;
  total: number;
  offset: number;
  limit: number;
  products: CatalogueSealedRow[];
};

const PAGE = 48;

const KIND_FR: Record<CatalogueSealedRow["kind"], string> = {
  booster: "Booster",
  display: "Display",
  deck: "Deck",
  coffret: "Coffret",
  ephemera: "Éphémère",
};

async function fetchPage(input: {
  pack: CataloguePackId;
  offset: number;
  q: string;
}): Promise<CatalogueProductsResponse> {
  const params = new URLSearchParams({
    pack: input.pack,
    offset: String(input.offset),
    limit: String(PAGE),
  });
  if (input.q.trim()) params.set("q", input.q.trim());
  const res = await fetch(`/api/admin/catalogue-products?${params}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as CatalogueProductsResponse;
}

/**
 * Grid of sealed SKUs (products-index), for Catalogue → Scellés.
 * Packshots are remote CDN URLs — same as Bandai SAMPLE faces.
 */
export function CatalogueSealedBrowser({
  packId,
  locale,
}: {
  packId: CataloguePackId;
  locale: string;
}) {
  const fr = locale === "fr";
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

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
    queryKey: ["catalogueProducts", packId, debouncedQ],
    queryFn: ({ pageParam }) =>
      fetchPage({ pack: packId, offset: pageParam, q: debouncedQ }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, page) => n + page.products.length, 0);
      return loaded < lastPage.total
        ? lastPage.offset + lastPage.products.length
        : undefined;
    },
  });

  const products = data?.pages.flatMap((page) => page.products) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              fr ? "Rechercher booster / deck…" : "Search booster / deck…"
            }
            className="h-8 pl-8 text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {fr
            ? `${products.length.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")} SKU`
            : `${products.length.toLocaleString("en-GB")} / ${total.toLocaleString("en-GB")} SKUs`}
        </p>
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

      {!isFetching && products.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fr
            ? "Aucun produit scellé dans l’index. Lance une sync — le graphe boutique devient products-index.json."
            : "No sealed SKUs in the index. Run a sync — the shop graph becomes products-index.json."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {products.map((product) => (
            <figure key={product.productKey} className="flex flex-col gap-1">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted/40">
                {product.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={product.image}
                    alt={product.label}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-1 text-center">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {fr ? "sans image" : "no art"}
                    </span>
                  </div>
                )}
                {product.setLogo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={product.setLogo}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="pointer-events-none absolute left-1 top-1 max-h-6 max-w-[45%] object-contain drop-shadow-sm"
                  />
                ) : null}
              </div>
              <figcaption className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {fr ? KIND_FR[product.kind] : product.kind}
                </span>
                {product.setCode ? (
                  <span className="ml-1 tabular-nums">{product.setCode}</span>
                ) : null}
                <span className="block truncate">
                  {product.name ?? product.slug}
                </span>
                {product.contentsKnown ? (
                  <span className="text-foreground/70">
                    {fr
                      ? `${product.printCount} cartes connues`
                      : `${product.printCount} known cards`}
                  </span>
                ) : product.containsPrintsIsPreview &&
                  product.declaredCardCount != null ? (
                  <span className="text-foreground/70">
                    {fr
                      ? `aperçu ${product.printCount}/${product.declaredCardCount}`
                      : `preview ${product.printCount}/${product.declaredCardCount}`}
                  </span>
                ) : product.kind === "display" ? (
                  <span className="text-foreground/70">
                    {fr ? "index — pas de fiche" : "index — no fiche"}
                  </span>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void fetchNextPage()}
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
