"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import { CatalogueSealedDetailDialog } from "@/components/admin/CatalogueSealedDetailDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  parseStoryMentions,
  type StoryMention,
} from "@/core/enrich/storytelling/mentions";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import type { CatalogueSealedRow } from "@/lib/admin/catalogueProducts";
import { cn } from "@/lib/shared/utils";

type MentionPreview = {
  kind: "print" | "sealed";
  id: string;
  label: string;
  title: string | null;
  thumbUrl: string | null;
  artUrl: string | null;
  found: boolean;
  sealedProduct?: CatalogueSealedRow | null;
};

function MentionChip({
  mention,
  packId,
  enablePreview,
  onEnlargePrint,
  onEnlargeSealed,
}: {
  mention: StoryMention;
  packId?: string | null;
  enablePreview: boolean;
  onEnlargePrint: (preview: MentionPreview) => void;
  onEnlargeSealed: (product: CatalogueSealedRow) => void;
}) {
  const canFetch = enablePreview && Boolean(packId);
  const { data: preview } = useQuery({
    queryKey: [
      "story-mention-preview",
      packId,
      mention.kind,
      mention.id,
    ],
    enabled: canFetch,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await axios.get<MentionPreview>(
        "/api/admin/pack-stories/preview",
        {
          params: {
            pack: packId,
            kind: mention.kind,
            id: mention.id,
            label: mention.label,
          },
        },
      );
      return data;
    },
  });

  const chip = (
    <button
      type="button"
      className={cn(
        "inline border-0 bg-transparent p-0 text-inherit",
        "font-semibold text-foreground underline decoration-dotted underline-offset-2",
        "hover:decoration-solid",
        canFetch ? "cursor-pointer" : "cursor-default",
      )}
      onClick={() => {
        if (!canFetch) return;
        if (mention.kind === "sealed" && preview?.sealedProduct) {
          onEnlargeSealed(preview.sealedProduct);
          return;
        }
        onEnlargePrint(
          preview ?? {
            kind: mention.kind,
            id: mention.id,
            label: mention.label,
            title: mention.label,
            thumbUrl: null,
            artUrl: null,
            found: false,
            sealedProduct: null,
          },
        );
      }}
    >
      {mention.label}
    </button>
  );

  if (!canFetch) return chip;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[14rem] border border-border bg-popover p-2 text-popover-foreground shadow-md"
      >
        {preview?.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.thumbUrl}
            alt={preview.title || mention.label}
            className="mb-1 max-h-40 w-auto rounded-sm object-contain"
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {preview?.found === false
              ? "Aperçu indisponible"
              : "Chargement…"}
          </p>
        )}
        <p className="text-[11px] font-medium leading-snug">
          {preview?.title || mention.label}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Renders editorial story body with [[print:…|…]] / [[sealed:…|…]] mentions.
 * Pass `packId` (admin) to enable hover preview + click enlarge.
 */
export function StoryBodyWithMentions({
  body,
  packId,
  locale = "fr",
  className,
}: {
  body: string;
  packId?: string | null;
  locale?: string;
  className?: string;
}) {
  const segments = parseStoryMentions(body);
  const enablePreview = Boolean(packId);
  const [printEnlarge, setPrintEnlarge] = useState<MentionPreview | null>(
    null,
  );
  const [sealedEnlarge, setSealedEnlarge] =
    useState<CatalogueSealedRow | null>(null);

  return (
    <>
      <p className={cn("whitespace-pre-wrap text-sm leading-relaxed", className)}>
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={`t-${i}`}>{seg.value}</span>
          ) : (
            <MentionChip
              key={`m-${i}-${seg.mention.kind}-${seg.mention.id}`}
              mention={seg.mention}
              packId={packId}
              enablePreview={enablePreview}
              onEnlargePrint={setPrintEnlarge}
              onEnlargeSealed={setSealedEnlarge}
            />
          ),
        )}
      </p>

      <Dialog
        open={Boolean(printEnlarge)}
        onOpenChange={(open) => {
          if (!open) setPrintEnlarge(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {printEnlarge?.title || printEnlarge?.label || "Aperçu"}
            </DialogTitle>
          </DialogHeader>
          {printEnlarge?.artUrl || printEnlarge?.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={printEnlarge.artUrl || printEnlarge.thumbUrl || ""}
              alt={printEnlarge.title || printEnlarge.label}
              className="mx-auto max-h-[70vh] w-auto object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Pas d’image catalogue pour{" "}
              <span className="font-mono text-xs">{printEnlarge?.id}</span>.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {packId ? (
        <CatalogueSealedDetailDialog
          packId={packId as CataloguePackId}
          product={sealedEnlarge}
          locale={locale}
          open={sealedEnlarge != null}
          onOpenChange={(next) => {
            if (!next) setSealedEnlarge(null);
          }}
        />
      ) : null}
    </>
  );
}
