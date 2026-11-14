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
  /**
   * Sanitized public proof URL for the dump (opens in a new tab).
   * When set, the primary source badge becomes a link.
   */
  proofUrl?: string | null;
  className?: string;
  badgeClassName?: string;
  detailClassName?: string;
};

/**
 * Single provider → show its name. Several → “N sources” with a tooltip list.
 * Optional proof URL makes the chip a citation link.
 */
export function AttachmentSourceChip({
  sourceNames,
  detail,
  proofUrl,
  className,
  badgeClassName,
  detailClassName,
}: AttachmentSourceChipProps) {
  const { t } = useLocale();
  const names = sourceNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0 && !detail) return null;

  const href = proofUrl?.trim() || null;

  const sourceBadgeClassName = cn(
    "bg-black/75 backdrop-blur text-[9px] font-bold border-none text-amber-400 uppercase px-1.5 py-0.5 rounded",
    href ? "underline decoration-dotted underline-offset-2 hover:text-amber-300" : null,
    badgeClassName,
  );

  const wrapProof = (node: ReactNode) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={href}
      >
        {node}
      </a>
    ) : (
      node
    );

  let sourceBadge: ReactNode = null;
  if (names.length === 1) {
    sourceBadge = wrapProof(
      <Badge variant="secondary" className={sourceBadgeClassName}>
        {names[0]}
      </Badge>,
    );
  } else if (names.length > 1) {
    sourceBadge = (
      <Tooltip>
        <TooltipTrigger asChild>
          {wrapProof(
            <Badge
              variant="secondary"
              className={cn(
                sourceBadgeClassName,
                !href && "cursor-help underline decoration-dotted underline-offset-2",
              )}
            >
              {t("items.info.sourcesCount", { count: names.length })}
            </Badge>,
          )}
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
