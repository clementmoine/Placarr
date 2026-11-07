"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import {
  OrientedMediaFrame,
  OrientedMediaRotator,
} from "@/components/OrientedMediaFrame";
import { useArtFaceOrientation } from "@/lib/client/hooks/useArtFaceOrientation";
import {
  nextTcgdexDisplayUrl,
  tcgdexDisplayCandidates,
} from "@/core/enrich/media/tcgdexAssetUrls";
import { cn } from "@/lib/shared/utils";

import styles from "./checklist.module.css";

export type ChecklistArtOrientation = {
  landscapeFace?: boolean;
  faceQuarterTurns?: 0 | 1 | 2 | 3;
  landscapePrint?: boolean;
};

/**
 * Miniature checklist + aperçu au survol, avec orientation catalogue
 * (paysage natif ou scan portrait à tourner quand le print est paysage).
 */
export function ChecklistHoverThumb({
  src,
  className,
  variant = "card",
  landscapeFace,
  faceQuarterTurns,
  landscapePrint,
}: {
  src: string;
  className: string;
  variant?: "card" | "product";
} & ChecklistArtOrientation) {
  const chain = useMemo(() => tcgdexDisplayCandidates(src), [src]);
  const [current, setCurrent] = useState(chain[0] ?? src);

  useEffect(() => {
    setCurrent(chain[0] ?? src);
  }, [chain, src]);

  const advance = useCallback(() => {
    setCurrent((prev) => nextTcgdexDisplayUrl(prev, chain) ?? prev);
  }, [chain]);

  const orient = useArtFaceOrientation(
    variant === "card" ? current : null,
    variant === "card"
      ? { landscapeFace, faceQuarterTurns, landscapePrint }
      : null,
  );
  const turns = orient.landscapeFace ? 0 : (orient.faceQuarterTurns ?? 0);
  const wide =
    variant === "card" &&
    (orient.landscapeFace || (orient.faceQuarterTurns ?? 0) % 2 === 1);

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt=""
      className={
        variant === "card" && (wide || turns)
          ? styles.thumbOrientedImg
          : className
      }
      loading="lazy"
      decoding="async"
      onError={advance}
    />
  );

  const trigger =
    variant === "card" && (wide || turns) ? (
      <span
        className={className}
        data-oriented=""
        {...(wide ? { "data-landscape": "" } : {})}
      >
        <OrientedMediaRotator
          faceQuarterTurns={turns}
          orientedAspect={wide ? "7 / 5" : "5 / 7"}
          className={styles.thumbOrientedHost}
        >
          {img}
        </OrientedMediaRotator>
      </span>
    ) : (
      img
    );

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="right"
          sideOffset={10}
          collisionPadding={12}
          className={cn(
            styles.thumbPopover,
            variant === "product" && styles.thumbPopoverProduct,
            wide && styles.thumbPopoverWide,
          )}
        >
          {variant === "card" && (wide || turns) ? (
            <OrientedMediaFrame
              aspectRatio="5 / 7"
              faceQuarterTurns={turns}
              landscapeFace={orient.landscapeFace}
              className={styles.thumbPopoverOriented}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current}
                alt=""
                className={styles.thumbPopoverOrientedImg}
                onError={advance}
              />
            </OrientedMediaFrame>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current}
              alt=""
              className={styles.thumbPopoverImg}
              onError={advance}
            />
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
