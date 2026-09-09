"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { OrientedMediaFrame } from "@/components/OrientedMediaFrame";
import { LenticularStripArt } from "@/components/LenticularStripArt";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useArtFaceOrientation } from "@/lib/client/hooks/useArtFaceOrientation";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import type { CatalogueCardRow } from "@/lib/admin/catalogueCardsTypes";

type CatalogueCardsResponse = {
  pack: CataloguePackId;
  total: number;
  offset: number;
  limit: number;
  cards: CatalogueCardRow[];
  availableLocales?: string[];
};

const PAGE = 48;
/** Afficher toutes les locales du pack (audit Ninja Ranks, etc.). */
const ALL_LOCALES = "all";

function catalogueIncompleteTags(
  card: CatalogueCardRow,
  fr: boolean,
): string[] {
  const tags: string[] = [];
  if (
    !card.name?.trim() &&
    card.kind !== "pack-back" &&
    card.kind !== "set-back"
  ) {
    tags.push(fr ? "sans nom" : "no name");
  }
  if (card.missingArt) tags.push(fr ? "sans image" : "no art");
  if (card.versoOnly) tags.push(fr ? "verso seul" : "back only");
  if (card.artFallbackFrom) {
    tags.push(fr ? "art retail emprunté" : "borrowed retail art");
  } else if (card.artLocaleFrom) {
    tags.push(
      fr
        ? `art ${card.artLocaleFrom.toUpperCase()}`
        : `${card.artLocaleFrom.toUpperCase()} art`,
    );
  }
  if (card.nameLocaleFrom) {
    tags.push(
      fr
        ? `nom ← ${card.nameLocaleFrom.toUpperCase()}`
        : `name from ${card.nameLocaleFrom.toUpperCase()}`,
    );
  } else if (card.nameSource?.startsWith("narutocards-net")) {
    tags.push(fr ? "nom ~ slug net" : "slug-derived name");
  } else if (card.nameSource) {
    tags.push(fr ? `nom ~ ${card.nameSource}` : `derived: ${card.nameSource}`);
  }
  if (card.printed === false) tags.push(fr ? "non éditée" : "unprinted");
  return tags;
}

/** Évite « sans image » en double quand la tuile affiche déjà le placeholder. */
function catalogueCaptionTags(
  card: CatalogueCardRow,
  fr: boolean,
): string[] {
  return catalogueIncompleteTags(card, fr).filter(
    (tag) => !(card.missingArt && tag === (fr ? "sans image" : "no art")),
  );
}

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
  const lenticular =
    card.lenticularGrid &&
    card.lenticularGrid.cols * card.lenticularGrid.rows > 1;

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
          {lenticular && card.lenticularGrid ? (
            <LenticularStripArt
              imageUrl={artUrl}
              grid={card.lenticularGrid}
              alt={card.label}
              className="h-full w-full"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={artUrl}
              alt={card.label}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />
          )}
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
  missingArtOnly: boolean;
  missingNameOnly: boolean;
}): Promise<CatalogueCardsResponse> {
  const params = new URLSearchParams({
    pack: input.pack,
    offset: String(input.offset),
    limit: String(PAGE),
    locales: input.allLocales ? "all" : "preferred",
  });
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.preferLang) params.set("lang", input.preferLang);
  if (input.missingArtOnly) params.set("missingArt", "1");
  if (input.missingNameOnly) params.set("missingName", "1");
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
  const defaultLang = fr ? "fr" : "en";
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [langFilter, setLangFilter] = useState<string>(defaultLang);
  const [missingArtOnly, setMissingArtOnly] = useState(false);
  const [missingNameOnly, setMissingNameOnly] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setLangFilter(defaultLang);
    setMissingArtOnly(false);
    setMissingNameOnly(false);
  }, [packId, defaultLang]);

  const auditActive = missingArtOnly || missingNameOnly;

  const allLocales = langFilter === ALL_LOCALES;
  const preferLang = allLocales ? defaultLang : langFilter;

  const {
    data,
    isFetching,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "catalogueCards",
      packId,
      debouncedQ,
      langFilter,
      missingArtOnly,
      missingNameOnly,
    ],
    queryFn: ({ pageParam }) =>
      fetchPage({
        pack: packId,
        offset: pageParam,
        q: debouncedQ,
        preferLang,
        allLocales,
        missingArtOnly,
        missingNameOnly,
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
  const availableLocales = data?.pages[0]?.availableLocales ?? [];
  const localeOptions =
    availableLocales.length > 0 ? availableLocales : [defaultLang];

  useEffect(() => {
    if (availableLocales.length === 0) return;
    if (langFilter === ALL_LOCALES) return;
    if (!availableLocales.includes(langFilter)) {
      const fallback = availableLocales.includes(defaultLang)
        ? defaultLang
        : availableLocales.includes("en")
          ? "en"
          : availableLocales[0]!;
      setLangFilter(fallback);
    }
  }, [availableLocales, langFilter, defaultLang]);

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
          {auditActive
            ? missingArtOnly && missingNameOnly
              ? fr
                ? `${cards.length.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")} incomplets`
                : `${cards.length.toLocaleString("en-GB")} / ${total.toLocaleString("en-GB")} incomplete`
              : missingArtOnly
                ? fr
                  ? `${cards.length.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")} sans image`
                  : `${cards.length.toLocaleString("en-GB")} / ${total.toLocaleString("en-GB")} missing art`
                : fr
                  ? `${cards.length.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")} sans nom`
                  : `${cards.length.toLocaleString("en-GB")} / ${total.toLocaleString("en-GB")} missing name`
            : fr
              ? `${cards.length.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")} cartes`
              : `${cards.length.toLocaleString("en-GB")} / ${total.toLocaleString("en-GB")} cards`}
        </p>
        {localeOptions.length > 0 ? (
          <Select value={langFilter} onValueChange={setLangFilter}>
            <SelectTrigger
              aria-label={fr ? "Langue du catalogue" : "Catalogue language"}
              className="h-8 w-[11rem] text-xs"
            >
              <SelectValue
                placeholder={fr ? "Langue" : "Language"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LOCALES}>
                {fr ? "Toutes locales" : "All locales"}
              </SelectItem>
              {localeOptions.map((code) => {
                const label = printLanguageLabel(code);
                return (
                  <SelectItem key={code} value={code}>
                    {label.flag ? `${label.flag} ` : ""}
                    {label.name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id="catalogue-missing-art"
            checked={missingArtOnly}
            onCheckedChange={(checked) =>
              setMissingArtOnly(checked === true)
            }
          />
          <Label
            htmlFor="catalogue-missing-art"
            className="cursor-pointer text-xs font-normal text-muted-foreground"
          >
            {fr ? "Sans image" : "Missing art"}
          </Label>
        </div>
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id="catalogue-missing-name"
            checked={missingNameOnly}
            onCheckedChange={(checked) =>
              setMissingNameOnly(checked === true)
            }
          />
          <Label
            htmlFor="catalogue-missing-name"
            className="cursor-pointer text-xs font-normal text-muted-foreground"
          >
            {fr ? "Sans nom" : "Missing name"}
          </Label>
        </div>
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
          {auditActive
            ? fr
              ? "Aucune fiche pour ce filtre d’audit."
              : "No entries for this audit filter."
            : fr
              ? "Aucune carte dans le catalogue local. Lance une sync depuis la barre d’outils."
              : "No cards in the local catalogue. Run a sync from the toolbar."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {cards.map((card) => {
            const debugTags = catalogueCaptionTags(card, fr);
            const highlightIncomplete = auditActive;
            return (
              <figure
                key={`${card.printKey}:${card.lang}`}
                className={`flex flex-col gap-1 ${
                  highlightIncomplete
                    ? "rounded-md ring-1 ring-amber-500/40 ring-offset-1 ring-offset-background"
                    : ""
                }`}
              >
                <CatalogueCardArt card={card} fr={fr} />
                <figcaption className="truncate text-[11px] text-muted-foreground">
                  {card.label}
                  {card.lang && card.lang !== "—" ? (
                    <span className="ml-1 font-medium uppercase text-foreground/80">
                      {` ${card.lang}`}
                    </span>
                  ) : null}
                  {card.hasFoil ? (
                    <span className="ml-1 text-foreground/70">· foil</span>
                  ) : null}
                  {card.kind === "pack-back" || card.kind === "set-back" ? (
                    <span className="ml-1 text-foreground/70">· back</span>
                  ) : null}
                  {debugTags.map((tag) => (
                    <span
                      key={tag}
                      className="ml-1 text-amber-700/90 dark:text-amber-400/90"
                    >
                      · {tag}
                    </span>
                  ))}
                </figcaption>
              </figure>
            );
          })}
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
