"use client";

import { useMemo, useState } from "react";
import type {
  CompletionPlan,
  PlanItem,
  SinglesLine,
} from "@/core/collect/buyPlan/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/shared/utils";
import styles from "./checklist.module.css";
import {
  ChecklistHoverThumb,
  type ChecklistArtOrientation,
} from "./ChecklistHoverThumb";

type ChecklistPrint = {
  printKey: string;
  reference: string;
  title: string;
  thumbnailUrl?: string | null;
  owned?: boolean;
  finish?: string | null;
} & ChecklistArtOrientation;

export type SetAdvice = {
  setId: string;
  singles: {
    priced: number;
    unpriced: number;
    totalCents: number;
    cheapCount: number;
    cheapCents: number;
    expensiveCount: number;
    expensiveCents: number;
    medianCents: number | null;
  };
  prices: Record<string, number>;
  sealedSources: Record<
    string,
    { slug: string; name: string; kind: string; imageUrl?: string | null }[]
  >;
  /** `printKey` → « 1 sachet sur N » (taux de tirage observé). */
  packsPerHit: Record<string, number>;
  plan: CompletionPlan;
};

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const GRID_PAGE = 24;
const STACK_MAX = 3;
const YIELD_PAGE = 6;

function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Cartes de synthèse : à l'euro près, les centimes sont dans la modale. */
function eurosRounded(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

function integer(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(value));
}

/** Nombre d'unités scellées à acheter (boîtes, decks, boosters…), pas l'équivalent sachets. */
function sealedUnitCount(items: readonly PlanItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function decimal(value: number, digits = 1): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
  }).format(value);
}

function ProductThumb({ src }: { src: string | null | undefined }) {
  return src ? (
    <ChecklistHoverThumb
      src={src}
      className={styles.productThumb}
      variant="product"
    />
  ) : (
    <span className={styles.productThumbPlaceholder} aria-hidden />
  );
}

/* ── Synthèse ───────────────────────────────────────────────────────────── */

/** Vignettes du panier (×n), nom en infobulle, « +k » au-delà. */
function CartStack({ items, t }: { items: readonly PlanItem[]; t: Translate }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, STACK_MAX);
  const more = items.length - shown.length;
  return (
    <ul
      className={styles.adviceCartRow}
      aria-label={t("items.checklistSealed")}
    >
      {shown.map((item) => (
        <li
          key={item.slug}
          className={styles.adviceQtyThumb}
          title={`×${item.quantity} ${item.name} · ${euros(
            item.quantity * item.unitPriceCents,
          )}`}
        >
          <ProductThumb src={item.imageUrl} />
          <span className={styles.adviceQtyBadge}>
            {t("items.checklistAdviceQtyBadge", { count: item.quantity })}
          </span>
        </li>
      ))}
      {more > 0 && (
        <li className={styles.adviceCartMore}>
          {t("items.checklistSinglesCartMore", { count: more })}
        </li>
      )}
    </ul>
  );
}

type Track = "singles" | "mixed" | "sealed";

/** Une cellule de la barre segmentée (Singles / Mixte / Scellé). */
function TrackCell({
  label,
  price,
  detail,
  recommended,
  badge,
  muted,
  selected,
  onToggle,
}: {
  label: string;
  price: string;
  detail?: string | null;
  recommended: boolean;
  badge?: string;
  muted?: boolean;
  selected: boolean;
  onToggle?: () => void;
}) {
  const clickable = Boolean(onToggle);
  return (
    <button
      type="button"
      disabled={!clickable}
      aria-haspopup={clickable ? "dialog" : undefined}
      aria-expanded={clickable ? selected : undefined}
      aria-current={recommended ? "true" : undefined}
      onClick={onToggle}
      className={cn(
        styles.adviceCell,
        recommended && styles.adviceCellRecommended,
        muted && styles.adviceCellMuted,
        selected && styles.adviceCellSelected,
      )}
    >
      <span className={styles.adviceCellHead}>
        <span className={styles.adviceCellLabel}>{label}</span>
        {recommended && badge ? (
          <span className={styles.adviceTrackBadge}>{badge}</span>
        ) : null}
      </span>
      <span className={styles.adviceCellPrice}>{price}</span>
      {detail ? (
        <span className={styles.adviceCellDetail}>{detail}</span>
      ) : null}
    </button>
  );
}

/* ── Détail ─────────────────────────────────────────────────────────────── */

function CartLines({
  items,
  t,
  /** € / carte neuve unitaire, si connu — pour ne pas re-lister le produit plus bas. */
  perCardBySlug,
}: {
  items: readonly PlanItem[];
  t: Translate;
  perCardBySlug?: ReadonlyMap<string, number | null>;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={styles.sealedCart}>
      {items.map((item) => {
        const linePrice = euros(item.quantity * item.unitPriceCents);
        const perCard = perCardBySlug?.get(item.slug);
        const hasCards = item.expectedNewCards >= 0.05;
        const hasPerCard = perCard != null && perCard > 0;
        return (
          <li key={item.slug} className={styles.sealedCartItem}>
            <ProductThumb src={item.imageUrl} />
            <span className={styles.sealedCartBody}>
              <span className={styles.sealedCartName}>
                {t("items.checklistAdviceQtyBadge", { count: item.quantity })}{" "}
                {item.name}
              </span>
              <span className={styles.sealedCartPrice}>
                {hasCards && hasPerCard
                  ? t("items.checklistAdviceCartLinePerCard", {
                      price: linePrice,
                      newCards: decimal(item.expectedNewCards),
                      perCard: euros(perCard),
                    })
                  : hasCards
                    ? t("items.checklistAdviceCartLine", {
                        price: linePrice,
                        newCards: decimal(item.expectedNewCards),
                      })
                    : linePrice}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type SinglesRow = {
  rowKey: string;
  title: string;
  reference: string;
  thumbnailUrl: string | null;
  priceCents: number;
  priceImputed: boolean;
  probabilityNeeded: number;
} & ChecklistArtOrientation;

/** Grille de cartes à l'unité : la **cote** sous la vignette, paginée. */
function SinglesGrid({
  rows,
  label,
  t,
}: {
  rows: readonly SinglesRow[];
  label: string;
  t: Translate;
}) {
  const [limit, setLimit] = useState(GRID_PAGE);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, limit);
  const rest = rows.length - shown.length;
  return (
    <>
      <ul className={styles.singlesCart} aria-label={label}>
        {shown.map((row) => (
          <li
            key={row.rowKey}
            className={styles.singlesCartItem}
            title={`${row.reference} ${row.title} — ${euros(row.priceCents)}${
              row.priceImputed ? " (est.)" : ""
            }`}
          >
            {row.thumbnailUrl ? (
              <ChecklistHoverThumb
                src={row.thumbnailUrl}
                className={styles.singlesCartThumb}
                landscapeFace={row.landscapeFace}
                faceQuarterTurns={row.faceQuarterTurns}
                landscapePrint={row.landscapePrint}
              />
            ) : (
              <span
                className={styles.singlesCartThumbPlaceholder}
                aria-hidden
              />
            )}
            <span
              className={cn(
                styles.singlesCartPrice,
                row.priceImputed && styles.singlesCartPriceImputed,
              )}
            >
              {euros(row.priceCents)}
            </span>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          className={styles.adviceMoreButton}
          onClick={() => setLimit((value) => value + GRID_PAGE * 2)}
        >
          {t("items.checklistAdviceShowMore", { count: rest })}
        </button>
      )}
    </>
  );
}

/* ── Panneau ────────────────────────────────────────────────────────────── */

/**
 * Conseil d'achat — une voie mise en avant, les deux autres en alternatives
 * discrètes. Clic → modale de détail. La recommandation vient du cœur.
 */
export function Advice({
  advice,
  cards,
  hideZeroSealedExpectation,
  t,
}: {
  advice: SetAdvice;
  cards: readonly ChecklistPrint[];
  hideZeroSealedExpectation: boolean;
  t: Translate;
}) {
  const [selected, setSelected] = useState<Track | null>(null);
  const [yieldLimit, setYieldLimit] = useState(YIELD_PAGE);
  const { plan } = advice;
  const { singles, mixed, sealed, recommendation } = plan;
  const recommended = recommendation.track;
  const badge = t(
    recommendation.confidence === "high"
      ? "items.checklistAdviceTrackRecommended"
      : "items.checklistAdviceTrackIndicative",
  );
  const toggle = (track: Track) =>
    setSelected((current) => (current === track ? null : track));

  const byRow = useMemo(() => {
    const map = new Map<string, ChecklistPrint>();
    for (const card of cards) {
      const finish = card.finish?.trim();
      map.set(finish ? `${card.printKey}|${finish}` : card.printKey, card);
    }
    for (const card of cards) {
      if (!map.has(card.printKey)) map.set(card.printKey, card);
    }
    return map;
  }, [cards]);

  const toRows = (lines: readonly SinglesLine[]): SinglesRow[] =>
    lines.map((line) => {
      const card = byRow.get(line.requirementId);
      return {
        rowKey: line.requirementId,
        title: card?.title ?? line.requirementId,
        reference: card?.reference ?? "",
        thumbnailUrl: card?.thumbnailUrl ?? null,
        priceCents: line.priceCents,
        priceImputed: line.priceImputed,
        probabilityNeeded: line.probabilityNeeded,
        ...(card?.landscapeFace ? { landscapeFace: true as const } : {}),
        ...(card?.faceQuarterTurns
          ? { faceQuarterTurns: card.faceQuarterTurns }
          : {}),
        ...(card?.landscapePrint ? { landscapePrint: true as const } : {}),
      };
    });

  const singlesRows = toRows(singles.lines);
  /*
    Mixte : seulement les cartes qui risquent de rester à acheter — les N
    plus probables, N = E[reste] arrondi au-dessus. Le reste sortira
    probablement des sachets : inutile de le lister.
  */
  const mixedRemaining = Math.max(1, Math.ceil(mixed.expectedRemainingCards));
  const mixedRows = toRows(
    mixed.singles
      .slice()
      .sort(
        (a, b) =>
          b.probabilityNeeded - a.probabilityNeeded ||
          b.priceCents - a.priceCents,
      )
      .slice(0, mixedRemaining),
  );
  const sealedUsable = !sealed.indeterminate && sealed.sealedCents > 0;
  const hasMixedCart = mixed.items.length > 0;

  const metrics = (
    hideZeroSealedExpectation
      ? plan.skuMetrics.filter((m) => m.indeterminate || m.expectedNewCards > 0)
      : plan.skuMetrics
  )
    .slice()
    .sort((a, b) => {
      if (a.indeterminate !== b.indeterminate) return a.indeterminate ? 1 : -1;
      const ca = a.centsPerNewCard ?? Number.POSITIVE_INFINITY;
      const cb = b.centsPerNewCard ?? Number.POSITIVE_INFINITY;
      return ca - cb;
    });
  const perCardBySlug = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const m of plan.skuMetrics) map.set(m.slug, m.centsPerNewCard);
    return map;
  }, [plan.skuMetrics]);
  /* Produits déjà dans le panier : leur rendement est sur la ligne du panier. */
  const cartSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const item of sealed.items) set.add(item.slug);
    for (const item of mixed.items) set.add(item.slug);
    return set;
  }, [sealed.items, mixed.items]);
  const yieldMetrics = metrics.filter((m) => !cartSlugs.has(m.slug));

  const flagNotes: string[] = [];
  if (plan.flags.includes("unknownRates")) {
    flagNotes.push(t("items.checklistAdviceUnknownRates"));
  }
  if (plan.flags.includes("lowConfidenceRates")) {
    flagNotes.push(t("items.checklistAdviceLowConfidenceRates"));
  }
  if (plan.flags.includes("independenceAssumed")) {
    flagNotes.push(t("items.checklistAdviceIndependenceAssumed"));
  }
  if (singles.imputedCount > 0) {
    flagNotes.push(
      t("items.checklistAdviceImputedNote", { count: singles.imputedCount }),
    );
  }
  if (singles.unpricedCount > 0) {
    flagNotes.push(
      t("items.checklistAdviceUnpricedNote", { count: singles.unpricedCount }),
    );
  }

  const canOpenSingles = singles.lines.length > 0;
  const canOpenMixed = hasMixedCart;
  const canOpenSealed = sealedUsable || metrics.length > 0;

  const trackMeta: Record<
    Track,
    {
      label: string;
      price: string;
      /** Ligne sous le prix : résumé, hint, ou delta court. */
      detail: string | null;
      canOpen: boolean;
      muted: boolean;
      cart: readonly PlanItem[];
    }
  > = {
    singles: {
      label: t("items.checklistAdviceTrackSingles"),
      price: eurosRounded(singles.totalCents),
      detail:
        singles.unpricedCount > 0
          ? t("items.checklistAdviceSummarySinglesUnpriced", {
              count: singles.pricedCount,
              unpriced: singles.unpricedCount,
            })
          : t("items.checklistAdviceSummarySingles", {
              count: singles.pricedCount,
            }),
      canOpen: canOpenSingles,
      muted: false,
      cart: [],
    },
    mixed: {
      label: t("items.checklistAdviceTrackMixed"),
      price: eurosRounded(mixed.totalCents),
      /*
        Pas de « +95 € » sous le total : ça se lit comme une addition.
        On dit ce que le prix achète (scellé puis unitaires).
      */
      detail: hasMixedCart
        ? t("items.checklistAdviceSummaryMixed", {
            sealed: sealedUnitCount(mixed.items),
            count: Math.ceil(mixed.expectedRemainingCards),
          })
        : t("items.checklistAdviceAltMixedSame"),
      canOpen: canOpenMixed,
      muted: !hasMixedCart,
      cart: mixed.items,
    },
    sealed: {
      label: t("items.checklistAdviceTrackSealed"),
      price: sealedUsable ? eurosRounded(sealed.sealedCents) : "—",
      detail: !sealedUsable
        ? sealed.unreachableHoles > 0
          ? t("items.checklistAdviceAltSealedUnreachable", {
              count: sealed.unreachableHoles,
            })
          : t("items.checklistAdviceAltSealedUnknown")
        : sealed.capped
          ? t("items.checklistAdviceSummarySealedCapped", {
              count: integer(sealedUnitCount(sealed.items)),
            })
          : sealed.unreachableHoles > 0
            ? t("items.checklistAdviceSummarySealedPartial", {
                count: integer(sealedUnitCount(sealed.items)),
                unreachable: sealed.unreachableHoles,
              })
            : t("items.checklistAdviceSummarySealed", {
                count: integer(sealedUnitCount(sealed.items)),
              }),
      canOpen: canOpenSealed,
      muted: !sealedUsable,
      cart: sealed.items,
    },
  };

  const heroCart = trackMeta[recommended].cart;

  return (
    <div className={styles.advice}>
      <div className={styles.adviceSummary}>
        <div className={styles.adviceStrip} role="group">
          {(["singles", "mixed", "sealed"] as const).map((track) => {
            const meta = trackMeta[track];
            return (
              <TrackCell
                key={track}
                label={meta.label}
                price={meta.price}
                detail={meta.detail}
                recommended={track === recommended}
                badge={track === recommended ? badge : undefined}
                muted={meta.muted}
                selected={selected === track}
                onToggle={meta.canOpen ? () => toggle(track) : undefined}
              />
            );
          })}
        </div>
        {heroCart.length > 0 && <CartStack items={heroCart} t={t} />}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">
              <span className={styles.adviceDialogLabel}>
                {selected === "singles"
                  ? t("items.checklistAdviceTrackSingles")
                  : selected === "mixed"
                    ? t("items.checklistAdviceTrackMixed")
                    : t("items.checklistAdviceTrackSealed")}
              </span>
              <span className={styles.adviceDialogPrice}>
                {selected === "singles"
                  ? euros(singles.totalCents)
                  : selected === "mixed"
                    ? euros(mixed.totalCents)
                    : sealedUsable
                      ? euros(sealed.sealedCents)
                      : "—"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {selected === "singles"
                ? t("items.checklistAdviceSummarySingles", {
                    count: singles.lines.length,
                  })
                : selected === "mixed"
                  ? t("items.checklistAdviceSealedExpectation", {
                      cards: decimal(mixed.expectedCardsFromSealed),
                      total: plan.copiesNeeded,
                      percent: Math.round(mixed.expectedCompletion * 100),
                    })
                  : sealedUsable
                    ? t("items.checklistAdviceSealedCompleteNote", {
                        count: integer(sealedUnitCount(sealed.items)),
                        remaining: decimal(
                          sealed.target.maxExpectedRemainingCards,
                        ),
                      })
                    : t("items.checklistAdviceTrackSealedUnknown")}
            </DialogDescription>
          </DialogHeader>

          <div className={styles.adviceDialogBody}>
            {selected === "singles" && (
              <SinglesGrid
                rows={singlesRows}
                label={t("items.checklistSinglesCart")}
                t={t}
              />
            )}

            {selected === "mixed" && (
              <div className={styles.adviceCols}>
                <div className={styles.adviceCol}>
                  <h3 className={styles.adviceTitle}>
                    {t("items.checklistAdviceFactSealed")}
                  </h3>
                  <CartLines
                    items={mixed.items}
                    t={t}
                    perCardBySlug={perCardBySlug}
                  />
                  <p className={styles.adviceNote}>
                    {t("items.checklistAdviceSealedStopRule", {
                      count: decimal(mixed.stopRule.minNewCardsPerPack),
                    })}
                  </p>
                </div>
                <div className={styles.adviceCol}>
                  <h3 className={styles.adviceTitle}>
                    {t("items.checklistAdviceFactThenSingles")}
                  </h3>
                  <p className={styles.adviceTotal}>
                    {t("items.checklistAdviceIfNotPulled", {
                      count: Math.ceil(mixed.expectedRemainingCards),
                      price: euros(mixed.singlesCents),
                    })}
                  </p>
                  <p className={styles.adviceLegend}>
                    {t("items.checklistAdviceMixedRemainingLegend", {
                      count: mixedRows.length,
                    })}
                  </p>
                  <SinglesGrid
                    rows={mixedRows}
                    label={t("items.checklistSinglesCart")}
                    t={t}
                  />
                </div>
              </div>
            )}

            {selected === "sealed" && (
              <>
                {sealedUsable && (
                  <>
                    <CartLines
                      items={sealed.items}
                      t={t}
                      perCardBySlug={perCardBySlug}
                    />
                    {sealed.unreachableHoles > 0 && (
                      <p className={styles.adviceNote}>
                        {t("items.checklistAdviceTrackSealedUnreachable", {
                          count: sealed.unreachableHoles,
                        })}
                      </p>
                    )}
                  </>
                )}

                {yieldMetrics.length > 0 && (
                  <>
                    <h3
                      className={cn(
                        styles.adviceTitle,
                        sealedUsable && styles.adviceTitleGap,
                      )}
                    >
                      {t(
                        sealedUsable
                          ? "items.checklistAdviceYieldOthersTitle"
                          : "items.checklistAdviceYieldTitle",
                      )}
                    </h3>
                    <table className={styles.yieldTable}>
                      <thead>
                        <tr>
                          <th scope="col">
                            {t("items.checklistAdviceYieldProduct")}
                          </th>
                          <th scope="col" className={styles.yieldNum}>
                            {t("items.checklistAdviceYieldPrice")}
                          </th>
                          <th scope="col" className={styles.yieldNum}>
                            {t("items.checklistAdviceYieldNewCards")}
                          </th>
                          <th scope="col" className={styles.yieldNum}>
                            {t("items.checklistAdviceYieldPerCard")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {yieldMetrics.slice(0, yieldLimit).map((m) => (
                          <tr
                            key={m.slug}
                            className={cn(m.indeterminate && styles.yieldMuted)}
                          >
                            <td>
                              <span className={styles.yieldProduct}>
                                <ProductThumb src={m.imageUrl} />
                                <span className={styles.yieldName}>
                                  {m.name}
                                </span>
                              </span>
                            </td>
                            <td className={styles.yieldNum}>
                              {m.priceCents != null ? euros(m.priceCents) : "—"}
                            </td>
                            <td className={styles.yieldNum}>
                              {m.indeterminate
                                ? "—"
                                : `+${decimal(m.expectedNewCards)}`}
                            </td>
                            <td className={styles.yieldNum}>
                              {m.indeterminate
                                ? m.priceCents == null
                                  ? t("items.checklistSealedNoPrice")
                                  : t("items.checklistSealedStructureOnly")
                                : m.centsPerNewCard != null
                                  ? euros(m.centsPerNewCard)
                                  : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {yieldMetrics.length > yieldLimit && (
                      <button
                        type="button"
                        className={styles.adviceMoreButton}
                        onClick={() => setYieldLimit(yieldMetrics.length)}
                      >
                        {t("items.checklistAdviceShowMoreProducts", {
                          count: yieldMetrics.length - yieldLimit,
                        })}
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            {flagNotes.length > 0 && (
              <ul className={styles.adviceFootnotes}>
                {flagNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
