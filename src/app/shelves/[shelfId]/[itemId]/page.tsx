"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  Wrench,
  Search,
  Link2,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  Maximize2,
  Clock3,
  Trophy,
  BookOpen,
  ListMusic,
  ShieldCheck,
  Users,
  Star,
  Gauge,
  Layers,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
  type TouchEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Header from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ItemModal } from "@/components/modals/ItemModal";
import { ConditionIcon } from "@/components/ConditionIcon";
import { ItemCard } from "@/components/ItemCard";

import { getShelf } from "@/lib/api/shelves";
import {
  getItem,
  saveItem,
  refreshItemMetadata,
  type ItemPrices,
} from "@/lib/api/items";
import {
  cancelBackgroundJob,
  upsertBackgroundJobInCache,
} from "@/lib/api/backgroundJobs";
import { getHeroImage, getGalleryImages } from "@/core/collect/media";
import { findAttachmentForUrl } from "@/core/enrich/media/coverUrl";
import {
  getAttachmentGalleryLabels,
  type AttachmentDisplayLocale,
} from "@/core/enrich/media/attachmentDisplayLabels";
import { AttachmentSourceChip } from "@/components/AttachmentSourceChip";
import {
  hasGameMediaGalleryAttachment,
  hasDetailMetadataAttachments,
  isMissingGameMediaGallery,
  isMissingMusicGallery,
  isMissingBookGallery,
} from "@/core/enrich/galleries";

import type { ShelfWithItems } from "@/types/shelves";
import type { ItemWithMetadata } from "@/types/items";
import type { Shelf, Prisma, Item } from "@/generated/prisma/browser";
import { useAccount } from "@/lib/client/hooks/useAccount";
import { useDocumentTitle } from "@/lib/client/hooks/useDocumentTitle";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import {
  isItemEnriching,
  isItemMetadataBusy,
  isItemMetadataRefreshing,
  preserveActiveMetadataRefreshStamp,
  metadataBusyRefetchInterval,
} from "@/core/collect/enrichment";
import { itemsBarcodeLabelKey } from "@/core/identify/shelfLabels";
import { cn } from "@/lib/shared/utils";
import { RemoteImage } from "@/components/RemoteImage";
import { HoloCardImage } from "@/components/HoloCardImage";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import {
  usePrintVariant,
  variantRendering,
} from "@/lib/client/hooks/usePrintVariant";
import { getDetailCoverClass, getAspectRatio } from "@/lib/text/cardFormat";
import { prepareDescriptionMarkdown } from "@/lib/text/descriptionMarkdown";
import {
  itemPath,
  itemSlugLookupVariants,
  shelfPath,
} from "@/lib/routing/slugs";
import { compareTitlesForSort } from "@/core/enrich/titles/sort";
import { seriesSiblings } from "@/core/enrich/titles/series";
import { FRANCHISE_FACT_KIND } from "@/core/enrich/facts/franchiseFact";
import {
  invalidateItemQueries,
  patchCachedItem,
  syncItemQueries,
  shelfListItemMissingAttachments,
} from "@/core/collect/queryCache";
import { useRefetchItemWhenMetadataIdle } from "@/core/collect/useRefetchItemWhenMetadataIdle";
import { getItemValueEstimate } from "@/core/collect/value";
import { marketOfferConditionsForItem } from "@/core/collect/condition";
import { formatCatalogEstimateObservationRange } from "@/core/commerce/pricing/catalogEstimateDisplay";
import { displayAliasesForItem } from "@/core/enrich/aliases";

import {
  type DetailFact,
  consolidatePlayerFacts,
  consolidateGeneralFacts,
  parsePlayerFactRange,
  parseFactSourceList,
  formatDetailFactSourceToken,
} from "@/core/enrich/facts/playerFacts";
import {
  extractProviderLinkFacts,
  filterRedundantDisplayFacts,
} from "@/core/enrich/facts/displayFacts";
import { ProviderLinksBar } from "@/components/ProviderLinksBar";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const ENRICHMENT_FEATURE_RELEASE = new Date("2026-06-16T17:30:00.000Z");
const GAME_AGE_RATING_FEATURE_RELEASE = new Date("2026-06-18T08:00:00.000Z");
const HLTB_COMPLETION_FEATURE_RELEASE = new Date("2026-06-19T09:29:04.000Z");
const METADATA_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ITEM_RATING_SCALE = 10;

function formatRuntimeMinutes(minutes?: number | null) {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

function formatDurationSeconds(seconds?: number | null) {
  if (!seconds || seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (!hours) return `${minutes} min`;
  return minutes
    ? `${hours} h ${String(minutes).padStart(2, "0")}`
    : `${hours} h`;
}

function shouldIgnoreItemNavigation(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'a, button, input, textarea, select, [role="button"], [role="textbox"], [contenteditable="true"]',
    ),
  );
}

function normalizeFacts(rawFacts: unknown): DetailFact[] {
  if (!rawFacts) return [];
  if (Array.isArray(rawFacts)) return rawFacts as DetailFact[];
  if (typeof rawFacts === "string") {
    try {
      const parsed = JSON.parse(rawFacts);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Horizontal carousel of related items (series volumes / franchise siblings). */
function RelatedItemsRow({
  title,
  items,
  shelf,
  shelfId,
}: {
  title: string;
  items: ItemWithMetadata[];
  shelf: ShelfWithItems | undefined;
  shelfId: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-8 flex flex-col gap-3">
      <h3 className="text-foreground dark:text-zinc-200 font-bold text-lg tracking-tight select-none">
        {title}
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        {items.slice(0, 12).map((related) => (
          <div key={related.id} className="w-28 sm:w-32 shrink-0">
            <Link href={itemPath(shelf || { id: shelfId }, related)}>
              <ItemCard
                {...related}
                shelfType={shelf?.type}
                cardFormat={shelf?.cardFormat}
              />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemDiscoverySection({
  isPending,
  seriesVolumes,
  franchiseName,
  franchiseItems,
  otherItems,
  shelf,
  shelfId,
  t,
}: {
  isPending: boolean;
  seriesVolumes: ItemWithMetadata[];
  franchiseName: string | null;
  franchiseItems: ItemWithMetadata[];
  otherItems: ItemWithMetadata[];
  shelf: ShelfWithItems | undefined;
  shelfId: string;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  if (isPending) return null;
  const hasSeries = seriesVolumes.length > 0;
  const hasFranchise = Boolean(franchiseName) && franchiseItems.length > 0;
  const hasOther = otherItems.length > 0;
  if (!hasSeries && !hasFranchise && !hasOther) return null;

  return (
    <div className="mt-8 flex flex-col gap-1 w-full">
      {hasSeries && (
        <RelatedItemsRow
          title={t("items.otherVolumes")}
          items={seriesVolumes}
          shelf={shelf}
          shelfId={shelfId}
        />
      )}
      {franchiseName && (
        <RelatedItemsRow
          title={t("items.moreFromFranchise", { name: franchiseName })}
          items={franchiseItems}
          shelf={shelf}
          shelfId={shelfId}
        />
      )}
      {hasOther && (
        <div className="mt-8 flex flex-col gap-3">
          <h3 className="text-foreground dark:text-zinc-200 font-bold text-lg tracking-tight select-none">
            {t("items.otherItems")}
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {otherItems.slice(0, 10).map((otherItem) => (
              <div key={otherItem.id} className="w-28 sm:w-32 shrink-0">
                <Link href={itemPath(shelf || { id: shelfId }, otherItem)}>
                  <ItemCard
                    {...otherItem}
                    shelfType={shelf?.type}
                    cardFormat={shelf?.cardFormat}
                  />
                </Link>
              </div>
            ))}
            <div className="w-28 sm:w-32 shrink-0">
              <Link href={shelfPath(shelf || { id: shelfId })}>
                <div
                  className="group relative flex flex-col w-full h-full select-none overflow-hidden rounded-2xl border bg-card/45 border-dashed border-border/80 hover:border-zinc-350 dark:hover:border-zinc-700/50 shadow-sm hover:shadow-md hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 ease-out cursor-pointer items-center justify-center min-h-[150px] gap-2 p-4 text-center"
                  style={{
                    aspectRatio: getAspectRatio(shelf?.cardFormat, shelf?.type),
                  }}
                >
                  <ChevronLeft className="size-6 text-muted-foreground group-hover:text-primary group-hover:scale-110 transition-all duration-300 rotate-180" />
                  <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground group-hover:text-primary transition-colors">
                    {t("items.viewAll")}
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Map statique kind → icône : lecture de référence pendant le render, pas de
// création de composant (règle react-hooks/static-components).
const FACT_ICONS: Record<string, LucideIcon> = {
  "estimated-value": Coins,
  "age-rating": ShieldCheck,
  players: Users,
  "completion-time": Trophy,
  "external-link": Link2,
  playtime: Clock3,
  "time-to-beat": Clock3,
  duration: Clock3,
  pages: BookOpen,
  tracks: ListMusic,
  complexity: Gauge,
  rating: Star,
  popularity: Star,
  franchise: Layers,
};

function factTone(kind: string) {
  if (kind === "estimated-value") {
    return {
      icon: "text-amber-600 dark:text-amber-400",
      value: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-500/10 border-amber-500/25",
    };
  }
  if (kind === "age-rating") {
    return {
      icon: "text-emerald-600 dark:text-emerald-400",
      value: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-500/10 border-emerald-500/25",
    };
  }
  if (kind === "duration" || kind === "playtime" || kind === "time-to-beat") {
    return {
      icon: "text-sky-600 dark:text-sky-400",
      value: "text-sky-700 dark:text-sky-300",
      bg: "bg-sky-500/10 border-sky-500/25",
    };
  }
  if (kind === "completion-time") {
    return {
      icon: "text-fuchsia-600 dark:text-fuchsia-400",
      value: "text-fuchsia-700 dark:text-fuchsia-300",
      bg: "bg-fuchsia-500/10 border-fuchsia-500/25",
    };
  }
  if (kind === "pages" || kind === "tracks") {
    return {
      icon: "text-violet-600 dark:text-violet-400",
      value: "text-violet-700 dark:text-violet-300",
      bg: "bg-violet-500/10 border-violet-500/25",
    };
  }
  if (kind === "players") {
    return {
      icon: "text-cyan-600 dark:text-cyan-400",
      value: "text-cyan-700 dark:text-cyan-300",
      bg: "bg-cyan-500/10 border-cyan-500/25",
    };
  }
  if (kind === "rating" || kind === "popularity") {
    return {
      icon: "text-rose-600 dark:text-rose-400",
      value: "text-rose-700 dark:text-rose-300",
      bg: "bg-rose-500/10 border-rose-500/25",
    };
  }
  if (kind === "complexity") {
    return {
      icon: "text-indigo-600 dark:text-indigo-400",
      value: "text-indigo-700 dark:text-indigo-300",
      bg: "bg-indigo-500/10 border-indigo-500/25",
    };
  }
  if (kind === "franchise") {
    return {
      icon: "text-teal-600 dark:text-teal-400",
      value: "text-teal-700 dark:text-teal-300",
      bg: "bg-teal-500/10 border-teal-500/25",
    };
  }
  return {
    icon: "text-zinc-600 dark:text-zinc-400",
    value: "text-foreground dark:text-zinc-100",
    bg: "bg-zinc-50/60 dark:bg-zinc-950/20 border-border/60 dark:border-zinc-800/60",
  };
}

function formatFactValue(fact: DetailFact) {
  if (fact.kind === "players") {
    return fact.value.replace(/^(\d+)\s*[-–—]\s*(\d+)$/, "$1 à $2");
  }

  if (
    fact.kind === "duration" ||
    fact.kind === "completion-time" ||
    fact.kind === "playtime" ||
    fact.kind === "time-to-beat"
  ) {
    return fact.value.replace(
      /\b(\d+)\s*h\s+(\d)(?!\d)(?:\s*min)?\b/g,
      "$1 h 0$2",
    );
  }

  return fact.value;
}

function resolveFactSourceDisplay(fact: DetailFact) {
  const names = (fact.sourceNames || [])
    .map((name) => name.trim())
    .filter(Boolean);

  if (names.length > 0) {
    return {
      count: names.length,
      names,
      meta: fact.sourceMeta,
    };
  }

  if (fact.sourceCount != null && fact.sourceCount > 0) {
    return {
      count: fact.sourceCount,
      names: [],
      meta: fact.sourceMeta,
    };
  }

  if (!fact.source) return null;

  const normalizedCount = fact.source.trim().toLowerCase();
  const sourcesCountMatch = normalizedCount.match(/^(\d+)\s+sources?$/);
  if (sourcesCountMatch) {
    return {
      count: Number(sourcesCountMatch[1]),
      names: [],
      meta: fact.sourceMeta,
    };
  }

  const parsedSources = parseFactSourceList(fact.source);
  if (parsedSources.length > 0) {
    return {
      count: parsedSources.length,
      names: parsedSources,
      meta: fact.sourceMeta,
    };
  }

  return null;
}

function formatSourceCountLabel(count: number, t: TranslateFn) {
  return count === 1
    ? t("items.info.oneSource")
    : t("items.info.sourcesCount", { count });
}

function FactSourceFooter({ fact }: { fact: DetailFact }) {
  const { t } = useLocale();
  const display = resolveFactSourceDisplay(fact);
  if (!display) return null;

  const formattedNames = display.names.map((name) =>
    formatDetailFactSourceToken(fact, name),
  );
  const countLabel = formatSourceCountLabel(display.count, t);
  const countNode = (
    <span
      className={cn(
        formattedNames.length > 0 &&
          "cursor-help underline decoration-dotted underline-offset-2",
      )}
    >
      {countLabel}
    </span>
  );

  return (
    <span className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-600 truncate">
      {formattedNames.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>{countNode}</TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {formattedNames.join(" · ")}
          </TooltipContent>
        </Tooltip>
      ) : (
        countNode
      )}
      {display.meta ? <span> · {display.meta}</span> : null}
    </span>
  );
}

function priceObservationConditions(
  condition?: string | null,
  shelfType?: string | null,
  prices?: {
    priceUsedCIB?: number | null;
  } | null,
) {
  return marketOfferConditionsForItem(condition, shelfType, prices);
}

function isPrimaryInfoFact(fact: DetailFact) {
  return [
    "age-rating",
    "completion-time",
    "complexity",
    "duration",
    "estimated-value",
    "pages",
    "players",
    "playtime",
    "rating",
    "time-to-beat",
    "tracks",
  ].includes(fact.kind);
}

function isDetailTableFact(fact: DetailFact) {
  return [
    "artist",
    "category",
    "cooperative",
    "family",
    "format",
    "franchise",
    "genre",
    "mechanic",
    "modes",
    "platform",
    "series",
    "store",
    "tag",
    "weight",
  ].includes(fact.kind);
}

function isTagLikeDetailFact(fact: DetailFact) {
  return ["tag", "category", "genre", "mechanic", "family", "modes"].includes(
    fact.kind,
  );
}

function splitTagFactValue(value: string) {
  return value
    .split(/\s*•\s*/g)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

const FACT_DISPLAY_ORDER: Record<string, number> = {
  "estimated-value": 10,
  "age-rating": 20,
  duration: 30,
  playtime: 30,
  "time-to-beat": 30,
  "completion-time": 40,
  rating: 50,
  popularity: 55,
  complexity: 62,
  players: 60,
  pages: 70,
  tracks: 80,
};

function getFactDisplayOrder(fact: DetailFact) {
  return FACT_DISPLAY_ORDER[fact.kind] ?? 500;
}

function sortDetailFacts(a: DetailFact, b: DetailFact) {
  const orderDiff = getFactDisplayOrder(a) - getFactDisplayOrder(b);
  if (orderDiff !== 0) return orderDiff;

  const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
  if (priorityDiff !== 0) return priorityDiff;

  return `${a.label}:${a.value}`.localeCompare(`${b.label}:${b.value}`);
}

function isPcLikeGameShelf(shelfName?: string | null) {
  if (!shelfName) return false;
  const normalized = shelfName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(pc|windows|steam)\b/.test(normalized);
}

function isNtscLikeGameShelf(shelfName?: string | null) {
  if (!shelfName) return false;
  const normalized = shelfName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(ntsc|usa?|canada|japan|jp|jpn)\b/.test(normalized);
}

function isPcSpecificFact(fact: DetailFact) {
  return fact.isPcSpecificFact === true;
}

function isHowLongToBeatSource(fact: DetailFact) {
  return fact.isHowLongToBeatSource === true;
}

function isDurationLikeFact(fact: DetailFact) {
  return ["completion-time", "duration", "playtime", "time-to-beat"].includes(
    fact.kind,
  );
}

function normalizeDisplayFact(fact: DetailFact): DetailFact | null {
  if (fact.kind === "external-link") {
    return fact.url ? fact : null;
  }

  if (fact.kind === "time-to-beat") {
    const label = fact.label.toLowerCase();
    if (label.includes("extra")) return null;

    if (label.includes("compl")) {
      return {
        ...fact,
        kind: "completion-time",
        label: "Complétion",
        url: isHowLongToBeatSource(fact) ? fact.url : undefined,
      };
    }

    return {
      ...fact,
      kind: "duration",
      label: "Durée",
      url: isHowLongToBeatSource(fact) ? fact.url : undefined,
    };
  }

  return {
    ...fact,
    url:
      fact.kind === "estimated-value" || isHowLongToBeatSource(fact)
        ? fact.url
        : undefined,
  };
}

function parseRatingOnScale(fact: DetailFact): number | null {
  const value = fact.value.replace(",", ".").trim();
  const fractional = value.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (fractional) {
    const score = Number(fractional[1]);
    const max = Number(fractional[2]);
    if (Number.isFinite(score) && Number.isFinite(max) && max > 0) {
      return Math.max(
        0,
        Math.min(ITEM_RATING_SCALE, (score / max) * ITEM_RATING_SCALE),
      );
    }
  }

  const percent = value.match(/([\d.]+)\s*%/);
  if (percent) {
    const score = Number(percent[1]);
    if (Number.isFinite(score)) {
      return Math.max(
        0,
        Math.min(ITEM_RATING_SCALE, (score / 100) * ITEM_RATING_SCALE),
      );
    }
  }

  return null;
}

function formatRatingOnScale(value: number, locale: string) {
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}/${ITEM_RATING_SCALE}`;
}

function isStoredConsensusRating(fact: DetailFact) {
  return (
    fact.kind === "rating" &&
    (fact.source === "consensus" || fact.label === "Note")
  );
}

function parseAgeRatingYears(fact: DetailFact): number | null {
  const age = normalizeRatingAge(fact.value);
  return age !== null && age > 0 ? age : null;
}

function consolidateAgeRatingFacts(facts: DetailFact[]): DetailFact[] {
  const ageFacts = facts.filter((fact) => fact.kind === "age-rating");
  if (ageFacts.length <= 1) {
    return facts.filter(
      (fact) =>
        fact.kind !== "age-rating" || parseAgeRatingYears(fact) !== null,
    );
  }

  const validAgeFacts = ageFacts.filter(
    (fact) => parseAgeRatingYears(fact) !== null,
  );
  if (validAgeFacts.length === 0) {
    return facts.filter((fact) => fact.kind !== "age-rating");
  }

  const best = validAgeFacts.reduce((currentBest, fact) => {
    const bestAge = parseAgeRatingYears(currentBest) ?? 0;
    const factAge = parseAgeRatingYears(fact) ?? 0;
    return factAge >= bestAge ? fact : currentBest;
  });

  const sourceNames = Array.from(
    new Set(
      validAgeFacts.flatMap((fact) => {
        if (fact.sourceNames?.length) return fact.sourceNames;
        if (!fact.source) return [];
        return parseFactSourceList(fact.source).map((entry) =>
          formatDetailFactSourceToken(fact, entry),
        );
      }),
    ),
  );

  return [
    ...facts.filter((fact) => fact.kind !== "age-rating"),
    {
      ...best,
      source: undefined,
      sourceCount: sourceNames.length > 0 ? sourceNames.length : undefined,
      sourceNames: sourceNames.length > 0 ? sourceNames : undefined,
    },
  ];
}

function canonicalRatingSourceName(fact: DetailFact): string | null {
  if (fact.isBoardGameRatingSource) {
    return (
      fact.providerLabel ??
      formatDetailFactSourceToken(fact, fact.source ?? fact.label ?? "")
    );
  }
  const label = fact.label?.trim() || "";
  if (label) return label;
  if (fact.providerLabel && fact.source) return fact.providerLabel;
  if (fact.source) return formatDetailFactSourceToken(fact, fact.source);
  return null;
}

function collectRatingSourceNames(facts: DetailFact[]) {
  return Array.from(
    new Set(
      facts
        .map(canonicalRatingSourceName)
        .filter((name): name is string => Boolean(name)),
    ),
  );
}

function buildAverageRatingFact(
  facts: DetailFact[],
  t: TranslateFn,
  locale: string,
): DetailFact | null {
  const ratingFacts = facts.filter(
    (fact) => fact.kind === "rating" && !isStoredConsensusRating(fact),
  );
  const values = ratingFacts
    .map(parseRatingOnScale)
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sourceNames = collectRatingSourceNames(ratingFacts);

  return {
    kind: "rating",
    label: t("items.info.averageRating"),
    value: formatRatingOnScale(average, locale),
    sourceCount: sourceNames.length,
    sourceNames,
    priority: 84,
  };
}

function normalizeRatingAge(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) return null;
  const age = Number(match[0]);
  return Number.isFinite(age) ? age : null;
}

function isDisplayableAgeRatingFact(
  fact: DetailFact,
  shelfName?: string | null,
) {
  if (fact.kind !== "age-rating") return false;
  const label = fact.label.toUpperCase();
  const value = fact.value.trim().toUpperCase();

  if (label === "ESRB" && !isNtscLikeGameShelf(shelfName)) {
    return false;
  }

  return (
    normalizeRatingAge(value) !== null ||
    [
      "ALL",
      "ALL AGES",
      "EVERYONE",
      "G",
      "TP",
      "TOUT PUBLIC",
      "TOUS PUBLICS",
    ].includes(value)
  );
}

function formatPublicValue(fact: DetailFact, t: TranslateFn): string | null {
  const label = fact.label.toUpperCase();
  const value = fact.value.trim().toUpperCase();
  const age = normalizeRatingAge(value);

  if (label === "PEGI") {
    if (age === null) return null;
    return age <= 3
      ? t("items.info.allAges")
      : t("items.info.ageAndUp", { age });
  }

  if (label === "ESRB") {
    if (["EC", "E", "EVERYONE"].includes(value)) {
      return t("items.info.allAges");
    }
    if (value.includes("10")) return t("items.info.ageAndUp", { age: 10 });
    if (value === "T" || value === "TEEN") {
      return t("items.info.ageAndUp", { age: 13 });
    }
    if (value === "M" || value === "MATURE") {
      return t("items.info.ageAndUp", { age: 17 });
    }
    if (value === "AO") return t("items.info.ageAndUp", { age: 18 });
    return null;
  }

  if (age !== null) {
    return age <= 3
      ? t("items.info.allAges")
      : t("items.info.ageAndUp", { age });
  }

  if (
    [
      "ALL",
      "ALL AGES",
      "EVERYONE",
      "G",
      "TP",
      "TOUT PUBLIC",
      "TOUS PUBLICS",
    ].includes(value)
  ) {
    return t("items.info.allAges");
  }

  return fact.value;
}

function localizeDisplayFact(
  fact: DetailFact,
  t: TranslateFn,
  options: { compactVideoGamePlayers?: boolean } = {},
): DetailFact | null {
  if (fact.kind === "age-rating") {
    const value = formatPublicValue(fact, t);
    if (!value) return null;
    return {
      ...fact,
      label: t("items.info.public"),
      value,
      source: undefined,
    };
  }

  if (fact.kind === "players") {
    let value = fact.value;
    if (value.includes("|")) {
      const parts = value.split("|");
      const orSeparator = ` ${t("items.info.or") || "ou"} `;

      // Collapse "upper-bound" parts into a single "up to X or Y". A part is an
      // upper bound when it's "N max", or — in compact video-game mode — a
      // "1-N" range that we already render as "up to N".
      const caps = parts.map((p) => {
        if (p.endsWith(" max")) return Number(p.slice(0, -4));
        const rangeMatch = p.match(/^(\d+)-(\d+)$/);
        if (
          rangeMatch &&
          options.compactVideoGamePlayers &&
          Number(rangeMatch[1]) === 1
        ) {
          return Number(rangeMatch[2]);
        }
        return null;
      });
      if (caps.every((c) => c !== null)) {
        const numbers = Array.from(new Set(caps as number[])).sort(
          (a, b) => a - b,
        );
        return {
          ...fact,
          label: t("items.info.players"),
          value: t("items.info.upToPlayers", {
            count: numbers.join(orSeparator),
          }),
        };
      }

      const allRanges = parts.every((p) => p.includes("-"));
      if (allRanges) {
        const ranges = parts.map((p) => p.split("-").map(Number));
        const firstMin = ranges[0][0];
        const sameMin = ranges.every((r) => r[0] === firstMin);
        if (sameMin) {
          const maxes = ranges.map((r) => r[1]).sort((a, b) => a - b);
          const maxString = maxes.join(orSeparator);
          return {
            ...fact,
            label: t("items.info.players"),
            value: t("items.info.playersRange", {
              min: firstMin,
              max: maxString,
            }),
          };
        }
      }

      const localizedParts = parts.map((part) => {
        let partValue = part;
        let partLabel = "Players";
        if (part.endsWith(" max")) {
          partValue = part.slice(0, -4);
          partLabel = "Max players";
        }
        const tempFact = { ...fact, value: partValue, label: partLabel };
        return localizeDisplayFact(tempFact, t, options)?.value || partValue;
      });

      return {
        ...fact,
        label: t("items.info.players"),
        value: localizedParts.join(orSeparator),
      };
    }

    const range = parsePlayerFactRange(fact);
    if (range) {
      if (
        range.maxOnly ||
        (options.compactVideoGamePlayers && range.min === 1 && range.max > 1)
      ) {
        value = t("items.info.upToPlayers", { count: range.max });
      } else if (range.min === 1 && range.max === 1) {
        value = t("items.info.solo");
      } else if (range.min === range.max) {
        value = t("items.info.multiplePlayers", { count: range.min });
      } else if (range.min !== null) {
        value = t("items.info.playersRange", {
          min: range.min,
          max: range.max,
        });
      }
    }
    return {
      ...fact,
      label: t("items.info.players"),
      value,
    };
  }

  const labelByKind: Record<string, string> = {
    "completion-time": t("items.info.completion"),
    cooperative: t("items.info.coop"),
    duration: t("items.info.duration"),
    modes: t("items.info.gameModes"),
    pages: t("items.info.pages"),
    playtime: t("items.info.playtime"),
    tracks: t("items.info.tracks"),
    tag: t("items.info.themes"),
    genre: t("items.info.themes"),
  };

  if (fact.value.includes("|")) {
    const parts = fact.value.split("|");
    const orSeparator = ` ${t("items.info.or") || "ou"} `;
    const localizedParts = parts.map((part) => {
      const tempFact = { ...fact, value: part };
      const localized = localizeDisplayFact(tempFact, t, options);
      return localized ? localized.value : part;
    });
    return {
      ...fact,
      label: labelByKind[fact.kind] || fact.label,
      value: localizedParts.join(orSeparator),
    };
  }

  return {
    ...fact,
    label: labelByKind[fact.kind] || fact.label,
  };
}

function normalizeDisplayFacts(
  facts: DetailFact[],
  options: {
    includeEsrbAgeRatings?: boolean;
    includePcFacts?: boolean;
  } = {},
) {
  const hasDirectHltb = facts.some(
    (fact) => isHowLongToBeatSource(fact) && isDurationLikeFact(fact),
  );

  return facts
    .filter(
      (fact) =>
        !hasDirectHltb ||
        !isDurationLikeFact(fact) ||
        isHowLongToBeatSource(fact),
    )
    .filter((fact) => options.includePcFacts || !isPcSpecificFact(fact))
    .filter(
      (fact) =>
        options.includeEsrbAgeRatings ||
        fact.kind !== "age-rating" ||
        fact.label.toUpperCase() !== "ESRB",
    )
    .map(normalizeDisplayFact)
    .filter((fact): fact is DetailFact => Boolean(fact));
}

function DetailInfoItem({ fact }: { fact: DetailFact }) {
  // Lecture inline de la map — référence stable pour le compilateur React.
  const Icon = FACT_ICONS[fact.kind] ?? Search;
  const tone = factTone(fact.kind);
  const content = (
    <div
      className={cn(
        "group/info w-full sm:w-[176px] h-[62px] inline-flex items-center gap-2 rounded-lg border px-2.5 py-2 shadow-sm transition-colors",
        tone.bg,
        fact.url ? "hover:bg-zinc-100/70 dark:hover:bg-zinc-900/40" : "",
      )}
    >
      <div className="size-8 rounded-md bg-background/70 dark:bg-zinc-950/40 border border-white/40 dark:border-zinc-800/70 flex items-center justify-center shrink-0">
        <Icon className={cn("size-4", tone.icon)} />
      </div>
      <div className="min-w-0 flex flex-col leading-tight">
        <span className="text-[10px] font-bold tracking-wide text-zinc-500 dark:text-zinc-400 truncate">
          {fact.label}
        </span>
        <span className={cn("text-sm font-black truncate", tone.value)}>
          {formatFactValue(fact)}
        </span>
        <FactSourceFooter fact={fact} />
      </div>
      {fact.url && <Link2 className="ml-auto size-3 text-zinc-400 shrink-0" />}
    </div>
  );

  if (!fact.url) return content;

  return (
    <a
      href={fact.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full sm:w-auto"
    >
      {content}
    </a>
  );
}

export default function ItemDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { isGuest, hasPermission, isAuthenticated } = useAccount();
  const { t, locale } = useLocale();
  const shelfId = params.shelfId as Shelf["id"];
  const itemId = params.itemId as Item["id"];

  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [modalActiveTab, setModalActiveTab] = useState<
    "general" | "poster" | "background" | "info"
  >("general");
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [coverImageFit, setCoverImageFit] = useState<"cover" | "contain">(
    "contain",
  );
  // Garde « une seule tentative » : jamais rendu → ref, pas un state (évite
  // un setState synchrone dans l'effect de refresh).
  const autoMetadataRefreshAttemptedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const queryClient = useQueryClient();

  const { data: shelf } = useQuery({
    queryKey: ["shelf", shelfId],
    queryFn: () => getShelf(shelfId),
  });

  const {
    data: item,
    isPending,
    isError,
    isFetched,
    isPlaceholderData,
  } = useQuery({
    queryKey: ["shelf", shelfId, "items", itemId],
    queryFn: async () => {
      const fetched = await getItem(itemId, shelfId);
      const previous = queryClient.getQueryData<ItemWithMetadata>([
        "shelf",
        shelfId,
        "items",
        itemId,
      ]);
      return preserveActiveMetadataRefreshStamp(fetched, previous);
    },
    initialData: () => {
      const slugVariants = new Set(itemSlugLookupVariants(itemId));
      const cached = queryClient
        .getQueryData<ShelfWithItems>(["shelf", shelfId])
        ?.items?.find(
          (i) => i.id === itemId || (i.slug ? slugVariants.has(i.slug) : false),
        ) as ItemWithMetadata | undefined;
      if (!cached) return undefined;
      // Instant cover/title from the grid, but never treat shelf cache as a
      // complete metadata payload (attachments are omitted on list routes).
      if (shelfListItemMissingAttachments(cached)) return undefined;
      return cached;
    },
    // Shelf snapshots omit attachment galleries — refetch the full item
    // immediately on detail mount instead of inheriting the 60s staleTime.
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: "always",
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[3] === itemId ? previousData : undefined,
    // Metadata is enriched in the background after an item is added, so poll
    // while this item is still being enriched (no metadataId yet) — survives a
    // page refresh since the state is derived from the persisted item.
    refetchInterval: (query) =>
      metadataBusyRefetchInterval(query.state.data ? [query.state.data] : null),
    refetchIntervalInBackground: true,
  });

  const isMetadataBusy = isItemMetadataBusy(item);
  const hasNoMetadata =
    Boolean(item?.barcode) &&
    !item?.metadataId &&
    !item?.metadata &&
    !isMetadataBusy;
  const wasMetadataRefreshingRef = useRef(false);
  const cancelledMetadataRefreshRef = useRef(false);
  const metadataRefreshToastArmedRef = useRef(false);

  useRefetchItemWhenMetadataIdle(queryClient, item, shelfId);

  useEffect(() => {
    if (!item?.id) return;
    if (
      item.priceNew == null &&
      item.priceUsed == null &&
      item.priceUsedCIB == null
    ) {
      return;
    }
    patchCachedItem(queryClient, {
      id: item.id,
      shelfId: item.shelfId ?? shelfId,
      priceNew: item.priceNew ?? null,
      priceUsed: item.priceUsed ?? null,
      priceUsedCIB: item.priceUsedCIB ?? null,
      priceLastUpdated: item.priceLastUpdated ?? null,
    });
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "shelf" &&
        (query.queryKey[1] === shelfId || query.queryKey[1] === item.shelfId),
    });
  }, [
    item?.id,
    item?.shelfId,
    item?.priceNew,
    item?.priceUsed,
    item?.priceUsedCIB,
    item?.priceLastUpdated,
    queryClient,
    shelfId,
  ]);

  useEffect(() => {
    const refreshing = isItemMetadataRefreshing(item);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    if (
      metadataRefreshToastArmedRef.current &&
      wasMetadataRefreshingRef.current &&
      !refreshing
    ) {
      if (cancelledMetadataRefreshRef.current) {
        metadataRefreshToastArmedRef.current = false;
        cancelledMetadataRefreshRef.current = false;
      } else {
        // Debounce: a concurrent GET can briefly clear the optimistic stamp
        // before the API/worker persists it — don't toast on that flicker.
        idleTimer = setTimeout(() => {
          if (
            !metadataRefreshToastArmedRef.current ||
            cancelledMetadataRefreshRef.current ||
            isItemMetadataRefreshing(
              queryClient.getQueryData<ItemWithMetadata>([
                "shelf",
                shelfId,
                "items",
                itemId,
              ]),
            )
          ) {
            cancelledMetadataRefreshRef.current = false;
            return;
          }
          toast.success(t("items.refreshMetadataSuccess"));
          metadataRefreshToastArmedRef.current = false;
          cancelledMetadataRefreshRef.current = false;
        }, 750);
      }
    }

    wasMetadataRefreshingRef.current = refreshing;

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [item?.metadataRefreshStartedAt, item, itemId, queryClient, shelfId, t]);

  const prices = useMemo<ItemPrices | null>(() => {
    if (!item?.id) return null;
    if (
      item.priceNew == null &&
      item.priceUsed == null &&
      item.priceUsedCIB == null &&
      item.priceEstimated == null &&
      !item.priceObservations?.length
    ) {
      return null;
    }
    return {
      priceNew: item.priceNew ?? null,
      priceUsed: item.priceUsed ?? null,
      priceUsedCIB: item.priceUsedCIB ?? null,
      priceEstimated: item.priceEstimated ?? null,
      priceLastUpdated: item.priceLastUpdated ?? null,
      priceSources: item.priceSources,
      priceSourceDisplayNames: item.priceSourceDisplayNames,
      isReferencePriceOnly: item.isReferencePriceOnly,
      priceObservations: item.priceObservations,
    };
  }, [item]);

  const shelfItems = useMemo(
    () =>
      ((shelf?.items || []) as Item[])
        .filter((shelfItem) => shelfItem.id)
        .sort((a, b) => compareTitlesForSort(a.name, b.name)),
    [shelf?.items],
  );

  const currentItemIndex = useMemo(() => {
    if (!item?.id || shelfItems.length === 0) return -1;
    return shelfItems.findIndex((shelfItem) => shelfItem.id === item.id);
  }, [item, shelfItems]);

  const hasSiblingNavigation =
    shelfItems.length > 1 && currentItemIndex >= 0 && Boolean(shelf);
  const previousShelfItem = hasSiblingNavigation
    ? shelfItems[(currentItemIndex - 1 + shelfItems.length) % shelfItems.length]
    : null;
  const nextShelfItem = hasSiblingNavigation
    ? shelfItems[(currentItemIndex + 1) % shelfItems.length]
    : null;
  const previousItemHref =
    shelf && previousShelfItem ? itemPath(shelf, previousShelfItem) : null;
  const nextItemHref =
    shelf && nextShelfItem ? itemPath(shelf, nextShelfItem) : null;
  const isDetailOverlayOpen = modalVisible || Boolean(zoomImageUrl);

  const navigateToSibling = useCallback(
    (href?: string | null) => {
      if (!href) return;
      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    if (isDetailOverlayOpen || !previousItemHref || !nextItemHref) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        shouldIgnoreItemNavigation(event.target)
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateToSibling(previousItemHref);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateToSibling(nextItemHref);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDetailOverlayOpen, navigateToSibling, nextItemHref, previousItemHref]);

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (
        !previousItemHref ||
        !nextItemHref ||
        isDetailOverlayOpen ||
        event.touches.length !== 1 ||
        shouldIgnoreItemNavigation(event.target)
      ) {
        touchStartRef.current = null;
        return;
      }

      const touch = event.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    },
    [isDetailOverlayOpen, nextItemHref, previousItemHref],
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || isDetailOverlayOpen || !previousItemHref || !nextItemHref) {
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX < 80 || absX < absY * 1.5) return;

      navigateToSibling(deltaX < 0 ? nextItemHref : previousItemHref);
    },
    [isDetailOverlayOpen, navigateToSibling, nextItemHref, previousItemHref],
  );

  const { mutate } = useMutation<
    Item,
    Error,
    | Prisma.ItemCreateInput
    | (Prisma.ItemUpdateInput & {
        refreshMetadata?: boolean;
        lookupQuery?: string;
        currentShelfId?: string | null;
      })
  >({
    mutationFn: saveItem,
    onSuccess: (item: Item) => {
      const actualShelfId = item.shelfId;
      void syncItemQueries(queryClient, item, [shelfId, actualShelfId]);
    },
    onError: () => {
      toast.error(t("items.saveFailed"));
    },
  });

  const { mutate: refreshMetadata, isPending: isRefreshingMetadata } =
    useMutation({
      mutationFn: () => refreshItemMetadata(itemId, shelfId),
      onMutate: () => {
        metadataRefreshToastArmedRef.current = true;
        cancelledMetadataRefreshRef.current = false;
        const startedAt = new Date().toISOString();
        if (item?.id) {
          patchCachedItem(queryClient, {
            id: item.id,
            shelfId: item.shelfId ?? shelfId,
            metadataRefreshStartedAt: startedAt,
          });
          const shelf = item.shelf;
          if (shelf?.id && shelf.name && shelf.type) {
            upsertBackgroundJobInCache(queryClient, {
              id: item.id,
              name: item.name,
              slug: item.slug ?? "",
              kind: "metadataRefresh",
              startedAt,
              cancellable: true,
              shelf: {
                id: shelf.id,
                name: shelf.name,
                slug: shelf.slug ?? "",
                type: shelf.type,
              },
            });
          }
        }
        // Don't invalidate backgroundJobs here — a refetch can wipe the
        // optimistic job before the API has enqueued it.
      },
      onSuccess: (response) => {
        const actualShelfId = item?.shelfId;

        void queryClient.invalidateQueries({ queryKey: ["backgroundJobs"] });

        if (response.item) {
          void syncItemQueries(queryClient, response.item, [
            shelfId,
            actualShelfId,
          ]);
          return;
        }

        if (response.metadataRefreshStartedAt && item?.id) {
          patchCachedItem(queryClient, {
            id: item.id,
            shelfId: actualShelfId || shelfId,
            metadataRefreshStartedAt: response.metadataRefreshStartedAt,
          });
        }

        if (response.metadata) {
          patchCachedItem(queryClient, {
            id: itemId,
            shelfId: actualShelfId || shelfId,
            metadata: response.metadata,
          });
        }

        void invalidateItemQueries(queryClient, itemId, [
          shelfId,
          actualShelfId,
        ]);
      },
      onError: (error) => {
        console.warn("[Metadata] Refresh failed:", error);
        metadataRefreshToastArmedRef.current = false;
        if (item?.id) {
          patchCachedItem(queryClient, {
            id: item.id,
            shelfId: item.shelfId ?? shelfId,
            metadataRefreshStartedAt: null,
          });
        }
        void queryClient.invalidateQueries({ queryKey: ["backgroundJobs"] });
      },
    });

  const handleRefreshMetadata = useCallback(() => {
    refreshMetadata(undefined, {
      onError: () => {
        toast.error(t("items.refreshMetadataFailed"));
      },
    });
  }, [refreshMetadata, t]);

  const {
    mutate: cancelMetadataRefresh,
    isPending: isCancellingMetadataRefresh,
  } = useMutation({
    mutationFn: () => cancelBackgroundJob(item!.id),
    onMutate: () => {
      cancelledMetadataRefreshRef.current = true;
      metadataRefreshToastArmedRef.current = false;
      if (item?.id) {
        patchCachedItem(queryClient, {
          id: item.id,
          shelfId: item.shelfId ?? shelfId,
          metadataRefreshStartedAt: null,
        });
      }
    },
    onSuccess: () => {
      void invalidateItemQueries(queryClient, item!.id, [
        shelfId,
        item?.shelfId,
      ]);
      void queryClient.invalidateQueries({ queryKey: ["backgroundJobs"] });
      toast.success(t("items.cancelMetadataRefreshSuccess"));
    },
    onError: () => {
      cancelledMetadataRefreshRef.current = false;
      toast.error(t("items.cancelMetadataRefreshFailed"));
    },
  });

  const handleCancelMetadataRefresh = useCallback(() => {
    if (!item?.id) return;
    cancelMetadataRefresh();
  }, [cancelMetadataRefresh, item?.id]);

  const isMetadataRefreshing =
    isItemMetadataRefreshing(item) || isRefreshingMetadata;
  const isEnrichingOnly = isMetadataBusy && !isMetadataRefreshing;

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleModalSubmit = useCallback(
    async (itemData: Prisma.ItemUpdateInput | Prisma.ItemCreateInput) => {
      return new Promise<void>((resolve, reject) => {
        mutate(
          {
            ...itemData,
            id: itemId,
            currentShelfId: item?.shelfId || shelfId,
          },
          {
            onSuccess: (savedItem) => {
              if (savedItem.shelfId && savedItem.shelfId !== shelfId) {
                router.replace(
                  itemPath(
                    (savedItem as ItemWithMetadata).shelf || {
                      id: savedItem.shelfId,
                    },
                    savedItem,
                  ),
                );
              }
              resolve();
            },
            onError: (error) => reject(error),
          },
        );
      });
    },
    [item?.shelfId, itemId, mutate, router, shelfId],
  );

  const year = useMemo(() => {
    if (!item?.metadata?.releaseDate) return undefined;
    const date = new Date(item?.metadata?.releaseDate);
    if (isNaN(date.getTime())) {
      return undefined;
    }
    return date.getFullYear();
  }, [item?.metadata?.releaseDate]);

  const canEdit = useMemo(() => {
    if (!item) return false;
    return hasPermission(item.userId);
  }, [item, hasPermission]);

  // Le memo reste PUR : il renvoie les raisons indépendantes du temps et
  // l'échéance de fraîcheur ; Date.now() est évalué dans l'effect (impureté
  // permise), pas pendant le render (règle react-hooks/purity).
  const metadataRefreshNeed = useMemo(() => {
    if (!isAuthenticated || isGuest || !canEdit) {
      return { needsRefresh: false, staleAfterMs: null };
    }
    if (!item?.metadataId || !item.metadata) {
      return {
        needsRefresh: isItemEnriching(item) && Boolean(item?.barcode),
        staleAfterMs: null,
      };
    }
    const metadata = item.metadata;
    const facts = normalizeFacts(metadata.facts);
    const attachments = Array.isArray(metadata.attachments)
      ? metadata.attachments
      : [];
    const canEvaluateGalleryRefresh = hasDetailMetadataAttachments(metadata);
    const lastFetched = metadata.lastFetched
      ? new Date(metadata.lastFetched)
      : null;
    const hasValidLastFetched =
      !!lastFetched && !Number.isNaN(lastFetched.getTime());
    const isPreEnrichmentMetadata =
      facts.length === 0 &&
      (!hasValidLastFetched || lastFetched < ENRICHMENT_FEATURE_RELEASE);
    const isBeforeCurrentEnrichment =
      !hasValidLastFetched || lastFetched < ENRICHMENT_FEATURE_RELEASE;
    const hasHowLongToBeat = facts.some(
      (fact) =>
        ["duration", "completion-time", "time-to-beat"].includes(fact.kind) &&
        fact.isHowLongToBeatSource,
    );
    const hasHowLongToBeatCompletion = facts.some(
      (fact) =>
        (fact.kind === "completion-time" ||
          (fact.kind === "time-to-beat" &&
            fact.label.toLowerCase().includes("compl"))) &&
        fact.isHowLongToBeatSource,
    );
    const hasGameMediaGallery = hasGameMediaGalleryAttachment(attachments);
    const hasRating = facts.some((fact) => fact.kind === "rating");
    const hasDisplayableAgeRating = facts.some((fact) =>
      isDisplayableAgeRatingFact(fact, shelf?.name),
    );
    const isBeforeGameAgeRatingEnrichment =
      !hasValidLastFetched || lastFetched < GAME_AGE_RATING_FEATURE_RELEASE;
    const isBeforeHltbCompletionEnrichment =
      !hasValidLastFetched || lastFetched < HLTB_COMPLETION_FEATURE_RELEASE;
    const isMissingGameEnrichment =
      canEvaluateGalleryRefresh &&
      shelf?.type === "games" &&
      isBeforeCurrentEnrichment &&
      (!hasHowLongToBeat || !hasGameMediaGallery || !hasRating);
    const isMissingGameAgeRating =
      shelf?.type === "games" &&
      isBeforeGameAgeRatingEnrichment &&
      !hasDisplayableAgeRating;
    const isMissingHltbCompletion =
      shelf?.type === "games" &&
      isBeforeHltbCompletionEnrichment &&
      hasHowLongToBeat &&
      !hasHowLongToBeatCompletion;
    const isMissingMusicGalleryRefresh =
      canEvaluateGalleryRefresh &&
      shelf?.type === "musics" &&
      isMissingMusicGallery("musics", item?.barcode, attachments);
    const isMissingBookGalleryRefresh =
      canEvaluateGalleryRefresh &&
      shelf?.type === "books" &&
      isMissingBookGallery("books", item?.barcode, attachments);
    const isMissingGameGalleryRefresh =
      canEvaluateGalleryRefresh &&
      shelf?.type === "games" &&
      isMissingGameMediaGallery("games", item?.barcode, attachments);
    return {
      needsRefresh:
        isPreEnrichmentMetadata ||
        isMissingGameEnrichment ||
        isMissingGameAgeRating ||
        isMissingHltbCompletion ||
        isMissingMusicGalleryRefresh ||
        isMissingBookGalleryRefresh ||
        isMissingGameGalleryRefresh,
      staleAfterMs: hasValidLastFetched
        ? lastFetched.getTime() + METADATA_REFRESH_TTL_MS
        : null,
    };
  }, [canEdit, isAuthenticated, isGuest, item, shelf?.name, shelf?.type]);

  useEffect(() => {
    autoMetadataRefreshAttemptedRef.current = false;
  }, [itemId]);

  useEffect(() => {
    const shouldAutoRefreshMetadata =
      metadataRefreshNeed.needsRefresh ||
      (metadataRefreshNeed.staleAfterMs !== null &&
        Date.now() > metadataRefreshNeed.staleAfterMs);
    if (
      item?.id !== itemId ||
      !isFetched ||
      isPlaceholderData ||
      !shouldAutoRefreshMetadata ||
      autoMetadataRefreshAttemptedRef.current ||
      isPending
    ) {
      return;
    }

    autoMetadataRefreshAttemptedRef.current = true;
    refreshMetadata();
  }, [
    isFetched,
    isPending,
    isPlaceholderData,
    item?.id,
    itemId,
    refreshMetadata,
    metadataRefreshNeed,
  ]);

  const heroImage = useMemo(() => {
    return (
      item?.backgroundImageUrl || (item ? getHeroImage(item, locale) : null)
    );
  }, [item, locale]);

  const coverImage = item?.imageUrl ?? null;

  /**
   * A foil copy is drawn with the holographic layers; a plain one is not. The
   * provider says which finishes carry an effect and supplies the masks.
   */
  const printVariant = usePrintVariant(item?.printKey, item?.shelf?.type);
  const variantView = variantRendering(item?.variant, printVariant, coverImage);

  const coverSourceChip = useMemo(() => {
    if (!item || !coverImage) return null;
    const displayLocale: AttachmentDisplayLocale =
      locale === "en" ? "en" : "fr";
    const match = findAttachmentForUrl(getGalleryImages(item), coverImage);
    if (!match) return null;
    const gallery = getAttachmentGalleryLabels(
      {
        type: match.type,
        role: match.role,
        title: match.title,
        source: match.source,
        providerLabel: match.providerLabel,
        sourceNames: match.sourceNames,
        gridStyleCoverLabelsSource: match.gridStyleCoverLabelsSource,
      },
      displayLocale,
    );
    return {
      sourceNames: gallery.sourceNames,
      detail: gallery.detail,
    };
  }, [item, coverImage, locale]);

  // Réinitialisation quand la cover change — ajustée pendant le render.
  const [prevCoverImage, setPrevCoverImage] = useState(coverImage);
  if (prevCoverImage !== coverImage) {
    setPrevCoverImage(coverImage);
    setCoverImageFit("contain");
  }

  const handleCoverImageLoad = useCallback(
    (_event: SyntheticEvent<HTMLImageElement>) => {
      setCoverImageFit("contain");
    },
    [],
  );

  const galleryImages = useMemo(() => {
    if (!item) return [];
    const displayLocale: AttachmentDisplayLocale =
      locale === "en" ? "en" : "fr";
    const allImages = getGalleryImages(item);
    // Exclude the cover, including its uncropped twin: the cover is a "_crop"
    // derivative of a gallery image, so its source image must not show again.
    const stripCrop = (url: string) => url.replace(/_crop(\.[^.]+)$/, "$1");
    const coverKey = coverImage ? stripCrop(coverImage) : null;
    return allImages
      .filter(
        (img) => img.url !== coverImage && stripCrop(img.url) !== coverKey,
      )
      .slice(0, 24)
      .map((img) => {
        const gallery = getAttachmentGalleryLabels(
          {
            type: img.type,
            role: img.role,
            title: img.title,
            source: img.source,
            providerLabel: img.providerLabel,
            sourceNames: img.sourceNames,
            gridStyleCoverLabelsSource: img.gridStyleCoverLabelsSource,
          },
          displayLocale,
        );
        return {
          ...img,
          galleryProvider: gallery.provider,
          gallerySourceNames: gallery.sourceNames,
          galleryDetail: gallery.detail,
        };
      });
  }, [item, coverImage, locale]);

  // Other volumes in the same series — consensus-gated (≥2 distinct volumes), so a
  // lone numbered title never renders a phantom series. seriesBaseKey strips the
  // marker + number, so padded shelf names and the unpadded detail name align.
  const resolvedItemId = item?.id;

  const itemDisplayName = item?.name;
  useDocumentTitle(itemDisplayName);

  const displayAliases = useMemo(() => {
    return displayAliasesForItem({
      name: itemDisplayName,
      metadataTitle: item?.metadata?.title,
      aliases: item?.metadata?.aliases,
    });
  }, [item?.metadata?.aliases, item?.metadata?.title, itemDisplayName]);

  const seriesVolumes = useMemo(() => {
    if (!shelf?.items || !item || !resolvedItemId) return [];
    const seriesTitle = item.storedName ?? item.name ?? "";
    const entries = (shelf.items as unknown as ItemWithMetadata[]).map(
      (shelfItem) => ({
        ...shelfItem,
        title: shelfItem.storedName ?? shelfItem.name ?? "",
      }),
    );
    return seriesSiblings(seriesTitle, entries).filter(
      (entry) => entry.id !== resolvedItemId,
    );
    // `shelf` whole: the compiler tracks the object, not the `.items` read.
  }, [shelf, item, resolvedItemId]);

  // Franchise grouping comes only from the provider-sourced franchise fact, never
  // from title heuristics.
  const franchiseName = useMemo(
    () =>
      normalizeFacts(item?.metadata?.facts)
        .find((fact) => fact.kind === FRANCHISE_FACT_KIND)
        ?.value?.trim() || null,
    [item?.metadata?.facts],
  );

  const franchiseItems = useMemo(() => {
    if (!shelf?.items || !franchiseName || !resolvedItemId) return [];
    const target = franchiseName.toLowerCase();
    const seriesIds = new Set(seriesVolumes.map((entry) => entry.id));
    return (shelf.items as unknown as ItemWithMetadata[]).filter(
      (shelfItem) => {
        if (shelfItem.id === resolvedItemId || seriesIds.has(shelfItem.id)) {
          return false;
        }
        return normalizeFacts(shelfItem.metadata?.facts).some(
          (fact) =>
            fact.kind === FRANCHISE_FACT_KIND &&
            fact.value?.trim().toLowerCase() === target,
        );
      },
    );
  }, [shelf, franchiseName, seriesVolumes, resolvedItemId]);

  // Generic "other items" excludes the more specific groups above, so each sibling
  // shows up once in its most meaningful section.
  const otherItems = useMemo(() => {
    if (!shelf?.items || !resolvedItemId) return [];
    const grouped = new Set<string>([
      ...seriesVolumes.map((entry) => entry.id),
      ...franchiseItems.map((entry) => entry.id),
    ]);
    return (shelf.items as unknown as ItemWithMetadata[]).filter(
      (shelfItem) =>
        shelfItem.id !== resolvedItemId && !grouped.has(shelfItem.id),
    );
  }, [shelf, resolvedItemId, seriesVolumes, franchiseItems]);

  const coverAspectRatio = useMemo(() => {
    return getDetailCoverClass(shelf?.cardFormat, shelf?.type);
  }, [shelf?.cardFormat, shelf?.type]);

  const description = useMemo(() => {
    return item?.description || item?.metadata?.description;
  }, [item?.description, item?.metadata?.description]);
  const markdownDescription = useMemo(() => {
    if (!description) return null;
    return prepareDescriptionMarkdown(description);
  }, [description]);

  const copyValue = useMemo(() => {
    if (!prices || !item?.condition) return null;
    return getItemValueEstimate({
      condition: item.condition,
      shelfType: shelf?.type,
      priceNew: prices.priceNew,
      priceUsed: prices.priceUsed,
      priceUsedCIB: prices.priceUsedCIB,
      priceEstimated: prices.priceEstimated,
    });
  }, [prices, item, shelf?.type]);

  const formattedCopyValue = useMemo(() => {
    if (copyValue === null) return null;
    const amount = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(copyValue.cents / 100);
    return copyValue.isEstimate ? `~${amount}` : amount;
  }, [copyValue, locale]);

  const priceSourceSummary = useMemo(() => {
    const conditions = priceObservationConditions(
      item?.condition,
      shelf?.type,
      prices,
    );
    const observations = prices?.priceObservations || [];
    const relevantObservations = observations.filter(
      (observation) =>
        observation.condition && conditions.includes(observation.condition),
    );
    // Only sources that actually feed the grade shown — not every offer on the
    // item (avoids attributing NetGamesRetro retail to a PriceCharting link).
    const sources = Array.from(
      new Set(
        relevantObservations
          .map((observation) => observation.source)
          .filter(Boolean),
      ),
    );

    const soleSource = sources[0];
    const stampedReferenceOnly =
      soleSource &&
      relevantObservations.find(
        (observation) => observation.source === soleSource,
      )?.isReferencePriceSource;

    const sourceDisplayNames = sources.map((source) => {
      const fromObservation = relevantObservations.find(
        (observation) => observation.source === source,
      )?.sourceDisplayLabel;
      if (fromObservation) return fromObservation;
      const index = (prices?.priceSources || []).indexOf(source);
      if (index >= 0 && prices?.priceSourceDisplayNames?.[index]) {
        return prices.priceSourceDisplayNames[index]!;
      }
      return source;
    });

    const sourceUrls = Array.from(
      new Set(
        relevantObservations
          .map((observation) => observation.sourceUrl?.trim())
          .filter((url): url is string => Boolean(url)),
      ),
    );

    return {
      count: sources.length,
      sources,
      sourceDisplayNames,
      /** Prefer the contributing offer URL; never invent a PriceCharting link. */
      sourceUrl: sourceUrls.length === 1 ? sourceUrls[0] : null,
      isReferencePriceOnly:
        sources.length === 1 &&
        (Boolean(stampedReferenceOnly) ||
          (prices?.isReferencePriceOnly ?? false)),
    };
  }, [item?.condition, prices, shelf?.type]);

  const { usefulFacts, providerLinkFacts } = useMemo(() => {
    const facts: DetailFact[] = [];
    const metadata = item?.metadata;
    const sourceFacts = normalizeFacts(metadata?.facts);

    if (shelf?.type === "movies") {
      const runtime = formatRuntimeMinutes(metadata?.duration);
      if (runtime) {
        facts.push({
          kind: "duration",
          label: t("items.info.duration"),
          value: runtime,
          priority: 95,
        });
      }
    }

    if (shelf?.type === "musics") {
      const duration = formatDurationSeconds(metadata?.duration);
      if (duration) {
        facts.push({
          kind: "duration",
          label: t("items.info.duration"),
          value: duration,
          priority: 95,
        });
      }
      if (metadata?.tracksCount) {
        facts.push({
          kind: "tracks",
          label: t("items.info.tracks"),
          value: String(metadata.tracksCount),
          priority: 92,
        });
      }
    }

    if (shelf?.type === "books" && metadata?.pageCount) {
      facts.push({
        kind: "pages",
        label: t("items.info.pages"),
        value: String(metadata.pageCount),
        priority: 95,
      });
    }

    const normalizedFacts = consolidateGeneralFacts(
      consolidatePlayerFacts(
        consolidateAgeRatingFacts(
          normalizeDisplayFacts(sourceFacts, {
            includeEsrbAgeRatings:
              shelf?.type !== "games" || isNtscLikeGameShelf(shelf?.name),
            includePcFacts:
              shelf?.type === "games" && isPcLikeGameShelf(shelf?.name),
          }),
        ),
      ),
    );
    const providerLinks = extractProviderLinkFacts(normalizedFacts);
    const displayFacts = filterRedundantDisplayFacts(normalizedFacts);
    const averageRating = buildAverageRatingFact(normalizedFacts, t, locale);
    facts.push(
      ...displayFacts
        .filter((fact) => fact.kind !== "rating")
        .map((fact) =>
          localizeDisplayFact(fact, t, {
            compactVideoGamePlayers: shelf?.type === "games",
          }),
        )
        .filter((fact): fact is DetailFact => Boolean(fact)),
    );
    if (averageRating) {
      facts.push(averageRating);
    }

    const seen = new Set<string>();
    const sortedFacts = facts
      .filter((fact) => fact.label && fact.value)
      .filter((fact) => {
        const key = `${fact.kind}:${fact.label}:${fact.value}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(sortDetailFacts);

    return {
      usefulFacts: sortedFacts,
      providerLinkFacts: providerLinks,
    };
  }, [item?.metadata, locale, shelf?.name, shelf?.type, t]);
  const catalogEstimateDisplay = useMemo(() => {
    const estimateObservation = prices?.priceObservations?.find(
      (observation) =>
        observation.condition === "estimated" &&
        (observation.catalogEstimateMinCents != null ||
          observation.catalogEstimateMaxCents != null ||
          observation.catalogEstimateDisplayValue),
    );
    if (!estimateObservation) return null;
    return formatCatalogEstimateObservationRange(estimateObservation, locale);
  }, [locale, prices?.priceObservations]);

  const primaryInfoFacts = useMemo(() => {
    const facts: DetailFact[] = [];
    const priceDisplayValue = formattedCopyValue ?? catalogEstimateDisplay;

    if (priceDisplayValue) {
      const priceLabel =
        formattedCopyValue && !priceSourceSummary.isReferencePriceOnly
          ? t("items.info.observedPrice")
          : t("items.info.estimatedValue");
      facts.push({
        kind: "estimated-value",
        label: priceLabel,
        value: priceDisplayValue,
        url: priceSourceSummary.sourceUrl ?? undefined,
        sourceCount: priceSourceSummary.count,
        sourceNames: priceSourceSummary.sourceDisplayNames,
        priority: 110,
      });
    }
    facts.push(...usefulFacts.filter(isPrimaryInfoFact));
    return facts.sort(sortDetailFacts);
  }, [
    catalogEstimateDisplay,
    formattedCopyValue,
    priceSourceSummary.count,
    priceSourceSummary.isReferencePriceOnly,
    priceSourceSummary.sourceDisplayNames,
    priceSourceSummary.sourceUrl,
    t,
    usefulFacts,
  ]);

  const detailTableFacts = useMemo(
    () => usefulFacts.filter(isDetailTableFact).sort(sortDetailFacts),
    [usefulFacts],
  );

  const audioTracks = useMemo(() => {
    const attachments = (item?.metadata?.attachments || []) as Array<{
      type?: string;
      title?: string | null;
      duration?: number | null;
    }>;
    return attachments
      .filter((attachment) => attachment.type === "audio" && attachment.title)
      .slice(0, 24);
  }, [item?.metadata]);

  const showInfoStrip =
    primaryInfoFacts.length > 0 ||
    Boolean(prices && !formattedCopyValue && !catalogEstimateDisplay);

  const shelfHref = shelf ? shelfPath(shelf) : `/shelves/${shelfId}`;
  const backToShelfLabel = shelf?.name
    ? t("items.backToShelf", { name: shelf.name })
    : t("items.backToShelfFallback");

  const infoStrip = showInfoStrip ? (
    <div className="max-w-3xl w-full border-y border-border/60 dark:border-zinc-800/50 py-3 mt-1 space-y-3">
      {primaryInfoFacts.length > 0 && (
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2.5">
          {primaryInfoFacts.map((fact) => (
            <DetailInfoItem
              key={`${fact.kind}-${fact.label}-${fact.value}`}
              fact={fact}
            />
          ))}
        </div>
      )}

      {prices && !formattedCopyValue && !catalogEstimateDisplay && (
        <span className="text-xs text-zinc-500 italic">
          {t("items.noPricesFound")}
        </span>
      )}
    </div>
  ) : null;

  if (!isPending && isFetched && (isError || !item?.id)) {
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
              <Link href={shelfHref}>{backToShelfLabel}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground z-0">
      {/* Netflix-style Ambient Backdrop */}
      {heroImage && (
        <div className="absolute top-0 left-0 right-0 h-[65vh] md:h-[75vh] pointer-events-none -z-10 overflow-hidden select-none">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-[0.50] transition-all duration-1000 ease-out"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          {/* Dark overlay to ensure text readability */}
          <div className="absolute inset-0 bg-zinc-950/10 dark:bg-zinc-950/40" />
          {/* Smooth linear gradient mask fading into body background */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/35 to-background" />
        </div>
      )}

      {/* Header */}
      <Header />

      {/* Modals */}
      {isAuthenticated && !isGuest && canEdit && (
        <>
          <ItemModal
            shelfId={shelfId}
            shelfType={shelf?.type}
            itemId={itemId}
            isOpen={modalVisible}
            onClose={handleModalClose}
            onSubmit={handleModalSubmit}
            defaultTab={modalActiveTab}
          />
        </>
      )}

      {/* Content */}

      <div
        className="overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 flex flex-col gap-6 max-w-7xl w-full mx-auto animate-fade-in duration-300">
          <div className="flex flex-row items-center justify-between gap-3">
            <Link
              href={shelfHref}
              className="group inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3.5 py-2 text-sm font-semibold text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:border-primary/30 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ChevronLeft className="size-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
              <span className="truncate">{backToShelfLabel}</span>
            </Link>

            {hasSiblingNavigation && previousItemHref && nextItemHref && (
              <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-border/70 bg-background/70 p-1 shadow-sm backdrop-blur-md">
                <Link
                  href={previousItemHref}
                  aria-label={t("items.previousItemAria", {
                    name: previousShelfItem?.name || "",
                  })}
                  title={previousShelfItem?.name}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="size-4 shrink-0" />
                  <span className="hidden sm:inline">
                    {t("items.previousItem")}
                  </span>
                </Link>
                <Link
                  href={nextItemHref}
                  aria-label={t("items.nextItemAria", {
                    name: nextShelfItem?.name || "",
                  })}
                  title={nextShelfItem?.name}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="hidden sm:inline">
                    {t("items.nextItem")}
                  </span>
                  <ChevronRight className="size-4 shrink-0" />
                </Link>
              </div>
            )}
          </div>

          {isPending ? (
            <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start p-6 md:p-8 rounded-3xl border border-border/60 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-950/40 backdrop-blur-md shadow-xl w-full mt-4">
              <Skeleton
                className={cn(
                  "mx-auto md:mx-0 rounded-2xl shrink-0 animate-pulse bg-zinc-200 dark:bg-zinc-800",
                  coverAspectRatio,
                )}
              />
              <div className="flex-1 flex flex-col gap-4 w-full">
                <Skeleton className="h-10 w-2/3 animate-pulse bg-zinc-200 dark:bg-zinc-800" />
                <Skeleton className="h-6 w-1/4 animate-pulse bg-zinc-200 dark:bg-zinc-800" />
                <Skeleton className="h-32 w-full animate-pulse bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
          ) : (
            <div className="relative flex flex-col md:flex-row gap-6 md:gap-10 items-start p-6 md:p-8 rounded-3xl border border-border/60 dark:border-zinc-800/80 bg-zinc-50/20 dark:bg-zinc-950/40 backdrop-blur-md shadow-xl overflow-hidden w-full mt-4">
              <div
                onClick={() => coverImage && setZoomImageUrl(coverImage)}
                className={cn(
                  "relative mx-auto md:mx-0 rounded-2xl shrink-0 select-none transition-all duration-300",
                  // A leaning card needs room to lean; the holo view clips
                  // itself with this radius instead.
                  variantView.foilMaskUrl
                    ? "overflow-visible"
                    : "overflow-hidden",
                  coverImage
                    ? // No plate behind the cover: card art is opaque and edge
                      // to edge, so a white slab only framed it.
                      "cursor-pointer group/cover"
                    : "bg-zinc-950/20",
                  coverAspectRatio,
                )}
              >
                {coverImage ? (
                  <>
                    {variantView.foilMaskUrl ? (
                      <HoloCardImage
                        imageUrl={variantView.imageUrl ?? coverImage}
                        alt={itemDisplayName ?? ""}
                        maskUrl={variantView.foilMaskUrl}
                        varnishMaskUrl={variantView.varnishMaskUrl}
                      />
                    ) : (
                      <RemoteImage
                        src={coverImage}
                        alt={itemDisplayName ?? ""}
                        width={768}
                        height={1152}
                        sizes="(max-width: 768px) 240px, 480px"
                        loading="eager"
                        fetchPriority="high"
                        onLoad={handleCoverImageLoad}
                        className={cn(
                          "w-full h-full transition-transform duration-500",
                          coverImageFit === "contain"
                            ? "object-contain"
                            : "object-cover group-hover/cover:scale-105",
                        )}
                      />
                    )}
                    {/* Hover Zoom Overlay — decorative, and the click is the
                        container's, so it must not swallow the pointer: the holo
                        layers below track pointer position to place their sheen. */}
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-0 opacity-0 group-hover/cover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20",
                        // Darkening fights the shimmer it appears with, so a foil
                        // copy keeps the affordance and loses the scrim.
                        variantView.foilMaskUrl
                          ? "bg-transparent"
                          : "bg-black/40",
                      )}
                    >
                      <div className="bg-white/20 hover:bg-white/35 text-white backdrop-blur-md p-2.5 rounded-full border border-white/20 shadow-md active:scale-95 transition-all">
                        <Maximize2 className="size-5" />
                      </div>
                    </div>
                    {coverSourceChip &&
                      (coverSourceChip.sourceNames.length > 0 ||
                        coverSourceChip.detail) && (
                        <div
                          className="absolute top-2 right-2 z-30"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <AttachmentSourceChip
                            sourceNames={coverSourceChip.sourceNames}
                            detail={coverSourceChip.detail}
                          />
                        </div>
                      )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-950 text-muted-foreground p-6 gap-3 min-h-[300px]">
                    <ShelfTypeIcon
                      type={shelf?.type}
                      className="size-16 text-zinc-400 dark:text-zinc-500"
                    />
                  </div>
                )}
              </div>

              {/* Right Column: Title and Details */}
              <div className="flex-1 w-full flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-3xl md:text-5xl font-black tracking-tight text-foreground dark:text-white leading-none">
                    {itemDisplayName}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {isMetadataBusy && (
                      <Badge
                        variant="secondary"
                        className="flex items-center gap-1.5 bg-sky-500/10 text-sky-600 dark:text-sky-300 border border-sky-400/20 font-bold px-2.5 py-0.5"
                      >
                        <Loader2 className="size-3 animate-spin" />
                        {t("items.fetching")}
                      </Badge>
                    )}
                    {hasNoMetadata && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 font-semibold px-2.5 py-0.5"
                      >
                        {t("items.unknownBarcodeMetadata")}
                      </Badge>
                    )}
                    {year && (
                      <Badge
                        variant="secondary"
                        className="bg-zinc-200 dark:bg-zinc-800/80 hover:bg-zinc-300 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-none font-bold px-2.5 py-0.5"
                      >
                        {year}
                      </Badge>
                    )}
                    {item?.condition && (
                      <Badge
                        variant="outline"
                        className="border-border dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 font-semibold px-2 py-0.5 flex gap-1 items-center bg-zinc-100/50 dark:bg-zinc-900/30"
                      >
                        <ConditionIcon condition={item.condition} />
                        {t(`items.conditions.${item.condition}`)}
                      </Badge>
                    )}
                    {shelf?.type && (
                      <Badge className="bg-amber-550/10 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 px-2 py-0.5 text-xs font-semibold">
                        {t(`shelf.type.${shelf.type}`)}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                {isPending ? (
                  <div className="flex flex-wrap gap-2.5 mt-1">
                    <Skeleton className="h-10 w-28 rounded-xl" />
                    <Skeleton className="h-10 w-36 rounded-xl" />
                  </div>
                ) : (
                  isAuthenticated &&
                  !isGuest &&
                  canEdit && (
                    <div className="flex flex-wrap gap-2.5 mt-1 select-none">
                      <Button
                        variant="default"
                        className="bg-primary hover:bg-primary/95 text-primary-foreground border-none rounded-xl h-10 px-4 text-sm font-bold shadow-sm cursor-pointer"
                        onClick={() => {
                          setModalActiveTab("general");
                          setModalVisible(true);
                        }}
                      >
                        <Wrench className="size-4 mr-1.5" />
                        {t("items.editItem")}
                      </Button>
                      <Button
                        variant="secondary"
                        className="bg-card hover:bg-accent hover:text-accent-foreground text-foreground border border-border dark:border-zinc-800 rounded-xl h-10 px-4 text-sm font-bold shadow-sm cursor-pointer"
                        onClick={
                          isMetadataRefreshing
                            ? handleCancelMetadataRefresh
                            : handleRefreshMetadata
                        }
                        disabled={
                          isEnrichingOnly ||
                          isCancellingMetadataRefresh ||
                          (isRefreshingMetadata && !item?.id)
                        }
                      >
                        {isMetadataRefreshing ? (
                          <>
                            {isCancellingMetadataRefresh ? (
                              <Loader2 className="size-4 mr-1.5 animate-spin" />
                            ) : (
                              <X className="size-4 mr-1.5" />
                            )}
                            {t("items.cancelMetadataRefresh")}
                          </>
                        ) : (
                          <>
                            <RefreshCw
                              className={cn(
                                "size-4 mr-1.5",
                                isEnrichingOnly && "animate-spin",
                              )}
                            />
                            {t("items.refreshMetadata")}
                          </>
                        )}
                      </Button>
                    </div>
                  )
                )}

                {infoStrip}

                {hasNoMetadata && (
                  <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    {t("items.unknownBarcodeMetadataHint")}
                  </p>
                )}

                {/* Description */}
                {markdownDescription && (
                  <div
                    className={cn(
                      "text-foreground/90 dark:text-zinc-300 text-sm leading-relaxed max-w-3xl bg-zinc-50/50 dark:bg-zinc-950/20 backdrop-blur-sm border border-border dark:border-zinc-800/50 p-4 rounded-xl shadow-inner mt-1",
                      "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
                      "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
                      "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-semibold",
                      "[&_strong]:font-semibold [&_em]:italic",
                      "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3",
                      "[&_code]:rounded [&_code]:bg-zinc-200/60 [&_code]:px-1 [&_code]:py-0.5 dark:[&_code]:bg-zinc-800/60",
                      "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-zinc-900 [&_pre]:p-3 [&_pre]:text-zinc-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
                      "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border/70 [&_th]:bg-zinc-100/70 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left dark:[&_th]:bg-zinc-900/40 [&_td]:border [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1",
                      "[&_hr]:my-3 [&_hr]:border-border/70",
                      "[&_a]:font-semibold [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline",
                    )}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ node, ...props }) => {
                          void node;
                          return (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          );
                        },
                      }}
                    >
                      {markdownDescription}
                    </ReactMarkdown>
                  </div>
                )}

                {/* Key Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 max-w-3xl bg-zinc-50/40 dark:bg-zinc-950/10 backdrop-blur-sm border border-border dark:border-zinc-800/40 p-5 rounded-2xl shadow-sm mt-3">
                  {displayAliases.length > 0 && (
                    <div className="flex flex-col gap-0.5 border-b border-border/60 dark:border-zinc-800/40 pb-2 sm:col-span-2 sm:border-b-0 sm:pb-0">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 select-none">
                        {t("items.info.alsoKnownAs")}
                      </span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {displayAliases.map((alias) => (
                          <Badge
                            key={alias}
                            variant="secondary"
                            className="rounded-md border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-650 shadow-none dark:border-zinc-800/70 dark:bg-zinc-950/30 dark:text-zinc-300"
                          >
                            {alias}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {item?.storedName && (
                    <div className="flex flex-col gap-0.5 border-b border-border/60 dark:border-zinc-800/40 pb-2 sm:border-b-0 sm:pb-0">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 select-none">
                        {t("items.originalTitle")}
                      </span>
                      <span className="text-sm font-medium text-foreground dark:text-zinc-200">
                        {item.storedName}
                      </span>
                    </div>
                  )}

                  {item?.metadata?.authors &&
                    item.metadata.authors.length > 0 && (
                      <div className="flex flex-col gap-0.5 border-b border-border/60 dark:border-zinc-800/40 pb-2 sm:border-b-0 sm:pb-0">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 select-none">
                          {t("items.authors")}
                        </span>
                        <span className="text-sm font-medium text-foreground dark:text-zinc-200">
                          {item.metadata.authors.map((a) => a.name).join(", ")}
                        </span>
                      </div>
                    )}

                  {item?.metadata?.publishers &&
                    item.metadata.publishers.length > 0 && (
                      <div className="flex flex-col gap-0.5 border-b border-border/60 dark:border-zinc-800/40 pb-2 sm:border-b-0 sm:pb-0">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 select-none">
                          {t("items.publishers")}
                        </span>
                        <span className="text-sm font-medium text-foreground dark:text-zinc-200">
                          {item.metadata.publishers
                            .map((p) => p.name)
                            .join(", ")}
                        </span>
                      </div>
                    )}

                  {providerLinkFacts.length > 0 && (
                    <ProviderLinksBar
                      facts={providerLinkFacts}
                      title={t("items.providerLinks")}
                    />
                  )}

                  {detailTableFacts.map((fact) => (
                    <div
                      key={`${fact.kind}-${fact.label}-${fact.value}`}
                      className="flex flex-col gap-0.5 border-b border-border/60 dark:border-zinc-800/40 pb-2 sm:col-span-2 sm:border-b-0 sm:pb-0"
                    >
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 select-none">
                        {fact.label}
                      </span>
                      {isTagLikeDetailFact(fact) ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {splitTagFactValue(fact.value).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="rounded-md border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-650 shadow-none dark:border-zinc-800/70 dark:bg-zinc-950/30 dark:text-zinc-300"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-foreground dark:text-zinc-200">
                          {fact.value}
                        </span>
                      )}
                      <FactSourceFooter fact={fact} />
                    </div>
                  ))}

                  {item?.metadata?.releaseDate &&
                    !isNaN(new Date(item.metadata.releaseDate).getTime()) && (
                      <div className="flex flex-col gap-0.5 border-b border-border/60 dark:border-zinc-800/40 pb-2 sm:border-b-0 sm:pb-0">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 select-none">
                          {t("items.releaseDate")}
                        </span>
                        <span className="text-sm font-medium text-foreground dark:text-zinc-200">
                          {new Date(
                            item.metadata.releaseDate,
                          ).toLocaleDateString(locale, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    )}

                  {item?.barcode && (
                    <div className="flex flex-col gap-0.5 border-b border-border/60 dark:border-zinc-800/40 pb-2 sm:border-b-0 sm:pb-0">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 select-none">
                        {t(itemsBarcodeLabelKey(shelf?.type))}
                      </span>
                      <span className="text-sm font-medium text-foreground dark:text-zinc-200 font-mono">
                        {item.barcode}
                      </span>
                    </div>
                  )}

                  {item?.createdAt &&
                    !isNaN(new Date(item.createdAt).getTime()) && (
                      <div className="flex flex-col gap-0.5 border-b border-border/60 dark:border-zinc-800/40 pb-2 sm:border-b-0 sm:pb-0">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 select-none">
                          {t("items.addedDate")}
                        </span>
                        <span className="text-sm font-medium text-foreground dark:text-zinc-200">
                          {new Date(item.createdAt).toLocaleDateString(locale, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    )}

                  {item?.updatedAt &&
                    !isNaN(new Date(item.updatedAt).getTime()) && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 select-none">
                          {t("items.lastUpdate")}
                        </span>
                        <span className="text-sm font-medium text-foreground dark:text-zinc-200">
                          {new Date(item.updatedAt).toLocaleDateString(locale, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                </div>

                {audioTracks.length > 0 && (
                  <div className="max-w-3xl w-full border-t border-border/60 dark:border-zinc-800/50 pt-4 mt-1">
                    <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500 select-none">
                      <ListMusic className="size-4 text-amber-600 dark:text-amber-400" />
                      <span>Tracklist</span>
                    </div>
                    <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
                      {audioTracks.map((track, index) => (
                        <li
                          key={`${track.title}-${index}`}
                          className="min-w-0 flex items-baseline gap-2 text-sm text-foreground dark:text-zinc-200"
                        >
                          <span className="w-5 shrink-0 text-[10px] font-black text-zinc-400 tabular-nums">
                            {index + 1}
                          </span>
                          <span className="truncate font-medium">
                            {track.title}
                          </span>
                          {track.duration && (
                            <span className="ml-auto shrink-0 text-[10px] font-semibold text-zinc-500">
                              {formatDurationSeconds(track.duration)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isPending && galleryImages.length > 0 && (
            <div className="mt-8 flex flex-col gap-3">
              <h3 className="text-foreground dark:text-zinc-200 font-bold text-lg tracking-tight select-none">
                {t("items.artworksAndScreenshots")}
              </h3>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {galleryImages.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => setZoomImageUrl(img.url)}
                    className="relative group/gallery shrink-0 w-64 aspect-video rounded-lg overflow-hidden bg-zinc-100/30 dark:bg-zinc-950/30 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer"
                  >
                    <RemoteImage
                      src={img.url}
                      alt={img.type}
                      width={512}
                      height={512}
                      className="w-full h-full object-cover group-hover/gallery:scale-105 transition-transform duration-500"
                    />
                    {/* Hover Zoom Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/gallery:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                      <div className="bg-white/20 hover:bg-white/35 text-white backdrop-blur-md p-2.5 rounded-full border border-white/20 shadow-md active:scale-95 transition-all">
                        <Maximize2 className="size-5" />
                      </div>
                    </div>
                    <div
                      className="absolute top-2 right-2 z-30"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <AttachmentSourceChip
                        sourceNames={img.gallerySourceNames ?? []}
                        detail={img.galleryDetail}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ItemDiscoverySection
            isPending={isPending}
            seriesVolumes={seriesVolumes}
            franchiseName={franchiseName}
            franchiseItems={franchiseItems}
            otherItems={otherItems}
            shelf={shelf}
            shelfId={shelfId}
            t={t}
          />
        </div>
      </div>

      {/* Lightbox Zoom Dialog */}
      <Dialog
        open={!!zoomImageUrl}
        onOpenChange={(open) => {
          if (!open) setZoomImageUrl(null);
        }}
      >
        {/* Transparent: the blur alone separates the card from the page, and a
            black plate fought the holographic sheen it was meant to showcase. */}
        <DialogContent className="max-w-4xl p-0 bg-transparent border-none shadow-none flex flex-col items-center justify-center">
          <DialogTitle className="sr-only">Zoom Image</DialogTitle>
          <div className="relative w-full h-full max-h-[85vh] flex items-center justify-center p-4">
            {zoomImageUrl &&
              /* Fullscreen is where a foil card is worth looking at, so the
                 holographic layers belong here above all — but only for the
                 cover itself: zooming a gallery image shows that image. */
              (variantView.foilMaskUrl &&
              urlsReferToSameLocalizedImage(zoomImageUrl, coverImage ?? "") ? (
                <div className="aspect-[5/7] max-h-[80vh] rounded-lg animate-zoom-in">
                  <HoloCardImage
                    imageUrl={variantView.imageUrl ?? zoomImageUrl}
                    alt="Zoom"
                    maskUrl={variantView.foilMaskUrl}
                    varnishMaskUrl={variantView.varnishMaskUrl}
                  />
                </div>
              ) : (
                <RemoteImage
                  src={zoomImageUrl}
                  alt="Zoom"
                  width={1920}
                  height={1920}
                  className="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl transition-transform duration-300 animate-zoom-in"
                />
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
