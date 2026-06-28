"use client";

import { SlidersHorizontal, X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/core/utils";
import {
  DEFAULT_ITEM_COLLECTION_FILTERS,
  ITEM_COLLECTION_RATING_MIN_OPTIONS,
  ITEM_COLLECTION_SORT_OPTIONS,
  hasActiveCollectionFilters,
  type ItemCollectionFilters,
  type ItemCollectionSort,
} from "@/lib/item/collectionQuery";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

import type { Condition } from "@prisma/client";

type ItemCollectionSortSelectProps = {
  value: ItemCollectionSort;
  onValueChange: (value: ItemCollectionSort) => void;
  className?: string;
  placeholderKey?: string;
};

export function ItemCollectionSortSelect({
  value,
  onValueChange,
  className,
  placeholderKey = "sorting.title",
}: ItemCollectionSortSelectProps) {
  const { t } = useLocale();

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as ItemCollectionSort)}>
      <SelectTrigger
        className={cn(
          "w-full bg-zinc-50/5 dark:bg-zinc-950/20 backdrop-blur-md border border-border/80 dark:border-zinc-800/80 rounded-2xl h-11 focus:ring-2 focus:ring-primary/20 transition-all duration-300 cursor-pointer",
          className,
        )}
      >
        <SelectValue placeholder={t(placeholderKey)} />
      </SelectTrigger>
      <SelectContent className="bg-popover border border-border dark:border-zinc-800 rounded-xl shadow-lg">
        {ITEM_COLLECTION_SORT_OPTIONS.map((option) => (
          <SelectItem key={option} value={option} className="cursor-pointer">
            {t(`sorting.${option}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const CONDITION_OPTIONS: Array<Condition | "all"> = [
  "all",
  "new",
  "used",
  "damaged",
];

type ItemCollectionFilterBarProps = {
  filters: ItemCollectionFilters;
  onChange: (filters: ItemCollectionFilters) => void;
  className?: string;
};

export function ItemCollectionFilterBar({
  filters,
  onChange,
  className,
}: ItemCollectionFilterBarProps) {
  const { t } = useLocale();
  const active = hasActiveCollectionFilters(filters);

  const setCondition = (condition: Condition | "all") => {
    onChange({ ...filters, condition });
  };

  const setRatingMin = (ratingMin: number | null) => {
    onChange({ ...filters, ratingMin });
  };

  const togglePricedOnly = () => {
    onChange({ ...filters, pricedOnly: !filters.pricedOnly });
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        <SlidersHorizontal className="size-3.5" />
        <span>{t("filters.title")}</span>
        {active && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_ITEM_COLLECTION_FILTERS)}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold normal-case tracking-normal text-primary hover:bg-primary/10 transition-colors"
          >
            <X className="size-3" />
            {t("filters.clear")}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={filters.condition}
          onValueChange={(value) => setCondition(value as Condition | "all")}
        >
          <SelectTrigger className="w-full sm:w-44 rounded-2xl h-10 text-xs font-semibold">
            <SelectValue placeholder={t("filters.condition")} />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`filters.condition.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.ratingMin === null ? "all" : String(filters.ratingMin)}
          onValueChange={(value) =>
            setRatingMin(value === "all" ? null : Number(value))
          }
        >
          <SelectTrigger className="w-full sm:w-44 rounded-2xl h-10 text-xs font-semibold">
            <SelectValue placeholder={t("filters.ratingMin")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.rating.any")}</SelectItem>
            {ITEM_COLLECTION_RATING_MIN_OPTIONS.map((rating) => (
              <SelectItem key={rating} value={String(rating)}>
                {t("filters.rating.atLeast", { rating })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          aria-pressed={filters.pricedOnly}
          onClick={togglePricedOnly}
          className={cn(
            "inline-flex h-10 items-center justify-center rounded-2xl border px-4 text-xs font-bold transition-colors",
            filters.pricedOnly
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/80 bg-zinc-50/5 text-muted-foreground hover:text-foreground dark:bg-zinc-950/20",
          )}
        >
          {t("filters.pricedOnly")}
        </button>
      </div>
    </div>
  );
}
