"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { cn } from "@/lib/shared/utils";

type AttachmentSourceChipProps = {
  /** Provider display names that contributed this image (usually one). */
  sourceNames: string[];
  /** Optional kind/region caption shown beside the source chip. */
  detail?: string | null;
  className?: string;
  badgeClassName?: string;
  detailClassName?: string;
};

/**
 * Single provider → show its name. Several → “N sources” with a tooltip list.
 */
export function AttachmentSourceChip({
  sourceNames,
  detail,
  className,
  badgeClassName,
  detailClassName,
}: AttachmentSourceChipProps) {
  const { t } = useLocale();
  const names = sourceNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0 && !detail) return null;

  const sourceBadgeClassName = cn(
    "bg-black/75 backdrop-blur text-[9px] font-bold border-none text-amber-400 uppercase px-1.5 py-0.5 rounded",
    badgeClassName,
  );

  let sourceBadge: ReactNode = null;
  if (names.length === 1) {
    sourceBadge = (
      <Badge variant="secondary" className={sourceBadgeClassName}>
        {names[0]}
      </Badge>
    );
  } else if (names.length > 1) {
    sourceBadge = (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={cn(
              sourceBadgeClassName,
              "cursor-help underline decoration-dotted underline-offset-2",
            )}
          >
            {t("items.info.sourcesCount", { count: names.length })}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {names.join(" · ")}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1 items-end z-10 select-none",
        className,
      )}
    >
      {sourceBadge}
      {detail ? (
        <Badge
          variant="secondary"
          className={cn(
            "bg-black/75 backdrop-blur text-[9px] font-bold border-none text-zinc-100 uppercase px-1.5 py-0.5 rounded",
            detailClassName,
          )}
        >
          {detail}
        </Badge>
      ) : null}
    </div>
  );
}
