"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";
import {
  ITEM_COLLECTION_SORT_OPTIONS,
  type ItemCollectionSort,
} from "@/core/collect/collectionQuery";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

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
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as ItemCollectionSort)}
    >
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
