"use client";

import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CatalogueSealedContainedGrid,
  CatalogueSealedPrintGrid,
} from "@/components/admin/CatalogueSealedPrintGrid";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import type {
  CatalogueSealedDetail,
  CatalogueSealedRow,
} from "@/lib/admin/catalogueProducts";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import { sealedKindLabel } from "@/providers/shared/sealedProducts/kinds";

async function fetchDetail(
  pack: CataloguePackId,
  productKey: string,
): Promise<CatalogueSealedDetail> {
  const params = new URLSearchParams({ pack });
  const res = await fetch(
    `/api/admin/catalogue-products/${encodeURIComponent(productKey)}?${params}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as CatalogueSealedDetail;
}

/**
 * Checklist dialog for one sealed SKU — known list, preview, or honest gap.
 */
export function CatalogueSealedDetailDialog({
  packId,
  product,
  locale,
  open,
  onOpenChange,
}: {
  packId: CataloguePackId;
  product: CatalogueSealedRow | null;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fr = locale === "fr";
  const productKey = product?.productKey ?? null;

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["catalogueProductDetail", "v4", packId, productKey],
    queryFn: () => fetchDetail(packId, productKey!),
    enabled: open && Boolean(productKey),
  });

  const detail = data ?? null;
  const langLabel = detail?.lang?.trim()
    ? printLanguageLabel(detail.lang)
    : product?.lang?.trim()
      ? printLanguageLabel(product.lang)
      : null;

  const title =
    detail?.name ?? product?.name ?? detail?.slug ?? product?.slug ?? "…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-snug">
            {langLabel?.flag ? `${langLabel.flag} ` : ""}
            {title}
          </DialogTitle>
        </DialogHeader>

        {isPending && !detail ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {fr ? "Chargement…" : "Loading…"}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : detail ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="flex gap-3">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-md bg-muted/40">
                {detail.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={detail.image}
                    alt=""
                    className="h-full w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                    {fr ? "sans image" : "no art"}
                  </div>
                )}
                {detail.setLogo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={detail.setLogo}
                    alt=""
                    className="pointer-events-none absolute left-1 top-1 max-h-5 max-w-[50%] object-contain drop-shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground/80">
                    {sealedKindLabel(detail.kind, fr ? "fr" : "en")}
                  </span>
                  {detail.setCode ? (
                    <span className="ml-1.5 tabular-nums">{detail.setCode}</span>
                  ) : null}
                </p>
                <p className="truncate font-mono text-[11px]">{detail.slug}</p>
                {detail.priceCents != null && detail.priceCents > 0 ? (
                  <p className="font-medium tabular-nums text-foreground/90">
                    {new Intl.NumberFormat(fr ? "fr-FR" : "en-GB", {
                      style: "currency",
                      currency: "EUR",
                    }).format(detail.priceCents / 100)}
                  </p>
                ) : (
                  <p className="text-amber-700 dark:text-amber-400">
                    {fr ? "Sans prix dans l’index" : "No price in the index"}
                  </p>
                )}
                {detail.contentsKnown ? (
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">
                    {fr
                      ? "Contenu inventorié — checklist fiable"
                      : "Contents known — trusted checklist"}
                  </p>
                ) : detail.structureAttested ? (
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">
                    {detail.behavior === "known_bundle" ||
                    (detail.behavior === "mixed_bundle" &&
                      detail.packsContained == null)
                      ? fr
                        ? "Structure attestée — taille fixe (liste carte-à-carte partielle ou absente)"
                        : "Structure attested — fixed size (card list partial or missing)"
                      : fr
                        ? "Structure attestée — loterie / sachets (pas de liste carte-à-carte)"
                        : "Structure attested — lottery / packs (no card-by-card list)"}
                  </p>
                ) : (
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    {fr
                      ? "Contenu inconnu — à renseigner"
                      : "Unknown contents — needs research"}
                  </p>
                )}
                <p className="tabular-nums">
                  {[
                    detail.packsContained != null
                      ? fr
                        ? `${detail.packsContained} sachet(s)`
                        : `${detail.packsContained} pack(s)`
                      : null,
                    detail.cardsPerPack != null
                      ? fr
                        ? `${detail.cardsPerPack} cartes/sachet`
                        : `${detail.cardsPerPack} cards/pack`
                      : null,
                    detail.setCardCount != null
                      ? fr
                        ? `set ${detail.setCardCount}`
                        : `set ${detail.setCardCount}`
                      : null,
                    detail.declaredCardCount != null
                      ? fr
                        ? `annoncé ${detail.declaredCardCount}`
                        : `declared ${detail.declaredCardCount}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || (fr ? "structure non renseignée" : "no structure yet")}
                </p>
                {detail.packsBySet && Object.keys(detail.packsBySet).length > 0 ? (
                  <p className="tabular-nums">
                    {fr ? "par set : " : "by set: "}
                    {Object.entries(detail.packsBySet)
                      .map(([set, n]) => `${set}×${n}`)
                      .join(", ")}
                  </p>
                ) : null}
                <p>
                  {fr ? "Loterie : " : "Pool: "}
                  <span className="tabular-nums">
                    {detail.randomPoolScope}
                    {detail.randomPoolScope === "set" && detail.setCode
                      ? ` (${detail.setCode})`
                      : ""}
                  </span>
                </p>
                {detail.contentsKnown &&
                detail.randomPoolScope === "set" &&
                detail.randomPoolPrints.length === 0 ? (
                  <p className="text-[11px] text-amber-800 dark:text-amber-200">
                    {fr
                      ? "Pool set connu, mais le catalogue n’a pas encore de tirages pour ce set."
                      : "Set pool known, but the catalogue has no prints for this set yet."}
                  </p>
                ) : null}
              </div>
            </div>

            {detail.imageBack ? (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  {fr ? "Dos emballage" : "Pack back"}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.imageBack}
                  alt=""
                  className="max-h-32 rounded-md object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}

            {!detail.contentsKnown &&
            !detail.structureAttested &&
            detail.guaranteedPrints.length === 0 &&
            detail.randomPoolPrints.length === 0 ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                {fr
                  ? detail.containsPrintsIsPreview
                    ? "L’aperçu boutique (tuiles) n’est pas une checklist. À inventarier dans products-contents / curated."
                    : "Pas de liste de cartes pour ce SKU. À inventarier pour servir le conseil d’achat."
                  : detail.containsPrintsIsPreview
                    ? "Shop preview tiles are not a checklist. Inventory in products-contents / curated."
                    : "No card list for this SKU. Inventory it to power purchase advice."}
              </p>
            ) : null}

            {!detail.contentsKnown &&
            detail.structureAttested &&
            detail.containsPrintsIsPreview &&
            detail.prints.length > 0 ? (
              <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {fr
                  ? "Tuiles boutique = aperçu marketing (ignorées pour la checklist). Le pool / les sachets ci-dessous font foi."
                  : "Shop tiles are marketing preview (ignored for the checklist). Pool / packs below are authoritative."}
              </p>
            ) : null}

            <CatalogueSealedContainedGrid
              title={fr ? "Produits inclus" : "Contained products"}
              products={detail.guaranteedProducts}
              fr={fr}
            />
            <CatalogueSealedPrintGrid
              title={
                detail.guaranteedProducts.length > 0
                  ? fr
                    ? "Cartes des decks (décomposées)"
                    : "Deck cards (expanded)"
                  : fr
                    ? "Garanties (toujours dedans)"
                    : "Guaranteed (always in)"
              }
              prints={detail.guaranteedPrints}
              fr={fr}
              muted={detail.guaranteedProducts.length > 0}
            />
            <CatalogueSealedPrintGrid
              title={
                detail.randomPoolScope === "set"
                  ? fr
                    ? `Pool set${detail.setCode ? ` ${detail.setCode}` : ""} (loterie)`
                    : `Set pool${detail.setCode ? ` ${detail.setCode}` : ""} (random)`
                  : fr
                    ? "Pool listé (loterie)"
                    : "Listed pool (random)"
              }
              prints={detail.randomPoolPrints}
              fr={fr}
            />
            {detail.contentsKnown &&
            !detail.containsPrintsIsPreview &&
            detail.prints.length > 0 &&
            detail.guaranteedPrints.length === 0 &&
            detail.randomPoolPrints.length === 0 ? (
              <CatalogueSealedPrintGrid
                title={fr ? "Liste complète" : "Full list"}
                prints={detail.prints}
                fr={fr}
              />
            ) : detail.containsPrintsIsPreview && detail.prints.length > 0 ? (
              <CatalogueSealedPrintGrid
                title={
                  fr
                    ? "Aperçu boutique (non fiable)"
                    : "Shop preview (untrusted)"
                }
                prints={detail.prints}
                fr={fr}
                muted
              />
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
