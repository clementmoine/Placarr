"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode, type SyntheticEvent } from "react";

import { CardBackSkeleton } from "@/components/CardBackSkeleton";
import { OrientedMediaRotator } from "@/components/OrientedMediaFrame";
import { RemoteImage } from "@/components/RemoteImage";
import { SealedBagOverlay } from "@/components/SealedBagOverlay";
import { isSealedFinish } from "@/core/render/sealedBag";
import type { FoilBackendPreference } from "@/core/render/foil";
import type { VariantRendering } from "@/lib/client/hooks/usePrintVariant";
import { cn } from "@/lib/shared/utils";

type QuarterTurns = 0 | 1 | 2 | 3;

/*
  Loaded on demand, client-only: the shader tables stay out of a grid of plain
  tiles (most shelves) and out of the server render.
*/
const FoilCardImage = dynamic(
  () => import("@/components/FoilCardImage").then((m) => m.FoilCardImage),
  { ssr: false },
);

export type CardFaceImageOptions = {
  sizes?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  /** Fit / hover classes on the plain `<img>` (`object-contain`, zoom…). */
  className?: string;
};

export type CardFaceFoilOptions = {
  fit?: "cover" | "contain";
  backend?: FoilBackendPreference;
  tilt?: boolean;
  className?: string;
  /** Masks when the caller mirrors / crops them; default to the view's own. */
  maskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
  /** Turns handed to the foil itself; default = the frame's turns. */
  faceQuarterTurns?: number | null;
};

/**
 * Une carte telle qu'elle s'affiche partout — tuile d'étagère, sélecteur
 * d'impression, fiche objet : le dos attend derrière, la face arrive par
 * dessus en fondu, en foil quand la finition en porte un, glissée dans son
 * sachet quand elle est scellée, simple sinon.
 *
 * Un seul endroit pour cet empilement : recopié trois fois, une copie avait
 * gardé un dos plein cadre sous un sachet, qui dépassait autour de la carte.
 */
export function CardFace({
  imageUrl,
  alt,
  view,
  finish,
  printKey,
  title,
  sealedBag,
  cardBackUrl,
  showBack = true,
  foilEnabled = true,
  faceQuarterTurns,
  orientedAspect,
  rotatorClassName,
  image,
  foil,
  onLoad,
}: {
  imageUrl: string;
  alt: string;
  view: VariantRendering;
  /** Finish to fall back on when the view has none (sealed detection). */
  finish?: string | null;
  printKey?: string | null;
  title?: string | null;
  sealedBag?: boolean | null;
  cardBackUrl?: string | null;
  /** False when the frame already has a background (edge-colour bleed). */
  showBack?: boolean;
  /** Caller gate on top of the view's masks (mobile tiles, missing look id). */
  foilEnabled?: boolean;
  faceQuarterTurns?: number | null;
  orientedAspect?: string;
  rotatorClassName?: string;
  image?: CardFaceImageOptions;
  foil?: CardFaceFoilOptions;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const sealed = isSealedFinish(view.finish ?? finish);
  const maskUrl = foil?.maskUrl ?? view.foilMaskUrl;
  const useFoil = foilEnabled && Boolean(maskUrl);

  // Fade the plain face in over the back; reset when the artwork changes.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const hidden = Boolean(cardBackUrl) && readyFor !== imageUrl;
  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    setReadyFor(imageUrl);
    onLoad?.(event);
  };

  let face: ReactNode;
  if (useFoil) {
    face = (
      <FoilCardImage
        effectPack={view.effectPackId}
        printKey={printKey}
        title={title}
        imageUrl={imageUrl}
        alt={alt}
        finish={view.finish}
        sealedBag={sealedBag}
        materialName={view.materialName}
        varnishType={view.varnishType}
        cssFinishShaderId={view.shader?.id ?? null}
        cssVarnishShaderId={view.varnish?.id ?? null}
        lenticularGrid={view.lenticularGrid}
        lenticularCropProfile={view.lenticularCropProfile}
        scanCrop={view.scanCrop}
        maskUrl={maskUrl}
        varnishMaskUrl={foil?.varnishMaskUrl ?? view.varnishMaskUrl}
        varnishColor={view.varnishColor}
        secondVarnishMaskUrl={
          foil?.secondVarnishMaskUrl ?? view.secondVarnishMaskUrl
        }
        secondVarnishColor={view.secondVarnishColor}
        faceQuarterTurns={
          (foil?.faceQuarterTurns ??
            faceQuarterTurns ??
            null) as QuarterTurns | null
        }
        fit={foil?.fit}
        backend={foil?.backend}
        tilt={foil?.tilt}
        className={foil?.className}
      />
    );
  } else {
    const img = (
      <RemoteImage
        src={imageUrl}
        alt={alt}
        fill={image?.fill}
        width={image?.width}
        height={image?.height}
        sizes={image?.sizes}
        priority={image?.priority}
        loading={image?.loading}
        fetchPriority={image?.fetchPriority}
        onLoad={handleLoad}
        className={cn(
          "h-full w-full select-none transition-opacity duration-150 ease-out",
          image?.className ?? "object-cover",
          hidden && "opacity-0",
        )}
      />
    );
    face = sealed ? (
      <SealedBagOverlay side="front">{img}</SealedBagOverlay>
    ) : (
      <div className="relative h-full w-full">{img}</div>
    );
  }

  return (
    <>
      {showBack && (
        <CardBackSkeleton
          url={cardBackUrl}
          faceQuarterTurns={faceQuarterTurns}
          orientedAspect={orientedAspect}
          sealed={sealed}
        />
      )}
      <OrientedMediaRotator
        faceQuarterTurns={faceQuarterTurns}
        orientedAspect={orientedAspect}
        className={rotatorClassName}
      >
        {face}
      </OrientedMediaRotator>
    </>
  );
}
