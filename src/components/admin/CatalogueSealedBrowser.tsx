"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { CatalogueSealedDetailDialog } from "@/components/admin/CatalogueSealedDetailDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cataloguePackInfo,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import type { CatalogueSealedRow } from "@/lib/admin/catalogueProducts";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import { sealedKindLabel } from "@/providers/shared/sealedProducts/kinds";

type CatalogueProductsResponse = {
  pack: CataloguePackId;
  total: number;
  offset: number;
  limit: number;
  products: CatalogueSealedRow[];
};

const PAGE = 48;

async function fetchPage(input: {
  pack: CataloguePackId;
  offset: number;
  q: string;
  contentsUnknown: boolean;
  missingPrice: boolean;
}): Promise<CatalogueProductsResponse> {
  const params = new URLSearchParams({
    pack: input.pack,
    offset: String(input.offset),
    limit: String(PAGE),
  });
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.contentsUnknown) params.set("contentsUnknown", "1");
  if (input.missingPrice) params.set("missingPrice", "1");
  const res = await fetch(`/api/admin/catalogue-products?${params}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as CatalogueProductsResponse;
}

function formatSealedPriceCents(
  cents: number | null | undefined,
  fr: boolean,
): string | null {
  if (cents == null || !(cents > 0)) return null;
  return new Intl.NumberFormat(fr ? "fr-FR" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function contentsCaption(product: CatalogueSealedRow, fr: boolean): string | null {
  if (product.contentsKnown) {
    return fr
      ? `${product.printCount} cartes connues`
      : `${product.printCount} known cards`;
  }
  if (product.structureAttested) {
    if (product.behavior === "no_cards" || product.kind === "ephemera") {
      return fr ? "pas de cartes (éphémère)" : "no cards (ephemera)";
    }
    const bits: string[] = [];
    const fixedBundle =
      product.behavior === "known_bundle" ||
      (product.behavior === "mixed_bundle" &&
        product.packsContained == null &&
        product.declaredCardCount != null);
    if (fixedBundle) {
      const size =
        product.declaredCardCount ?? product.cardsPerPack ?? null;
      if (size != null) {
        bits.push(
          fr ? `deck / fixe ${size} cartes` : `fixed ${size} cards`,
        );
      } else {
        bits.push(fr ? "deck construit (fixe)" : "constructed deck (fixed)");
      }
      if (
        product.printCount > 0 &&
        product.declaredCardCount != null &&
        product.printCount < product.declaredCardCount
      ) {
        bits.push(
          fr
            ? `inventaire ${product.printCount}/${product.declaredCardCount}`
            : `inventory ${product.printCount}/${product.declaredCardCount}`,
        );
      } else if (product.printCount === 0) {
        bits.push(fr ? "liste à compléter" : "list pending");
      }
      return bits.join(" · ") || (fr ? "structure connue" : "structure known");
    }
    if (
      product.behavior === "pack_container" &&
      product.packsContained != null
    ) {
      bits.push(
        fr
          ? `${product.packsContained} sachets`
          : `${product.packsContained} packs`,
      );
    } else if (product.cardsPerPack != null) {
      bits.push(
        fr
          ? `${product.cardsPerPack} cartes`
          : `${product.cardsPerPack} cards`,
      );
      if (product.packsContained != null && product.packsContained > 1) {
        bits.unshift(
          fr
            ? `${product.packsContained} sachets`
            : `${product.packsContained} packs`,
        );
      }
    } else if (product.packsContained != null) {
      bits.push(
        fr
          ? `${product.packsContained} sachets`
          : `${product.packsContained} packs`,
      );
    }
    if (product.randomPoolScope === "set") {
      bits.push(fr ? "pool set (gamble)" : "set pool (gamble)");
    } else if (product.randomPoolScope === "none") {
      bits.push(fr ? "loterie dans les sachets" : "lottery in child packs");
    }
    return bits.join(" · ") || (fr ? "structure connue" : "structure known");
  }
  if (
    product.containsPrintsIsPreview &&
    product.declaredCardCount != null
  ) {
    return fr
      ? `aperçu boutique · set ~${product.declaredCardCount} · contenu à renseigner`
      : `shop preview · set ~${product.declaredCardCount} · needs research`;
  }
  return fr ? "contenu inconnu" : "unknown contents";
}

/**
 * Grid of sealed SKUs (products-index), for Catalogue → Scellés.
 * Click a tile for the contents checklist dialog.
 */
export function CatalogueSealedBrowser({
  packId,
  locale,
}: {
  packId: CataloguePackId;
  locale: string;
}) {
  const fr = locale === "fr";
  const packInfo = cataloguePackInfo(packId);
  const expectsSealed = packInfo?.hasSealedProducts !== false;
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [contentsUnknownOnly, setContentsUnknownOnly] = useState(false);
  const [missingPriceOnly, setMissingPriceOnly] = useState(false);
  const [selected, setSelected] = useState<CatalogueSealedRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const {
    data,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "catalogueProducts",
      "v2",
      packId,
      debouncedQ,
      contentsUnknownOnly,
      missingPriceOnly,
    ],
    queryFn: ({ pageParam }) =>
      fetchPage({
        pack: packId,
        offset: pageParam,
        q: debouncedQ,
        contentsUnknown: contentsUnknownOnly,
        missingPrice: missingPriceOnly,
      }),
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
  const awaitingFirstPage = isPending || (isFetching && !data);
  const auditActive = contentsUnknownOnly || missingPriceOnly;

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
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id="catalogue-contents-unknown"
            checked={contentsUnknownOnly}
            onCheckedChange={(checked) =>
              setContentsUnknownOnly(checked === true)
            }
          />
          <Label
            htmlFor="catalogue-contents-unknown"
            className="cursor-pointer text-xs font-normal text-muted-foreground"
          >
            {fr ? "Sans structure / inventaire" : "Missing structure / inventory"}
          </Label>
        </div>
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id="catalogue-missing-price"
            checked={missingPriceOnly}
            onCheckedChange={(checked) =>
              setMissingPriceOnly(checked === true)
            }
          />
          <Label
            htmlFor="catalogue-missing-price"
            className="cursor-pointer text-xs font-normal text-muted-foreground"
          >
            {fr ? "Sans prix" : "Missing price"}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {fr
            ? `${products.length.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")} SKU${
                auditActive
                  ? missingPriceOnly && !contentsUnknownOnly
                    ? " sans prix"
                    : contentsUnknownOnly && !missingPriceOnly
                      ? " à renseigner"
                      : " filtrés"
                  : ""
              }`
            : `${products.length.toLocaleString("en-GB")} / ${total.toLocaleString("en-GB")} SKUs${
                auditActive
                  ? missingPriceOnly && !contentsUnknownOnly
                    ? " missing price"
                    : contentsUnknownOnly && !missingPriceOnly
                      ? " to research"
                      : " filtered"
                  : ""
              }`}
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

      {awaitingFirstPage ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-md bg-muted/60"
            />
          ))}
        </div>
      ) : !isFetching && products.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {missingPriceOnly
            ? fr
              ? "Aucun SKU sans prix pour ce filtre."
              : "No SKUs missing a price for this filter."
            : contentsUnknownOnly
              ? fr
                ? "Aucun SKU sans structure / inventaire pour ce filtre."
                : "No SKUs lacking structure / inventory for this filter."
              : !expectsSealed
                ? fr
                  ? "Pas de SKU retail scellé attesté pour cette ligne (arcade / stickers / hors TCG)."
                  : "No attested retail sealed SKUs for this line (arcade / stickers / non-TCG)."
                : fr
                  ? "Aucun produit scellé dans l’index. Lance une sync — le graphe boutique devient products-index.json."
                  : "No sealed SKUs in the index. Run a sync — the shop graph becomes products-index.json."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {products.map((product) => {
            const langLabel = product.lang?.trim()
              ? printLanguageLabel(product.lang)
              : null;
            const caption = contentsCaption(product, fr);
            const priceLabel = formatSealedPriceCents(product.priceCents, fr);
            return (
              <button
                key={product.productKey}
                type="button"
                onClick={() => setSelected(product)}
                className="flex flex-col gap-1 rounded-md text-left outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div
                  className={
                    product.contentsKnown || product.structureAttested
                      ? "relative aspect-square overflow-hidden rounded-md bg-muted/40"
                      : "relative aspect-square overflow-hidden rounded-md bg-muted/40 ring-1 ring-amber-500/40"
                  }
                >
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
                  {priceLabel ? (
                    <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/85 px-1 py-0.5 text-[10px] font-medium tabular-nums text-foreground shadow-sm">
                      {priceLabel}
                    </span>
                  ) : null}
                </div>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  <span
                    className="font-medium text-foreground/80"
                    title={langLabel?.name}
                  >
                    {langLabel?.flag ? `${langLabel.flag} ` : ""}
                    {sealedKindLabel(product.kind, fr ? "fr" : "en")}
                  </span>
                  {product.setCode ? (
                    <span className="ml-1 tabular-nums">{product.setCode}</span>
                  ) : null}
                  <span className="block truncate">
                    {product.name ?? product.slug}
                  </span>
                  {caption ? (
                    <span
                      className={
                        product.contentsKnown || product.structureAttested
                          ? "block text-foreground/70"
                          : "block text-amber-700 dark:text-amber-400"
                      }
                    >
                      {caption}
                    </span>
                  ) : null}
                  {!priceLabel ? (
                    <span className="block text-amber-700 dark:text-amber-400">
                      {fr ? "sans prix" : "no price"}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
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

      <CatalogueSealedDetailDialog
        packId={packId}
        product={selected}
        locale={locale}
        open={selected != null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      />
    </div>
  );
}
