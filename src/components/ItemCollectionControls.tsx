"use client";

import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";
import {
  itemCollectionSortOptions,
  type ItemCollectionSort,
} from "@/core/collect/collectionQuery";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

type ItemCollectionSortSelectProps = {
  value: ItemCollectionSort;
  onValueChange: (value: ItemCollectionSort) => void;
  className?: string;
  placeholderKey?: string;
  /** When set, binder (set → number) sorts appear for print shelves only. */
  shelfType?: string | null;
};

export function ItemCollectionSortSelect({
  value,
  onValueChange,
  className,
  placeholderKey = "sorting.title",
  shelfType,
}: ItemCollectionSortSelectProps) {
  const { t } = useLocale();
  const options = itemCollectionSortOptions(shelfType);

  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as ItemCollectionSort)}
    >
      <SelectTrigger
        className={cn(
          "w-full bg-zinc-50/5 dark:bg-zinc-950/20 backdrop-blur-md border border-border/80 dark:border-zinc-800/80 rounded-2xl h-11 data-[size=default]:h-11 focus:ring-2 focus:ring-primary/20 transition-all duration-300 cursor-pointer",
          className,
        )}
      >
        <SelectValue placeholder={t(placeholderKey)} />
      </SelectTrigger>
      <SelectContent className="bg-popover border border-border dark:border-zinc-800 rounded-xl shadow-lg">
        {options.map((option) => (
          <SelectItem key={option} value={option} className="cursor-pointer">
            {t(`sorting.${option}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type ItemCollectionDuplicatesFilterProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  className?: string;
};

/** Toggle: show only tiles that group more than one physical copy. */
export function ItemCollectionDuplicatesFilter({
  value,
  onValueChange,
  className,
}: ItemCollectionDuplicatesFilterProps) {
  const { t } = useLocale();

  return (
    <Button
      type="button"
      variant={value ? "default" : "outline"}
      aria-pressed={value}
      onClick={() => onValueChange(!value)}
      className={cn(
        "h-11 shrink-0 rounded-2xl border-border/80 dark:border-zinc-800/80 px-3.5",
        !value &&
          "bg-zinc-50/5 dark:bg-zinc-950/20 backdrop-blur-md hover:bg-zinc-50/10",
        className,
      )}
    >
      <Copy className="size-4" />
      {t("filters.duplicatesOnly")}
    </Button>
  );
}
