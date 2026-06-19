"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  Wrench,
  Search,
  Link2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Maximize2,
  Clock3,
  Trophy,
  BookOpen,
  ListMusic,
  ShieldCheck,
  Users,
  Star,
} from "lucide-react";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Header from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ItemModal } from "@/components/modals/ItemModal";
import { AssociationModal } from "@/components/modals/AssociationModal";
import { ConditionIcon } from "@/components/ConditionIcon";
import { ItemCard } from "@/components/ItemCard";

import { getShelf } from "@/lib/api/shelves";
import {
  getItem,
  saveItem,
  getItemPrices,
  refreshItemMetadata,
} from "@/lib/api/items";
import {
  getHeroImage,
  getGalleryImages,
  getMediaTypeLabel,
} from "@/lib/itemMedia";

import type { ShelfWithItems } from "@/types/shelves";
import type { ItemWithMetadata } from "@/types/items";
import type { Shelf, Prisma, Item } from "@prisma/client";
import { useAccount } from "@/lib/hooks/useAccount";
import { useLocale } from "@/lib/providers/LocaleProvider";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { getDetailCoverClass, getAspectRatio } from "@/lib/cardFormat";
import { itemPath, shelfPath } from "@/lib/slugs";
import { buildPriceChartingGameUrl } from "@/lib/priceChartingUrl";
import {
  invalidateItemQueries,
  patchCachedItem,
  syncItemQueries,
} from "@/lib/itemQueryCache";
import { getEstimatedItemValueCents } from "@/lib/itemValue";

type DetailFact = {
  kind: string;
  label: string;
  value: string;
  url?: string;
  source?: string;
  priority?: number;
};

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const ENRICHMENT_FEATURE_RELEASE = new Date("2026-06-16T17:30:00.000Z");
const GAME_AGE_RATING_FEATURE_RELEASE = new Date("2026-06-18T08:00:00.000Z");
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

function factIcon(kind: string) {
  if (kind === "estimated-value") return Coins;
  if (kind === "age-rating") return ShieldCheck;
  if (kind === "players") return Users;
  if (kind === "completion-time") return Trophy;
  if (kind === "external-link") return Link2;
  if (kind === "playtime" || kind === "time-to-beat" || kind === "duration") {
    return Clock3;
  }
  if (kind === "pages") return BookOpen;
  if (kind === "tracks") return ListMusic;
  if (kind === "rating" || kind === "popularity") return Star;
  return Search;
}

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
  return {
    icon: "text-zinc-600 dark:text-zinc-400",
    value: "text-foreground dark:text-zinc-100",
    bg: "bg-zinc-50/60 dark:bg-zinc-950/20 border-border/60 dark:border-zinc-800/60",
  };
}

function formatFactValue(fact: DetailFact) {
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

function formatFactSource(source: string) {
  switch (source.toLowerCase()) {
    case "steam":
      return "Steam";
    case "igdb":
      return "IGDB";
    case "rawg":
      return "RAWG";
    case "steamgriddb":
      return "SteamGridDB";
    case "tmdb":
      return "TMDB";
    case "bgg":
      return "BGG";
    default:
      return source;
  }
}

function isPrimaryInfoFact(fact: DetailFact) {
  return [
    "age-rating",
    "completion-time",
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

const FACT_DISPLAY_ORDER: Record<string, number> = {
  "estimated-value": 10,
  "age-rating": 20,
  duration: 30,
  playtime: 30,
  "time-to-beat": 30,
  "completion-time": 40,
  rating: 50,
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
  const source = (fact.source || "").toLowerCase();
  const label = fact.label.toLowerCase();
  return (
    source === "steam" ||
    source === "steamdb" ||
    source === "pcgamingwiki" ||
    label === "steam" ||
    label === "steamdb" ||
    label === "pcgamingwiki"
  );
}

function normalizeDisplayFact(fact: DetailFact): DetailFact | null {
  if (fact.kind === "external-link") return null;

  if (fact.kind === "time-to-beat") {
    const label = fact.label.toLowerCase();
    if (label.includes("extra")) return null;

    if (label.includes("compl")) {
      return {
        ...fact,
        kind: "completion-time",
        label: "Complétion",
        url: fact.source?.toLowerCase().includes("how long")
          ? fact.url
          : undefined,
      };
    }

    return {
      ...fact,
      kind: "duration",
      label: "Durée",
      url: fact.source?.toLowerCase().includes("how long")
        ? fact.url
        : undefined,
    };
  }

  return {
    ...fact,
    url:
      fact.kind === "estimated-value" ||
      fact.source?.toLowerCase().includes("how long")
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

function buildAverageRatingFact(
  facts: DetailFact[],
  t: TranslateFn,
  locale: string,
): DetailFact | null {
  const values = facts
    .filter((fact) => fact.kind === "rating")
    .map(parseRatingOnScale)
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    kind: "rating",
    label: t("items.info.averageRating"),
    value: formatRatingOnScale(average, locale),
    source:
      values.length === 1
        ? t("items.info.oneSource")
        : t("items.info.sourcesCount", { count: values.length }),
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

  const labelByKind: Record<string, string> = {
    "completion-time": t("items.info.completion"),
    duration: t("items.info.duration"),
    pages: t("items.info.pages"),
    players: t("items.info.players"),
    playtime: t("items.info.playtime"),
    tracks: t("items.info.tracks"),
  };

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
    (fact) =>
      (fact.kind === "duration" || fact.kind === "completion-time") &&
      fact.source?.toLowerCase().includes("how long"),
  );

  return facts
    .filter((fact) => !hasDirectHltb || fact.kind !== "time-to-beat")
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
  const Icon = factIcon(fact.kind);
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
        {fact.source && (
          <span className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-600 truncate">
            {formatFactSource(fact.source)}
          </span>
        )}
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
  const [associationModalVisible, setAssociationModalVisible] =
    useState<boolean>(false);
  const [modalActiveTab, setModalActiveTab] = useState<
    "general" | "poster" | "background" | "info"
  >("general");
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [autoMetadataRefreshAttempted, setAutoMetadataRefreshAttempted] =
    useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const queryClient = useQueryClient();

  const { data: shelf } = useQuery({
    queryKey: ["shelf", shelfId],
    queryFn: () => getShelf(shelfId),
  });

  const { data: item, isFetching } = useQuery({
    queryKey: ["shelf", shelfId, "items", itemId],
    queryFn: () => getItem(itemId, shelfId),
    initialData: () =>
      queryClient
        .getQueryData<ShelfWithItems>(["shelf", shelfId])
        ?.items?.find((i) => i.id === itemId) as ItemWithMetadata,
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(["shelves"])?.dataUpdatedAt,
  });

  const { data: prices, isFetching: isFetchingPrices } = useQuery({
    queryKey: ["shelf", shelfId, "items", itemId, "prices"],
    queryFn: () => getItemPrices(itemId, shelfId),
    enabled: !!itemId && !!item?.barcode,
  });

  const shelfItems = useMemo(
    () => ((shelf?.items || []) as Item[]).filter((shelfItem) => shelfItem.id),
    [shelf?.items],
  );

  const currentItemIndex = useMemo(() => {
    if (!item?.id || shelfItems.length === 0) return -1;
    return shelfItems.findIndex((shelfItem) => shelfItem.id === item.id);
  }, [item?.id, shelfItems]);

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
  const isDetailOverlayOpen =
    modalVisible || associationModalVisible || Boolean(zoomImageUrl);

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
      })
  >({
    mutationFn: saveItem,
    onSuccess: (item: Item) => {
      const actualShelfId = item.shelfId;
      void syncItemQueries(queryClient, item, [shelfId, actualShelfId]);
    },
    onError: () => {
      toast.error(t("shelves.createUpdateError"));
    },
  });

  const { mutate: refreshMetadata } = useMutation({
    mutationFn: () =>
      refreshItemMetadata(itemId, shelfId, item?.metadata?.title || item?.name),
    onSuccess: (response) => {
      const actualShelfId = item?.shelfId;

      if (response.item) {
        void syncItemQueries(queryClient, response.item, [
          shelfId,
          actualShelfId,
        ]);
        return;
      }

      if (response.metadata) {
        patchCachedItem(queryClient, {
          id: itemId,
          shelfId: actualShelfId || shelfId,
          metadata: response.metadata,
        });
      }

      void invalidateItemQueries(queryClient, itemId, [shelfId, actualShelfId]);
    },
    onError: (error) => {
      console.warn("[Metadata] Auto refresh failed:", error);
    },
  });

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleModalSubmit = useCallback(
    async (shelf: Prisma.ShelfUpdateInput) => {
      return new Promise<void>((resolve, reject) => {
        mutate(shelf, {
          onSuccess: () => resolve(),
          onError: () => reject(),
        });
      });
    },
    [mutate],
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

  const shouldAutoRefreshMetadata = useMemo(() => {
    if (!isAuthenticated || isGuest || !canEdit) {
      return false;
    }
    if (!item?.metadataId || !item.metadata) {
      return Boolean(item?.barcode);
    }
    const metadata = item.metadata as any;
    const facts = normalizeFacts(metadata.facts);
    const attachments = Array.isArray(metadata.attachments)
      ? metadata.attachments
      : [];
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
        fact.source?.toLowerCase().includes("how long"),
    );
    const hasScreenScraperMedia = attachments.some(
      (attachment: any) => attachment.source === "screenscraper",
    );
    const hasRating = facts.some((fact) => fact.kind === "rating");
    const hasDisplayableAgeRating = facts.some((fact) =>
      isDisplayableAgeRatingFact(fact, shelf?.name),
    );
    const isBeforeGameAgeRatingEnrichment =
      !hasValidLastFetched || lastFetched < GAME_AGE_RATING_FEATURE_RELEASE;
    const isMissingGameEnrichment =
      shelf?.type === "games" &&
      isBeforeCurrentEnrichment &&
      (!hasHowLongToBeat || !hasScreenScraperMedia || !hasRating);
    const isMissingGameAgeRating =
      shelf?.type === "games" &&
      isBeforeGameAgeRatingEnrichment &&
      !hasDisplayableAgeRating;
    const isStale =
      hasValidLastFetched &&
      Date.now() - lastFetched.getTime() > METADATA_REFRESH_TTL_MS;

    return (
      isPreEnrichmentMetadata ||
      isMissingGameEnrichment ||
      isMissingGameAgeRating ||
      isStale
    );
  }, [
    canEdit,
    isAuthenticated,
    isGuest,
    item?.barcode,
    item?.metadata,
    item?.metadataId,
    shelf?.type,
  ]);

  useEffect(() => {
    if (
      !shouldAutoRefreshMetadata ||
      autoMetadataRefreshAttempted ||
      isFetching
    ) {
      return;
    }

    setAutoMetadataRefreshAttempted(true);
    refreshMetadata();
  }, [
    autoMetadataRefreshAttempted,
    isFetching,
    refreshMetadata,
    shouldAutoRefreshMetadata,
  ]);

  const heroImage = useMemo(() => {
    return item?.backgroundImageUrl || (item ? getHeroImage(item) : null);
  }, [item]);

  const coverImage = useMemo(() => {
    return item?.imageUrl ?? null;
  }, [item?.imageUrl]);

  const galleryImages = useMemo(() => {
    if (!item) return [];
    const allImages = getGalleryImages(item);
    return allImages.filter((img) => img.url !== coverImage).slice(0, 24);
  }, [item, coverImage]);

  const otherItems = useMemo(() => {
    if (!shelf?.items) return [];
    const items = shelf.items as unknown as ItemWithMetadata[];
    return items.filter((i) => i.id !== itemId);
  }, [shelf?.items, itemId]);

  const coverAspectRatio = useMemo(() => {
    return getDetailCoverClass(shelf?.cardFormat, shelf?.type);
  }, [shelf?.cardFormat, shelf?.type]);

  const description = useMemo(() => {
    return item?.description || item?.metadata?.description;
  }, [item?.description, item?.metadata?.description]);

  const copyValue = useMemo(() => {
    if (!prices || !item?.condition) return null;
    return getEstimatedItemValueCents({
      condition: item.condition,
      shelfType: shelf?.type,
      priceNew: prices.priceNew,
      priceUsed: prices.priceUsed,
      priceUsedCIB: prices.priceUsedCIB,
    });
  }, [prices, item?.condition, shelf?.type]);

  const formattedCopyValue = useMemo(() => {
    if (copyValue === null) return null;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(copyValue / 100);
  }, [copyValue, locale]);

  const priceSourceLabel = useMemo(() => {
    if (!prices?.priceLastUpdated) return "PriceCharting";
    return `PriceCharting · ${new Date(
      prices.priceLastUpdated,
    ).toLocaleDateString(locale, { month: "short", day: "numeric" })}`;
  }, [locale, prices?.priceLastUpdated]);

  const priceChartingAliases = useMemo(() => {
    const aliases = item?.metadata?.aliases;
    if (!aliases) return undefined;
    if (Array.isArray(aliases)) return aliases;
    if (typeof aliases === "string") {
      try {
        const parsed = JSON.parse(aliases);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [item?.metadata?.aliases]);

  const priceChartingLink = useMemo(() => {
    if (!item || shelf?.type !== "games") return null;
    return buildPriceChartingGameUrl({
      title: item.metadata?.title,
      fallbackTitle: item.name,
      shelfName: shelf?.name,
      barcode: item.barcode,
      aliases: priceChartingAliases,
    });
  }, [
    item,
    item?.barcode,
    item?.metadata?.title,
    item?.name,
    priceChartingAliases,
    shelf?.name,
    shelf?.type,
  ]);

  const usefulFacts = useMemo(() => {
    const facts: DetailFact[] = [];
    const metadata = item?.metadata as any;
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

    const normalizedFacts = normalizeDisplayFacts(sourceFacts, {
      includeEsrbAgeRatings:
        shelf?.type !== "games" || isNtscLikeGameShelf(shelf?.name),
      includePcFacts: shelf?.type === "games" && isPcLikeGameShelf(shelf?.name),
    });
    const averageRating = buildAverageRatingFact(normalizedFacts, t, locale);
    facts.push(
      ...normalizedFacts
        .filter((fact) => fact.kind !== "rating")
        .map((fact) => localizeDisplayFact(fact, t))
        .filter((fact): fact is DetailFact => Boolean(fact)),
    );
    if (averageRating) {
      facts.push(averageRating);
    }

    const seen = new Set<string>();
    return facts
      .filter((fact) => fact.label && fact.value)
      .filter((fact) => {
        const key = `${fact.kind}:${fact.label}:${fact.value}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(sortDetailFacts)
      .slice(0, 8);
  }, [item?.metadata, locale, shelf?.name, shelf?.type, t]);
  const primaryInfoFacts = useMemo(() => {
    const facts: DetailFact[] = [];
    if (formattedCopyValue) {
      facts.push({
        kind: "estimated-value",
        label: t("items.info.estimatedValue"),
        value: formattedCopyValue,
        url: priceChartingLink?.url,
        source: priceSourceLabel,
        priority: 110,
      });
    }
    facts.push(...usefulFacts.filter(isPrimaryInfoFact));
    return facts.sort(sortDetailFacts);
  }, [
    formattedCopyValue,
    priceChartingLink?.url,
    priceSourceLabel,
    t,
    usefulFacts,
  ]);

  const secondaryFacts = useMemo(
    () => usefulFacts.filter((fact) => !isPrimaryInfoFact(fact)),
    [usefulFacts],
  );

  const audioTracks = useMemo(() => {
    const attachments = ((item?.metadata as any)?.attachments || []) as Array<{
      type?: string;
      title?: string | null;
      duration?: number | null;
    }>;
    return attachments
      .filter((attachment) => attachment.type === "audio" && attachment.title)
      .slice(0, 24);
  }, [item?.metadata]);

  const showInfoStrip =
    isFetchingPrices ||
    primaryInfoFacts.length > 0 ||
    secondaryFacts.length > 0 ||
    Boolean(item?.barcode && prices && !formattedCopyValue);

  const shelfHref = shelf ? shelfPath(shelf) : `/shelves/${shelfId}`;
  const backToShelfLabel = shelf?.name
    ? t("items.backToShelf", { name: shelf.name })
    : t("items.backToShelfFallback");

  const infoStrip = showInfoStrip ? (
    <div className="max-w-3xl w-full border-y border-border/60 dark:border-zinc-800/50 py-3 mt-1 space-y-3">
      {isFetchingPrices ? (
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2.5">
          <Skeleton className="h-[62px] w-full sm:w-[176px] rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <Skeleton className="h-[62px] w-full sm:w-[176px] rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        </div>
      ) : (
        <>
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

          {item?.barcode && prices && !formattedCopyValue && (
            <span className="text-xs text-zinc-500 italic">
              {t("items.noPricesFound")}
            </span>
          )}

          {secondaryFacts.length > 0 && (
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2.5">
              {secondaryFacts.map((fact) => (
                <DetailInfoItem
                  key={`${fact.kind}-${fact.label}-${fact.value}`}
                  fact={fact}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  ) : null;

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
          <AssociationModal
            isOpen={associationModalVisible}
            onClose={() => setAssociationModalVisible(false)}
            itemId={itemId}
            routeShelfId={shelfId}
            item={item}
            shelfType={shelf?.type}
            shelfName={shelf?.name}
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                  <span>{t("items.previousItem")}</span>
                </Link>
                <Link
                  href={nextItemHref}
                  aria-label={t("items.nextItemAria", {
                    name: nextShelfItem?.name || "",
                  })}
                  title={nextShelfItem?.name}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{t("items.nextItem")}</span>
                  <ChevronRight className="size-4 shrink-0" />
                </Link>
              </div>
            )}
          </div>

          {isFetching ? (
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
              {/* Left Column: Poster/Cover Card */}
              <div
                onClick={() => coverImage && setZoomImageUrl(coverImage)}
                className={cn(
                  "relative mx-auto md:mx-0 rounded-2xl overflow-hidden shadow-2xl shadow-black/10 dark:shadow-black/90 border border-border dark:border-zinc-800/80 shrink-0 select-none bg-zinc-950/20 transition-all duration-300",
                  coverImage ? "cursor-pointer group/cover" : "",
                  coverAspectRatio,
                )}
              >
                {coverImage ? (
                  <>
                    <Image
                      src={coverImage}
                      alt={item?.name}
                      width={512}
                      height={512}
                      className="w-full h-full object-cover group-hover/cover:scale-105 transition-transform duration-500"
                    />
                    {/* Hover Zoom Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                      <div className="bg-white/20 hover:bg-white/35 text-white backdrop-blur-md p-2.5 rounded-full border border-white/20 shadow-md active:scale-95 transition-all">
                        <Maximize2 className="size-5" />
                      </div>
                    </div>
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
                    {item?.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
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
                {isAuthenticated && !isGuest && canEdit && (
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
                      onClick={() => setAssociationModalVisible(true)}
                    >
                      {item?.metadataId ? (
                        <Link2 className="size-4 mr-1.5" />
                      ) : (
                        <Search className="size-4 mr-1.5" />
                      )}
                      {item?.metadataId
                        ? t("items.fixMeta")
                        : t("items.findMeta")}
                    </Button>
                  </div>
                )}

                {infoStrip}

                {/* Description */}
                {description && (
                  <p className="text-foreground/90 dark:text-zinc-300 text-sm leading-relaxed max-w-3xl bg-zinc-50/50 dark:bg-zinc-950/20 backdrop-blur-sm border border-border dark:border-zinc-800/50 p-4 rounded-xl shadow-inner mt-1">
                    {description}
                  </p>
                )}

                {/* Key Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 max-w-3xl bg-zinc-50/40 dark:bg-zinc-950/10 backdrop-blur-sm border border-border dark:border-zinc-800/40 p-5 rounded-2xl shadow-sm mt-3">
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
                        {t("items.barcode")}
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

          {!isFetching && galleryImages.length > 0 && (
            <div className="mt-8 flex flex-col gap-3">
              <h3 className="text-foreground dark:text-zinc-200 font-bold text-lg tracking-tight select-none">
                {t("items.artworksAndScreenshots")}
              </h3>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {galleryImages.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => setZoomImageUrl(img.url)}
                    className="relative group/gallery shrink-0 w-64 aspect-video rounded-lg overflow-hidden border border-border dark:border-zinc-800/80 bg-zinc-100/30 dark:bg-zinc-950/30 hover:border-zinc-350 dark:hover:border-zinc-700/80 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer"
                  >
                    <Image
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
                    <div className="absolute top-2 right-2 flex gap-1 items-center z-10 select-none">
                      <Badge
                        variant="secondary"
                        className="bg-black/75 backdrop-blur text-[9px] font-bold border-none text-zinc-100 uppercase px-1.5 py-0.5 rounded"
                      >
                        {getMediaTypeLabel(img.type)}
                      </Badge>
                      {img.source && (
                        <Badge
                          variant="secondary"
                          className="bg-black/75 backdrop-blur text-[9px] font-bold border-none text-amber-400 uppercase px-1.5 py-0.5 rounded"
                        >
                          {img.source}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other items in this shelf carousel */}
          {!isFetching && otherItems.length > 0 && (
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

                {/* "View all" card at the end */}
                <div className="w-28 sm:w-32 shrink-0">
                  <Link href={shelfPath(shelf || { id: shelfId })}>
                    <div
                      className="group relative flex flex-col w-full h-full select-none overflow-hidden rounded-2xl border bg-card/45 border-dashed border-border/80 hover:border-zinc-350 dark:hover:border-zinc-700/50 shadow-sm hover:shadow-md hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 ease-out cursor-pointer items-center justify-center min-h-[150px] gap-2 p-4 text-center"
                      style={{
                        aspectRatio: getAspectRatio(
                          shelf?.cardFormat,
                          shelf?.type,
                        ),
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
      </div>

      {/* Lightbox Zoom Dialog */}
      <Dialog
        open={!!zoomImageUrl}
        onOpenChange={(open) => {
          if (!open) setZoomImageUrl(null);
        }}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/90 border-none flex flex-col items-center justify-center backdrop-blur-xl">
          <DialogTitle className="sr-only">Zoom Image</DialogTitle>
          <div className="relative w-full h-full max-h-[85vh] flex items-center justify-center p-4">
            {zoomImageUrl && (
              <img
                src={zoomImageUrl}
                alt="Zoom"
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl transition-transform duration-300 animate-zoom-in"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
