"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { FoilCardImage } from "@/components/FoilCardImage";
import { RemoteImage } from "@/components/RemoteImage";
import {
  usePrintVariant,
  variantRendering,
} from "@/lib/client/hooks/usePrintVariant";
import { cn } from "@/lib/shared/utils";
import type { CatalogueSealedContainedProduct } from "@/lib/admin/catalogueProducts";
import type { SealedPrintLink } from "@/providers/shared/sealedProducts/indexFormat";
import {
  ensureEffects,
  effectsRegistered,
  subscribeEffectsReady,
} from "@/effects/ensureEffects";

const SHELF_TYPE = "tcg";
/** Couches visibles derrière la carte du dessus (pile visuelle). */
const MAX_STACK_LAYERS = 3;

export function sealedPrintQty(print: SealedPrintLink): number {
  return print.qty != null && print.qty > 0 ? Math.floor(print.qty) : 1;
}

export function sealedPrintCopyCount(prints: readonly SealedPrintLink[]): number {
  return prints.reduce((n, print) => n + sealedPrintQty(print), 0);
}

function SealedPrintThumb({
  print,
  fr,
}: {
  print: SealedPrintLink;
  fr: boolean;
}) {
  const printKey = print.printKey?.trim() || null;
  const qty = sealedPrintQty(print);
  const finishHint = print.finish?.trim() || null;
  const printVariant = usePrintVariant(printKey, SHELF_TYPE);
  const effectsReady = useSyncExternalStore(
    subscribeEffectsReady,
    effectsRegistered,
    () => false,
  );

  useEffect(() => {
    if (printKey || finishHint) void ensureEffects();
  }, [printKey, finishHint]);

  const view = useMemo(
    () => variantRendering(finishHint, printVariant, null),
    [finishHint, printVariant, effectsReady],
  );

  const art = view.imageUrl || print.image?.trim() || null;
  const label =
    print.name?.trim() ||
    printKey ||
    print.ref ||
    print.slug ||
    (fr ? "sans ref" : "no ref");
  const stackDepth = Math.min(Math.max(qty, 1), MAX_STACK_LAYERS);
  const foil =
    Boolean(view.foilMaskUrl) && Boolean(view.shader || view.varnish) && art;

  return (
    <li className="min-w-0 list-none">
      <div
        className="relative mx-auto"
        style={{
          width: "4.5rem",
          height: "6.3rem",
          // Room for the offset stack so it doesn't clip neighbours.
          paddingRight: stackDepth > 1 ? `${(stackDepth - 1) * 3}px` : undefined,
          paddingBottom: stackDepth > 1 ? `${(stackDepth - 1) * 3}px` : undefined,
        }}
        title={[
          label,
          finishHint ? finishHint : null,
          qty > 1 ? `×${qty}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        {Array.from({ length: stackDepth }, (_, layer) => {
          // layer 0 = back of pile, last = front (foil).
          const fromBack = layer;
          const z = fromBack + 1;
          const isFront = layer === stackDepth - 1;
          return (
            <div
              key={layer}
              className={cn(
                "absolute left-0 top-0 overflow-hidden rounded-[0.35rem]",
                "border border-black/15 bg-muted shadow-sm dark:border-white/15",
                !isFront && "bg-muted/90",
              )}
              style={{
                width: "4.5rem",
                height: "6.3rem",
                zIndex: z,
                transform: `translate(${fromBack * 3}px, ${fromBack * 3}px)`,
              }}
            >
              {isFront && art ? (
                foil ? (
                  <FoilCardImage
                    effectPack={view.effectPackId}
                    printKey={printKey}
                    title={label}
                    imageUrl={art}
                    alt={label}
                    finish={view.finish}
                    varnishType={view.varnishType}
                    cssFinishShaderId={view.shader?.id ?? null}
                    cssVarnishShaderId={view.varnish?.id ?? null}
                    lenticularGrid={view.lenticularGrid}
                    lenticularCropProfile={view.lenticularCropProfile}
                    scanCrop={view.scanCrop}
                    maskUrl={view.foilMaskUrl}
                    varnishMaskUrl={view.varnishMaskUrl}
                    varnishColor={view.varnishColor}
                    secondVarnishMaskUrl={view.secondVarnishMaskUrl}
                    secondVarnishColor={view.secondVarnishColor}
                    fit="cover"
                    backend="css"
                    tilt={false}
                    className="absolute inset-0 h-full w-full"
                  />
                ) : (
                  <RemoteImage
                    src={art}
                    alt={label}
                    fill
                    sizes="72px"
                    className="object-cover"
                  />
                )
              ) : isFront ? (
                <div className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-tight text-muted-foreground">
                  {label}
                </div>
              ) : art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={art}
                  alt=""
                  className="h-full w-full object-cover opacity-90"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-full w-full bg-muted" />
              )}
            </div>
          );
        })}
        {qty > 1 ? (
          <span
            className={cn(
              "absolute z-20 rounded-full bg-zinc-950/85 px-1.5 py-0.5",
              "text-[10px] font-semibold tabular-nums text-white",
              "shadow-sm ring-1 ring-white/20",
            )}
            style={{
              right: stackDepth > 1 ? -2 : 2,
              bottom: stackDepth > 1 ? -2 : 2,
            }}
          >
            ×{qty}
          </span>
        ) : null}
        {finishHint && isHoloish(finishHint) ? (
          <span
            className={cn(
              "absolute left-0.5 top-0.5 z-20 rounded px-1 py-px",
              "bg-amber-500/90 text-[8px] font-bold uppercase tracking-wide text-zinc-950",
              "shadow-sm",
            )}
          >
            {finishHint}
          </span>
        ) : null}
      </div>
      <p className="mt-1 truncate text-center text-[10px] leading-tight text-muted-foreground">
        {art ? (printKey ?? label) : null}
      </p>
    </li>
  );
}

function isHoloish(finish: string): boolean {
  const n = finish.trim().toLowerCase();
  return n === "holo" || n === "foil" || n.includes("holo") || n.includes("foil");
}

/**
 * Grille de miniatures pour une liste de printKeys scellés — piles si qty &gt; 1,
 * foil CSS quand le finish curated / catalogue le demande.
 */
export function CatalogueSealedPrintGrid({
  title,
  prints,
  fr,
  muted,
}: {
  title: string;
  prints: SealedPrintLink[];
  fr: boolean;
  muted?: boolean;
}) {
  if (prints.length === 0) return null;
  const copies = sealedPrintCopyCount(prints);

  return (
    <section className="space-y-2">
      <h3
        className={
          muted
            ? "text-xs font-medium text-muted-foreground"
            : "text-xs font-medium text-foreground"
        }
      >
        {title}
        <span className="ml-1.5 tabular-nums text-muted-foreground">
          ({copies}
          {copies !== prints.length
            ? fr
              ? ` · ${prints.length} refs`
              : ` · ${prints.length} refs`
            : ""}
          )
        </span>
      </h3>
      <ul
        className={cn(
          "grid max-h-[min(50vh,28rem)] grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-x-2 gap-y-3",
          "overflow-y-auto rounded-md border border-border/60 bg-muted/15 p-2.5",
          muted && "opacity-80",
        )}
      >
        {prints.map((print, index) => (
          <SealedPrintThumb
            key={`${print.printKey ?? print.slug ?? print.name}-${print.finish ?? ""}-${index}`}
            print={print}
            fr={fr}
          />
        ))}
      </ul>
    </section>
  );
}

export function sealedProductQty(qty: number | null | undefined): number {
  return qty != null && qty > 0 ? Math.floor(qty) : 1;
}

/**
 * Miniatures des SKU scellés inclus (boosters / starters d'un pack multi-produits).
 */
export function CatalogueSealedContainedGrid({
  title,
  products,
  fr,
  muted,
}: {
  title: string;
  products: CatalogueSealedContainedProduct[];
  fr: boolean;
  muted?: boolean;
}) {
  if (products.length === 0) return null;
  const copies = products.reduce(
    (n, row) => n + sealedProductQty(row.qty),
    0,
  );

  return (
    <section className="space-y-2">
      <h3
        className={
          muted
            ? "text-xs font-medium text-muted-foreground"
            : "text-xs font-medium text-foreground"
        }
      >
        {title}
        <span className="ml-1.5 tabular-nums text-muted-foreground">
          ({copies}
          {copies !== products.length
            ? fr
              ? ` · ${products.length} SKU`
              : ` · ${products.length} SKUs`
            : ""}
          )
        </span>
      </h3>
      <ul
        className={cn(
          "grid max-h-[min(40vh,22rem)] grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-x-3 gap-y-3",
          "overflow-y-auto rounded-md border border-border/60 bg-muted/15 p-2.5",
          muted && "opacity-80",
        )}
      >
        {products.map((product) => {
          const qty = sealedProductQty(product.qty);
          const stackDepth = Math.min(Math.max(qty, 1), MAX_STACK_LAYERS);
          const label = product.name?.trim() || product.slug;
          return (
            <li
              key={product.productKey || product.slug}
              className="min-w-0 list-none"
            >
              <div
                className="relative mx-auto"
                style={{
                  width: "5rem",
                  height: "7rem",
                  paddingRight:
                    stackDepth > 1 ? `${(stackDepth - 1) * 3}px` : undefined,
                  paddingBottom:
                    stackDepth > 1 ? `${(stackDepth - 1) * 3}px` : undefined,
                }}
                title={[label, product.slug, qty > 1 ? `×${qty}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {Array.from({ length: stackDepth }, (_, layer) => {
                  const isFront = layer === stackDepth - 1;
                  return (
                    <div
                      key={layer}
                      className={cn(
                        "absolute left-0 top-0 overflow-hidden rounded-md",
                        "border border-black/15 bg-muted shadow-sm dark:border-white/15",
                      )}
                      style={{
                        width: "5rem",
                        height: "7rem",
                        zIndex: layer + 1,
                        transform: `translate(${layer * 3}px, ${layer * 3}px)`,
                      }}
                    >
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt={isFront ? label : ""}
                          className={cn(
                            "h-full w-full object-contain p-0.5",
                            !isFront && "opacity-90",
                          )}
                          referrerPolicy="no-referrer"
                        />
                      ) : isFront ? (
                        <div className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-tight text-muted-foreground">
                          {label}
                        </div>
                      ) : (
                        <div className="h-full w-full bg-muted" />
                      )}
                    </div>
                  );
                })}
                {qty > 1 ? (
                  <span
                    className={cn(
                      "absolute z-20 rounded-full bg-zinc-950/85 px-1.5 py-0.5",
                      "text-[10px] font-semibold tabular-nums text-white",
                      "shadow-sm ring-1 ring-white/20",
                    )}
                    style={{
                      right: stackDepth > 1 ? -2 : 2,
                      bottom: stackDepth > 1 ? -2 : 2,
                    }}
                  >
                    ×{qty}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-center text-[10px] leading-tight text-foreground/90">
                {label}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
