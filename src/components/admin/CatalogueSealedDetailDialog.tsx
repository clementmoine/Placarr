"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CatalogueSealedContainedGrid,
  CatalogueSealedPrintGrid,
} from "@/components/admin/CatalogueSealedPrintGrid";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import type {
  CatalogueSealedContainedProduct,
  CatalogueSealedDetail,
  CatalogueSealedRow,
} from "@/lib/admin/catalogueProducts";
import {
  formatPackCompositionPossibleChaseLabel,
  formatPackCompositionProvenanceLabel,
  formatPackCompositionSlotLabel,
  formatRandomPoolScopeLabel,
  formatSealedCardsPerOpenUnitLabel,
  formatSealedKindLine,
  formatSealedPackCountLabel,
  formatSealedRandomContentsLabel,
  formatSealedRandomSectionTitle,
  formatSealedStructureUnitLabel,
  sealedOpenUnitNoun,
} from "@/lib/admin/sealedContentsLabels";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import { sealedSkuNeedsPackComposition } from "@/providers/shared/sealedProducts/packCompositionTypes";
import { sealedGuaranteedPrintsSectionTitle } from "@/providers/shared/sealedProducts/guaranteedPrintsTitle";
import { sealedKindLabel } from "@/providers/shared/sealedProducts/kinds";
import { splitSealedLotteryChasePrints } from "@/providers/shared/sealedProducts/lotteryChaseSplit";

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
 * Nested SKUs open in the same dialog (stack + back).
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
  const rootKey = product?.productKey ?? null;
  const [stack, setStack] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !rootKey) {
      setStack([]);
      return;
    }
    setStack([rootKey]);
  }, [open, rootKey]);

  const productKey = stack[stack.length - 1] ?? null;

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["catalogueProductDetail", "v5", packId, productKey],
    queryFn: () => fetchDetail(packId, productKey!),
    enabled: open && Boolean(productKey),
  });

  const detail = data ?? null;
  const langLabel = detail?.lang?.trim()
    ? printLanguageLabel(detail.lang)
    : product?.lang?.trim() && stack.length <= 1
      ? printLanguageLabel(product.lang)
      : null;

  const title =
    detail?.name ?? product?.name ?? detail?.slug ?? product?.slug ?? "…";

  const pushChild = (child: CatalogueSealedContainedProduct) => {
    if (!child.resolvable || !child.productKey) return;
    setStack((prev) => [...prev, child.productKey]);
  };

  const popStack = () => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setStack([]);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          {stack.length > 1 ? (
            <div className="mb-1 flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={popStack}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {fr ? "Retour" : "Back"}
              </Button>
              <span className="truncate text-[11px] text-muted-foreground">
                {fr
                  ? `${stack.length} niveaux`
                  : `${stack.length} levels`}
              </span>
            </div>
          ) : null}
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
                <p className="font-medium text-foreground/80">
                  {formatSealedKindLine({
                    kindLabel: sealedKindLabel(detail.kind, fr ? "fr" : "en"),
                    setCode: detail.setCode,
                    slug: detail.slug,
                    fr,
                  })}
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
                        ? `Structure attestée — loterie / ${sealedOpenUnitNoun({ slug: detail.slug, fr, count: 2 })} (pas de liste carte-à-carte)`
                        : `Structure attested — lottery / ${sealedOpenUnitNoun({ slug: detail.slug, fr, count: 2 })} (no card-by-card list)`}
                  </p>
                ) : (
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    {fr
                      ? "Contenu inconnu — à renseigner"
                      : "Unknown contents — needs research"}
                  </p>
                )}
                <p className="tabular-nums">
                  {(() => {
                    const packs = detail.packsContained;
                    const perPack = detail.cardsPerPack;
                    const declared = detail.declaredCardCount;
                    const expectedFromPacks =
                      packs != null && perPack != null
                        ? packs * perPack
                        : perPack;
                    const showDeclared =
                      declared != null &&
                      declared !== expectedFromPacks &&
                      declared !== perPack;
                    return [
                      packs != null
                        ? formatSealedPackCountLabel(packs, fr, detail.slug)
                        : null,
                      perPack != null
                        ? formatSealedCardsPerOpenUnitLabel(
                            perPack,
                            fr,
                            detail.slug,
                          )
                        : null,
                      detail.setCardCount != null
                        ? `set ${detail.setCardCount}`
                        : null,
                      showDeclared
                        ? fr
                          ? `annoncé ${declared}`
                          : `declared ${declared}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                  })() ||
                    (fr ? "structure non renseignée" : "no structure yet")}
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
                  {fr ? "Tirage : " : "Random draw: "}
                  {formatRandomPoolScopeLabel(
                    detail.randomPoolScope,
                    detail.setCode,
                    fr,
                  )}
                </p>
                {detail.packComposition === "none" ? (
                  <p className="text-[11px] text-muted-foreground">
                    {fr
                      ? `Composition ${sealedOpenUnitNoun({ slug: detail.slug, fr, count: 1 })} : aucune (pas de loterie)`
                      : `Pack composition: none (no lottery)`}
                  </p>
                ) : detail.packComposition != null &&
                  typeof detail.packComposition === "object" ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-foreground">
                      {fr
                        ? `Composition ${sealedOpenUnitNoun({ slug: detail.slug, fr, count: 1 })}`
                        : "Pack composition"}
                      {(() => {
                        const prov = formatPackCompositionProvenanceLabel(
                          detail.packComposition.provenance,
                          fr,
                        );
                        return prov ? ` · ${prov}` : "";
                      })()}
                    </p>
                    <ul className="list-inside list-disc text-[11px] text-muted-foreground">
                      {detail.packComposition.slots.map((slot) => (
                        <li key={slot.id}>
                          {formatPackCompositionSlotLabel(slot, fr)}
                        </li>
                      ))}
                      {(() => {
                        const chase = formatPackCompositionPossibleChaseLabel(
                          detail.packComposition.possibleChase ?? [],
                          fr,
                        );
                        return chase ? <li>{chase}</li> : null;
                      })()}
                    </ul>
                  </div>
                ) : sealedSkuNeedsPackComposition(detail) &&
                  detail.behavior !== "pack_container" ? (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {fr
                      ? `Composition ${sealedOpenUnitNoun({ slug: detail.slug, fr, count: 1 })} non renseignée`
                      : "Pack composition missing"}
                  </p>
                ) : null}
                {detail.contentsKnown &&
                detail.randomPoolScope === "set" &&
                detail.setCode &&
                detail.randomPoolPrints.length === 0 ? (
                  <p className="text-[11px] text-amber-800 dark:text-amber-200">
                    {fr
                      ? "Tirage au hasard du set connu, mais le catalogue n’a pas encore les cartes de ce set."
                      : "Set random draw is known, but the catalogue has no prints for this set yet."}
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

            {detail.poster ? (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  {fr ? "Poster / affiche" : "Poster"}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.poster}
                  alt=""
                  className="max-h-48 rounded-md object-contain"
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
                  ? `Tuiles boutique = aperçu marketing (ignorées pour la checklist). Le pool / les ${sealedOpenUnitNoun({ slug: detail.slug, fr, count: 2 })} ci-dessous font foi.`
                  : "Shop tiles are marketing preview (ignored for the checklist). Pool / packs below are authoritative."}
              </p>
            ) : null}

            <CatalogueSealedContainedGrid
              title={fr ? "SKUs inclus" : "Contained SKUs"}
              products={detail.guaranteedProducts}
              fr={fr}
              onSelectProduct={pushChild}
            />
            {detail.contentsUnits?.length ? (
              <section className="space-y-1.5">
                <h3 className="text-xs font-medium text-foreground">
                  {fr ? "Structure (sans liste carte-à-carte)" : "Structure (no card list yet)"}
                </h3>
                <ul className="space-y-1 rounded-md border border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
                  {detail.contentsUnits.map((unit, index) => (
                    <li
                      key={`${unit.label}-${unit.count}-${unit.cardsEach}-${index}`}
                    >
                      {formatSealedStructureUnitLabel(unit, fr)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {detail.contentsRandom?.length ? (
              <section className="space-y-1.5">
                <h3 className="text-xs font-medium text-foreground">
                  {formatSealedRandomSectionTitle(fr, detail.slug)}
                </h3>
                <ul className="space-y-1 rounded-md border border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
                  {detail.contentsRandom.map((node, index) => (
                    <li
                      key={`${node.setId ?? "pack"}-${node.packs}-${node.cardsPerPack}-${index}`}
                    >
                      {formatSealedRandomContentsLabel(
                        { ...node, slug: detail.slug },
                        fr,
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <CatalogueSealedPrintGrid
              title={sealedGuaranteedPrintsSectionTitle({
                fr,
                kind: detail.kind,
                hasGuaranteedProducts: detail.guaranteedProducts.length > 0,
              })}
              prints={detail.guaranteedPrints}
              fr={fr}
              muted={
                detail.guaranteedProducts.length > 0 &&
                (detail.kind === "deck" || detail.kind === "deck_bundle")
              }
            />
            {(() => {
              const { base, chase } = splitSealedLotteryChasePrints(
                detail.randomPoolPrints,
              );
              const baseTitle =
                detail.randomPoolScope === "set"
                  ? fr
                    ? `Cartes possibles du set${detail.setCode ? ` ${detail.setCode}` : ""}`
                    : `Possible cards from set${detail.setCode ? ` ${detail.setCode}` : ""}`
                  : fr
                    ? "Cartes possibles (liste connue)"
                    : "Possible cards (listed pool)";
              return (
                <>
                  <CatalogueSealedPrintGrid
                    title={baseTitle}
                    prints={chase.length ? base : detail.randomPoolPrints}
                    fr={fr}
                  />
                  {chase.length ? (
                    <CatalogueSealedPrintGrid
                      title={
                        fr
                          ? "Fixeez possibles (aléatoire, non garanti)"
                          : "Possible Fixeez (random, not guaranteed)"
                      }
                      prints={chase}
                      fr={fr}
                    />
                  ) : null}
                </>
              );
            })()}
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
