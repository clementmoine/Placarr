"use client";

/**
 * La check-list d'une étagère — à l'écran, et sur papier.
 *
 * Une page à part plutôt qu'un panneau : c'est ce qui la rend **imprimable**.
 * Le navigateur sait déjà faire un PDF d'une page ; la mise en page d'impression
 * vit donc dans la feuille de style, et aucune dépendance n'est ajoutée pour
 * générer un document qu'on sait déjà produire.
 *
 * Une seule liste d'extensions, ordre de sortie. Le pourcentage et les conseils
 * d'achat portent l'état — pas un découpage « en cours / terminés / pas
 * commencés ».
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  ArrowLeft,
  ChevronRight,
  FileDown,
  Loader2,
  Package,
  Printer,
  Search,
  Settings,
} from "lucide-react";

import {
  ambiguousChecklistPrintKeys,
  checklistRowIdentity,
  checklistShouldShowFinish,
} from "@/core/collect/checklist";
import {
  checklistSetsForMarkdown,
  formatChecklistMarkdown,
} from "@/core/collect/checklistMarkdown";
import {
  nextTcgdexDisplayUrl,
  tcgdexDisplayCandidates,
} from "@/core/enrich/media/tcgdexAssetUrls";
import {
  DEFAULT_CHECKLIST_PREFS,
  readChecklistPrefs,
  writeChecklistPrefs,
} from "@/lib/client/checklistPrefs";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import { cn } from "@/lib/shared/utils";
import { localizeFinishLabel } from "@/lib/text/finishLabel";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import styles from "./checklist.module.css";

type ChecklistPrint = {
  printKey: string;
  reference: string;
  title: string;
  thumbnailUrl?: string | null;
  owned?: boolean;
  /** Présent en mode master set — une ligne par finition. */
  finish?: string | null;
};

type ChecklistSet = {
  id: string;
  label: string;
  group?: string | null;
  iconUrl?: string | null;
  iconUrls?: string[] | null;
  total: number;
  owned: number;
  completion: number;
  cards: ChecklistPrint[];
  missing: ChecklistPrint[];
};

type BuyOption = {
  slug: string;
  name: string;
  kind: string;
  newCards: number;
  certainty: "exact" | "atLeast" | "expected" | "unknown";
  priceCents: number | null;
  centsPerNewCard: number | null;
  /** Prix max pour égaler le meilleur € / neuve — absent sur le recommandé. */
  maxCompetitivePriceCents?: number | null;
  basis: string;
  imageUrl?: string | null;
  language?: string | null;
  languageMismatch?: boolean;
  structureAttested?: boolean;
};

type SealedPrintSource = {
  slug: string;
  name: string;
  kind: string;
  imageUrl?: string | null;
};

type SetAdvice = {
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
  /** `printKey` → centimes EUR — manquantes et possédées. */
  prices: Record<string, number>;
  /** `printKey` → produits scellés qui garantissent la carte (aussi si possédée). */
  sealedSources: Record<string, SealedPrintSource[]>;
  options: BuyOption[];
  plan: {
    buySinglesCount: number;
    buySinglesCents: number;
    buySinglesKeys: string[];
    sealedHoles: number;
    sealedHoleKeys: string[];
    boostersExpected: number | null;
    boostersToComplete: number | null;
    sealedUnitsExpected: number | null;
    sealedUnitsToComplete: number | null;
    recommendedSlug: string | null;
    preferSingles: boolean;
    packThreshold: {
      slug: string;
      name: string;
      centsPerNewCard: number;
    } | null;
  };
};

type ChecklistResponse = {
  shelf: { id: string; name: string | null; slug: string | null };
  language: string | null;
  languages: string[];
  masterSet?: boolean;
  /** Copies sans `variant` — ignorées en master set. */
  untaggedOwned?: number;
  /** Hors master set : suggérer d'activer (tirages multi-finition possédés). */
  suggestMasterSet?: boolean;
  multiFinishOwned?: number;
  sets: ChecklistSet[];
  setsWithoutCatalogue: { id: string; label: string }[];
  advice: SetAdvice[];
  totals: { total: number; owned: number; completion: number };
};

/** Les centimes ne s'affichent pas à l'utilisateur ; les euros, si. */
function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Ligne sous le nom : gain, et € / carte si on a un prix. */
function sealedOptionGain(
  option: BuyOption,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (option.structureAttested) {
    return t("items.checklistStructureAttested");
  }
  if (option.centsPerNewCard != null && option.newCards > 0) {
    return t(
      option.certainty === "exact"
        ? "items.checklistNewCardsExactWithCost"
        : option.certainty === "atLeast"
          ? "items.checklistNewCardsAtLeastWithCost"
          : "items.checklistNewCardsApproxWithCost",
      {
        count: option.newCards,
        perCard: euros(option.centsPerNewCard),
      },
    );
  }
  return t(
    option.certainty === "exact"
      ? "items.checklistNewCardsExact"
      : option.certainty === "atLeast"
        ? "items.checklistNewCardsAtLeast"
        : "items.checklistNewCardsApprox",
    { count: option.newCards },
  );
}

/**
 * Miniature → aperçu agrandi au survol (portail : évite le clip
 * `overflow: hidden` des lignes de set / colonnes CSS).
 *
 * TCGdex CDN : enchaîne webp→png→jpg puis low↔high si le 1ʳᵉ URL 404.
 */
function HoverEnlargeImage({
  src,
  className,
  variant = "card",
}: {
  src: string;
  className: string;
  variant?: "card" | "product";
}) {
  const chain = useMemo(() => tcgdexDisplayCandidates(src), [src]);
  const [current, setCurrent] = useState(chain[0] ?? src);

  useEffect(() => {
    setCurrent(chain[0] ?? src);
  }, [chain, src]);

  const advance = useCallback(() => {
    setCurrent((prev) => nextTcgdexDisplayUrl(prev, chain) ?? prev);
  }, [chain]);

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <img
          src={current}
          alt=""
          className={className}
          loading="lazy"
          decoding="async"
          onError={advance}
        />
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="right"
          sideOffset={10}
          collisionPadding={12}
          className={cn(
            styles.thumbPopover,
            variant === "product" && styles.thumbPopoverProduct,
          )}
        >
          <img
            src={current}
            alt=""
            className={styles.thumbPopoverImg}
            onError={advance}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function normalizeChecklistQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function checklistTextMatches(
  query: string,
  ...parts: Array<string | null | undefined>
): boolean {
  if (!query) return true;
  const haystack = normalizeChecklistQuery(parts.filter(Boolean).join(" "));
  return haystack.includes(query);
}

function CompletionBar({ value }: { value: number }) {
  return (
    <div className={styles.bar} role="presentation">
      <div className={styles.barFill} style={{ width: `${value}%` }} />
    </div>
  );
}

/**
 * Ce qu'il en coûte, et ce qu'on peut acheter à la place.
 *
 * Résumé = **une** intention : singles en fin de set (tir cadré), sinon
 * reco scellé (mercato, kind-agnostique). Liste scellée = rentabilité
 * (€ / neuve) décroissante, avec ≈ +N cartes.
 */
function Advice({
  advice,
  cards,
  hideZeroSealedExpectation,
  t,
}: {
  advice: SetAdvice;
  /** Cartes du set (manquantes) — pour miniatures du panier singles. */
  cards: readonly ChecklistPrint[];
  hideZeroSealedExpectation: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  const { singles, options, plan, prices } = advice;
  const recommended =
    options.find((option) => option.slug === plan.recommendedSlug) ?? null;
  /*
    Mercato : teaser = scellé recommandé (€ / neuve, decks inclus).
    Fin de set : pas de teaser scellé — l'intention c'est l'unité (tir cadré).
  */
  const teaser = plan.preferSingles
    ? null
    : (recommended ??
      options.find(
        (option) => option.newCards > 0 && !option.languageMismatch,
      ) ??
      options.find((option) => option.newCards > 0) ??
      null);

  const hasVolume =
    !plan.preferSingles &&
    plan.boostersToComplete != null &&
    plan.boostersToComplete > 0;
  /*
    Le volume « trous hors singles » ne s'affiche que s'il **change** quelque
    chose : sinon c'est le même chiffre que « pour tout avoir », en double.
  */
  const hasSplitVolume =
    plan.buySinglesCount > 0 &&
    plan.boostersExpected != null &&
    plan.sealedHoles > 0 &&
    plan.boostersExpected !== plan.boostersToComplete;

  const hasDetail =
    plan.buySinglesCount > 0 ||
    singles.priced > 0 ||
    singles.unpriced > 0 ||
    options.length > 0 ||
    hasVolume;

  /*
    Résumé : fin de set → singles ; mercato → scellé recommandé d'abord,
    chase à l'unité en second (pas l'inverse — à 0 % « 35 singles
    recommandés » faisait croire qu'il fallait 1000 € avant le scellé).
  */
  const briefParts: string[] = [];
  if (plan.preferSingles && plan.buySinglesCount > 0) {
    briefParts.push(
      t("items.checklistAdviceBriefBuySingles", {
        count: plan.buySinglesCount,
        price: euros(plan.buySinglesCents),
      }),
    );
  } else {
    if (teaser != null) briefParts.push(teaser.name);
    if (plan.buySinglesCount > 0) {
      briefParts.push(
        t("items.checklistAdviceBriefBuySingles", {
          count: plan.buySinglesCount,
          price: euros(plan.buySinglesCents),
        }),
      );
    }
  }
  if (briefParts.length === 0 && singles.unpriced > 0) {
    briefParts.push(
      t("items.checklistAdviceBriefUnpriced", { count: singles.unpriced }),
    );
  }
  if (briefParts.length === 0) {
    briefParts.push(t("items.checklistNoAdvice"));
  }
  const brief = briefParts.join(" · ");

  /*
    Un seul critère : € / carte neuve (puis +neuves à égalité) — déjà
    trié côté core. Pas de re-pin « Recommandé » qui cassait la lecture.
  */
  const listedOptions = hideZeroSealedExpectation
    ? options.filter((option) => option.newCards > 0)
    : options;

  /*
    Colonne « à l'unité » = conseil d'achat singles (chase / fin de set /
    total coté). Sans cote utile, on ne laisse pas « 141 sans prix » occuper
    la moitié du panneau.
  */
  const showSinglesCol =
    plan.buySinglesCount > 0 ||
    plan.preferSingles ||
    singles.priced > 0;

  /*
    Clés plan = `printKey|finish` (master set). Prix catalogue toujours
    indexés par printKey — on reprend le print depuis la ligne.
  */
  const byRow = new Map(
    cards.map((card) => [checklistRowIdentity(card), card] as const),
  );
  const thumbRows = (keys: readonly string[]) =>
    keys
      .map((key) => {
        const card = byRow.get(key);
        const priceCents = card
          ? prices[card.printKey]
          : (prices[key] ?? null);
        if (priceCents == null) return null;
        return {
          rowKey: key,
          printKey: card?.printKey ?? key,
          title: card?.title ?? key,
          reference: card?.reference ?? "",
          thumbnailUrl: card?.thumbnailUrl ?? null,
          priceCents,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.priceCents - a.priceCents);

  /*
    Colonne à l'unité = seulement le panier pertinent (chase / fin de set),
    exhaustif. Pas la liste des trous « plutôt en scellé » ni la barre booster.
  */
  const singlesCart = thumbRows(plan.buySinglesKeys ?? []);
  const unpricedLeft = cards
    .filter((card) => prices[card.printKey] == null)
    .map((card) => ({
      rowKey: checklistRowIdentity(card),
      printKey: card.printKey,
      title: card.title,
      reference: card.reference,
      thumbnailUrl: card.thumbnailUrl ?? null,
    }));

  return (
    <div className={styles.advice}>
      <div className={styles.adviceSummary}>
        <span className={styles.adviceSummaryPrimary}>
          <span className={styles.adviceSummaryLabel}>
            {t("items.checklistAdviceTitle")}
          </span>
          <span className={styles.adviceBrief} title={brief}>
            {teaser?.imageUrl ? (
              <HoverEnlargeImage
                src={teaser.imageUrl}
                className={styles.productThumb}
                variant="product"
              />
            ) : null}
            {plan.preferSingles && plan.buySinglesCount > 0 ? (
              <span className={styles.badge}>
                {t("items.checklistRecommended")}
              </span>
            ) : !plan.preferSingles && recommended != null ? (
              <span className={styles.badge}>
                {t("items.checklistRecommended")}
              </span>
            ) : null}
            <span className={styles.adviceBriefText}>{brief}</span>
          </span>
        </span>
        {hasDetail && (
          <button
            type="button"
            className={styles.adviceToggle}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {t(
              open
                ? "items.checklistAdviceLess"
                : "items.checklistAdviceMore",
            )}
          </button>
        )}
      </div>

      {hasDetail && (
        <div className={cn(styles.adviceDetail, open && styles.adviceDetailOpen)}>
          <div
            className={cn(
              styles.adviceCols,
              !showSinglesCol && styles.adviceColsSealedOnly,
            )}
          >
            {showSinglesCol && (
            <div className={styles.adviceCol}>
              <h3 className={styles.adviceTitle}>
                {t("items.checklistSingles")}
              </h3>
              {plan.buySinglesCount > 0 && (
                <>
                  <p className={styles.adviceTotal}>
                    {t("items.checklistPlanSingles", {
                      count: plan.buySinglesCount,
                      price: euros(plan.buySinglesCents),
                    })}
                  </p>
                  <p className={styles.adviceNote}>
                    {t(
                      plan.preferSingles
                        ? "items.checklistPlanSinglesWhyEndgame"
                        : "items.checklistPlanSinglesWhyChase",
                    )}
                  </p>
                </>
              )}
              {singlesCart.length > 0 && (
                <ul className={styles.singlesCart} aria-label={t("items.checklistSinglesCart")}>
                  {singlesCart.map((row) => (
                    <li
                      key={row.rowKey}
                      className={styles.singlesCartItem}
                      title={`${row.reference} ${row.title} — ${euros(row.priceCents)}`}
                    >
                      {row.thumbnailUrl ? (
                        <HoverEnlargeImage
                          src={row.thumbnailUrl}
                          className={styles.singlesCartThumb}
                        />
                      ) : (
                        <span
                          className={styles.singlesCartThumbPlaceholder}
                          aria-hidden
                        />
                      )}
                      <span className={styles.singlesCartPrice}>
                        {euros(row.priceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {unpricedLeft.length > 0 && (
                <>
                  <p className={styles.adviceTotalSecondary}>
                    {t("items.checklistUnpriced", {
                      count: unpricedLeft.length,
                    })}
                  </p>
                  <p className={styles.adviceWarn}>
                    {t("items.checklistUnpricedWhy")}
                  </p>
                  <ul
                    className={styles.singlesCart}
                    aria-label={t("items.checklistUnpricedCart")}
                  >
                    {unpricedLeft.map((row) => (
                      <li
                        key={row.rowKey}
                        className={styles.singlesCartItem}
                        title={`${row.reference} ${row.title}`}
                      >
                        {row.thumbnailUrl ? (
                          <HoverEnlargeImage
                            src={row.thumbnailUrl}
                            className={styles.singlesCartThumb}
                          />
                        ) : (
                          <span
                            className={styles.singlesCartThumbPlaceholder}
                            aria-hidden
                          />
                        )}
                        <span className={styles.singlesCartPrice}>—</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {singles.priced === 0 &&
                plan.buySinglesCount === 0 && (
                  <p className={styles.adviceNote}>
                    {t("items.checklistNoSinglesAdvice")}
                  </p>
                )}
            </div>
            )}

            <div className={styles.adviceCol}>
              <h3 className={styles.adviceTitle}>
                {t("items.checklistSealed")}
              </h3>
              {plan.preferSingles ? (
                <p className={styles.adviceNote}>
                  {t("items.checklistSealedNotRecommended")}
                </p>
              ) : hasSplitVolume &&
                recommended != null &&
                plan.sealedUnitsExpected != null ? (
                <p className={styles.adviceNote}>
                  {t("items.checklistPlanSealedUnits", {
                    holes: plan.sealedHoles,
                    boosters: plan.boostersExpected!,
                    units: plan.sealedUnitsExpected,
                    name: recommended.name,
                  })}
                </p>
              ) : hasSplitVolume ? (
                <p className={styles.adviceNote}>
                  {t("items.checklistPlanBoosters", {
                    holes: plan.sealedHoles,
                    boosters: plan.boostersExpected!,
                  })}
                </p>
              ) : hasVolume &&
                recommended != null &&
                plan.sealedUnitsToComplete != null ? (
                <p className={styles.adviceNote}>
                  {t("items.checklistPlanSealedUnitsToComplete", {
                    boosters: plan.boostersToComplete!,
                    units: plan.sealedUnitsToComplete,
                    name: recommended.name,
                  })}
                </p>
              ) : hasVolume ? (
                <p className={styles.adviceNote}>
                  {t("items.checklistPlanBoostersToComplete", {
                    boosters: plan.boostersToComplete!,
                  })}
                </p>
              ) : listedOptions.length === 0 && options.length > 0 ? (
                <p className={styles.adviceNote}>
                  {t("items.checklistSealedNoUsefulOption")}
                </p>
              ) : listedOptions.some((option) => option.structureAttested) &&
                !listedOptions.some((option) => option.newCards > 0) ? (
                <p className={styles.adviceNote}>
                  {t("items.checklistSealedStructureOnly")}
                </p>
              ) : null}
              {listedOptions.some(
                (option) =>
                  option.newCards > 0 && option.centsPerNewCard == null,
              ) && (
                <p className={styles.adviceNote}>
                  {t("items.checklistSealedNoPrice")}
                </p>
              )}
              {options.length === 0 && (
                <p className={styles.adviceNote}>
                  {t("items.checklistNoAdvice")}
                </p>
              )}
              <ul className={styles.optionList}>
                {listedOptions.map((option) => (
                  <li
                    key={option.slug}
                    className={cn(
                      styles.option,
                      option.languageMismatch && styles.optionOtherLang,
                    )}
                  >
                    {option.imageUrl ? (
                      <HoverEnlargeImage
                        src={option.imageUrl}
                        className={styles.productThumb}
                        variant="product"
                      />
                    ) : (
                      <span
                        className={styles.productThumbPlaceholder}
                        aria-hidden
                      />
                    )}
                    <div className={styles.optionBody}>
                      <div className={styles.optionTop}>
                        <span className={styles.optionName}>{option.name}</span>
                        {option.languageMismatch && option.language && (
                          <span
                            className={styles.optionLang}
                            title={t("items.checklistOtherLanguageHint", {
                              language: option.language.toUpperCase(),
                            })}
                          >
                            {t("items.checklistOtherLanguage", {
                              language: option.language.toUpperCase(),
                            })}
                          </span>
                        )}
                        {recommended != null &&
                          option.slug === recommended.slug && (
                            <span className={styles.badge}>
                              {t("items.checklistRecommended")}
                            </span>
                          )}
                        {option.priceCents != null && (
                          <span className={styles.optionPrice}>
                            {euros(option.priceCents)}
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          styles.optionGain,
                          option.certainty === "exact" && styles.optionExact,
                          option.languageMismatch && styles.optionMuted,
                          option.structureAttested && styles.optionMuted,
                        )}
                        title={option.basis}
                      >
                        {sealedOptionGain(option, t)}
                      </span>
                      {option.maxCompetitivePriceCents != null &&
                        option.maxCompetitivePriceCents > 0 && (
                          <span
                            className={styles.optionCompetitiveCap}
                            title={t("items.checklistSealedCompetitiveCapHint")}
                          >
                            {t("items.checklistSealedCompetitiveCap", {
                              price: euros(option.maxCompetitivePriceCents),
                            })}
                          </span>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SetRow({
  set,
  advice,
  expandable,
  showOwned,
  alwaysShowFinishLabels,
  showPrices,
  hideZeroSealedExpectation,
  searchQuery,
  forceExpand,
  t,
}: {
  set: ChecklistSet;
  advice?: SetAdvice;
  expandable: boolean;
  showOwned: boolean;
  alwaysShowFinishLabels: boolean;
  showPrices: boolean;
  hideZeroSealedExpectation: boolean;
  searchQuery: string;
  /**
   * Impression : monter toutes les cartes dans le DOM. Sinon Masters (7k+)
   * plantait la page en peignant chaque ligne repliée avec `display: none`.
   */
  forceExpand: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const searching = Boolean(searchQuery);
  const setMatches = searching
    ? checklistTextMatches(searchQuery, set.label, set.group, set.id)
    : false;
  const [open, setOpen] = useState(false);
  /*
    Ne monter la liste que si le set est ouvert, en recherche, ou à
    l'impression. Masters (~7k cartes) plantait en peignant chaque ligne
    repliée (`display: none` ne retire pas les nœuds du DOM).
  */
  const shouldMountCards = forceExpand || open || searching;

  const rows = useMemo(() => {
    if (!shouldMountCards) return [];
    /*
      La recherche ne contourne pas le filtre « déjà sur l'étagère » :
      sans la case, on ne voit / ne cherche que les manquantes.
    */
    const pool = showOwned
      ? (set.cards ?? [
          ...set.missing.map((row) => ({ ...row, owned: false as boolean })),
        ])
      : set.missing.map((row) => ({ ...row, owned: false as boolean }));
    if (!searching || setMatches) return pool;
    return pool.filter((card) =>
      checklistTextMatches(
        searchQuery,
        card.reference,
        card.title,
        card.printKey,
        card.finish,
      ),
    );
  }, [
    shouldMountCards,
    set.cards,
    set.missing,
    showOwned,
    searching,
    searchQuery,
    setMatches,
  ]);

  /*
    Finition affichée seulement s'il y a ambiguïté (plusieurs lignes master
    set pour le même printKey). Calculé sur tout le set, pas sur le pool
    filtré — une foil manquante reste étiquetée si la normale existe aussi.
  */
  const ambiguousFinishes = useMemo(
    () => ambiguousChecklistPrintKeys(set.cards ?? set.missing),
    [set.cards, set.missing],
  );

  const listOpen = forceExpand || (searching ? rows.length > 0 : open);
  const prices = advice?.prices ?? {};
  const sealedSources = advice?.sealedSources ?? {};
  const iconCandidates = useMemo(() => {
    const out: string[] = [];
    for (const url of set.iconUrls ?? []) {
      const trimmed = url?.trim();
      if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    }
    const primary = set.iconUrl?.trim();
    if (primary && !out.includes(primary)) out.unshift(primary);
    return out;
  }, [set.iconUrl, set.iconUrls]);
  const [iconIndex, setIconIndex] = useState(0);
  useEffect(() => {
    setIconIndex(0);
  }, [iconCandidates.join("\0")]);
  const iconSrc = iconCandidates[iconIndex] ?? null;
  return (
    <li className={styles.setRow}>
      <button
        type="button"
        className={styles.setHead}
        onClick={() => expandable && !searching && setOpen((v) => !v)}
        aria-expanded={expandable ? listOpen : undefined}
        disabled={searching ? rows.length === 0 : !expandable}
      >
        {expandable && (
          <ChevronRight
            className={cn(styles.chevron, listOpen && styles.chevronOpen)}
            aria-hidden
          />
        )}
        {iconSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- CDN set glyph; chain on 404
          <img
            src={iconSrc}
            alt=""
            className={styles.setIcon}
            width={24}
            height={24}
            loading="lazy"
            decoding="async"
            onError={() => {
              if (iconIndex + 1 < iconCandidates.length) {
                setIconIndex((i) => i + 1);
              } else {
                setIconIndex(iconCandidates.length);
              }
            }}
          />
        ) : null}
        <span className={styles.setLabel}>{set.label}</span>
        <span className={styles.setCount}>
          {t("items.checklistOwnedOf", { owned: set.owned, total: set.total })}
        </span>
        <CompletionBar value={set.completion} />
        <span className={styles.setPct}>{set.completion}%</span>
      </button>

      {/*
        Les cartes sont dépliées à l'écran et **toujours visibles à
        l'impression** : une check-list papier qu'il faut déplier n'en est pas
        une.
      */}
      {showPrices &&
        advice &&
        set.missing.length > 0 &&
        listOpen &&
        !searching && (
          <Advice
            advice={advice}
            cards={set.missing}
            hideZeroSealedExpectation={hideZeroSealedExpectation}
            t={t}
          />
        )}

      {listOpen && rows.length > 0 && (
        <ol className={cn(styles.missing, styles.missingOpen)}>
          {rows.map((row) => {
            // Cote + sources scellées aussi pour les cartes déjà possédées.
            const priceCents = showPrices
              ? (prices[row.printKey] ?? null)
              : null;
            const sources = sealedSources[row.printKey] ?? [];
            const sealedLabel =
              sources.length > 0
                ? sources.map((source) => source.name).join(" · ")
                : "";
            return (
              <li
                key={`${row.printKey}|${row.finish ?? ""}`}
                className={cn(
                  styles.missingRow,
                  row.owned && styles.missingOwned,
                )}
              >
                <span
                  className={cn(styles.checkbox, row.owned && styles.checkboxOn)}
                  aria-hidden
                />
                {row.thumbnailUrl ? (
                  <HoverEnlargeImage
                    src={row.thumbnailUrl}
                    className={styles.thumb}
                  />
                ) : (
                  <span className={styles.thumbPlaceholder} aria-hidden />
                )}
                <span className={styles.ref}>{row.reference}</span>
                <span className={styles.name}>{row.title}</span>
                {checklistShouldShowFinish({
                  printKey: row.printKey,
                  finish: row.finish,
                  ambiguous: ambiguousFinishes,
                  onlyWhenAmbiguous: !alwaysShowFinishLabels,
                }) ? (
                  <span className={styles.finish}>
                    {localizeFinishLabel(row.finish!, t)}
                  </span>
                ) : null}
                {sources.length > 0 && (
                  <span
                    className={styles.cardSources}
                    title={t("items.checklistInSealed", {
                      products: sealedLabel,
                    })}
                    aria-label={t("items.checklistInSealed", {
                      products: sealedLabel,
                    })}
                  >
                    {sources.some((source) => source.imageUrl) ? (
                      <span className={styles.cardSourcesThumbs}>
                        {sources.slice(0, 3).map((source) =>
                          source.imageUrl ? (
                            <HoverEnlargeImage
                              key={source.slug}
                              src={source.imageUrl}
                              className={styles.cardSourceThumb}
                              variant="product"
                            />
                          ) : null,
                        )}
                      </span>
                    ) : (
                      <Package
                        className={styles.cardSourcesIcon}
                        aria-hidden
                      />
                    )}
                  </span>
                )}
                {priceCents != null && (
                  <span className={styles.cardPrice}>{euros(priceCents)}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </li>
  );
}

export default function ChecklistPage() {
  const params = useParams<{ shelfId: string }>();
  const shelfId = params?.shelfId ?? "";
  const { t } = useLocale();
  const [language, setLanguage] = useState<string | null>(null);
  /*
    Par défaut : toute la liste (possédées comprises) — cote et provenance
    scellée restent utiles même cochées. Décocher pour ne chasser que les
    manquantes. Préférence mémorisée par étagère (localStorage).
  */
  const [showOwned, setShowOwned] = useState(
    DEFAULT_CHECKLIST_PREFS.showOwned,
  );
  /*
    Master set : chaque finition (normale / foil / …) est une case. Posséder
    la foil ne coche pas la normale. Off par défaut en début de licence ;
    mémorisé par étagère.
  */
  const [masterSet, setMasterSet] = useState(
    DEFAULT_CHECKLIST_PREFS.masterSet,
  );
  const [masterSetSuggestDismissed, setMasterSetSuggestDismissed] = useState(
    DEFAULT_CHECKLIST_PREFS.masterSetSuggestDismissed,
  );
  const [alwaysShowFinishLabels, setAlwaysShowFinishLabels] = useState(
    DEFAULT_CHECKLIST_PREFS.alwaysShowFinishLabels,
  );
  const [showPrices, setShowPrices] = useState(
    DEFAULT_CHECKLIST_PREFS.showPrices,
  );
  const [hideZeroSealedExpectation, setHideZeroSealedExpectation] = useState(
    DEFAULT_CHECKLIST_PREFS.hideZeroSealedExpectation,
  );
  const [prefsReady, setPrefsReady] = useState(false);
  const [search, setSearch] = useState("");
  /** Déplie tous les sets le temps d'imprimer (sinon les cartes ne sont pas dans le DOM). */
  const [printing, setPrinting] = useState(false);
  const searchQuery = useMemo(
    () => normalizeChecklistQuery(search),
    [search],
  );

  useEffect(() => {
    const prefs = readChecklistPrefs(shelfId);
    setShowOwned(prefs.showOwned);
    setMasterSet(prefs.masterSet);
    setMasterSetSuggestDismissed(prefs.masterSetSuggestDismissed);
    setAlwaysShowFinishLabels(prefs.alwaysShowFinishLabels);
    setShowPrices(prefs.showPrices);
    setHideZeroSealedExpectation(prefs.hideZeroSealedExpectation);
    setPrefsReady(true);
  }, [shelfId]);

  useEffect(() => {
    if (!prefsReady || !shelfId) return;
    writeChecklistPrefs(shelfId, {
      showOwned,
      masterSet,
      masterSetSuggestDismissed,
      alwaysShowFinishLabels,
      showPrices,
      hideZeroSealedExpectation,
    });
  }, [
    shelfId,
    showOwned,
    masterSet,
    masterSetSuggestDismissed,
    alwaysShowFinishLabels,
    showPrices,
    hideZeroSealedExpectation,
    prefsReady,
  ]);

  useEffect(() => {
    const onBefore = () => {
      flushSync(() => setPrinting(true));
    };
    const onAfter = () => setPrinting(false);
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["checklist", shelfId, language, masterSet],
    queryFn: async (): Promise<ChecklistResponse> => {
      const params = new URLSearchParams();
      if (language) params.set("language", language);
      if (masterSet) params.set("masterSet", "1");
      const query = params.toString();
      const url = `/api/shelves/${encodeURIComponent(shelfId)}/checklist${
        query ? `?${query}` : ""
      }`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as ChecklistResponse;
    },
    enabled: Boolean(shelfId) && prefsReady,
  });

  /*
    Étagère vide : l'API n'a pas de langue dominante. On part sur la première
    annoncée (souvent `fr` pour Masters) pour ne pas mélanger les territoires.
  */
  useEffect(() => {
    if (language != null || !data?.languages?.length) return;
    if (data.language) {
      setLanguage(data.language);
      return;
    }
    setLanguage(data.languages.includes("fr") ? "fr" : data.languages[0]!);
  }, [data, language]);

  const adviceBySet = useMemo(
    () => new Map((data?.advice ?? []).map((row) => [row.setId, row])),
    [data?.advice],
  );

  const filteredSets = useMemo(() => {
    if (!data?.sets.length) return [];
    if (!searchQuery) return data.sets;
    return data.sets.filter((set) => {
      if (
        checklistTextMatches(searchQuery, set.label, set.group, set.id)
      ) {
        return true;
      }
      const pool = showOwned
        ? set.cards?.length
          ? set.cards
          : set.missing
        : set.missing;
      return pool.some((card) =>
        checklistTextMatches(
          searchQuery,
          card.reference,
          card.title,
          card.printKey,
          card.finish,
        ),
      );
    });
  }, [data?.sets, searchQuery, showOwned]);

  const downloadMarkdown = useCallback(() => {
    if (!data) return;
    const langCode = data.language?.trim().toLowerCase() || "";
    const languageLabel = langCode
      ? printLanguageLabel(langCode).name
      : null;
    const setsForMd = data.sets.map((set) => {
      if (!showPrices) return set;
      const prices = adviceBySet.get(set.id)?.prices;
      if (!prices || Object.keys(prices).length === 0) return set;
      const labels: Record<string, string> = {};
      for (const [printKey, cents] of Object.entries(prices)) {
        if (typeof cents === "number" && Number.isFinite(cents)) {
          labels[printKey] = euros(cents);
        }
      }
      return { ...set, prices: labels };
    });
    const markdown = formatChecklistMarkdown({
      shelfName: data.shelf.name,
      language: data.language,
      languageLabel,
      totals: data.totals,
      includeOwned: showOwned,
      sets: checklistSetsForMarkdown(
        setsForMd,
        showOwned,
        (finish) => localizeFinishLabel(finish, t),
        !alwaysShowFinishLabels,
      ),
      setsWithoutCatalogue: data.setsWithoutCatalogue,
    });
    const slug =
      data.shelf.slug?.trim() ||
      data.shelf.name?.trim().toLowerCase().replace(/\s+/g, "-") ||
      "checklist";
    const langSuffix = langCode ? `-${langCode}` : "";
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug}${langSuffix}-checklist.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [
    data,
    showOwned,
    alwaysShowFinishLabels,
    showPrices,
    adviceBySet,
    t,
  ]);

  return (
    <TooltipPrimitive.Provider
      delayDuration={220}
      skipDelayDuration={0}
      disableHoverableContent
    >
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.topBar}>
          <Link
            href={`/shelves/${encodeURIComponent(shelfId)}`}
            className={styles.back}
          >
            <ArrowLeft className="size-4" aria-hidden />
            {data?.shelf.name ?? ""}
          </Link>

          <div className={styles.topActions}>
            <button
              type="button"
              onClick={downloadMarkdown}
              className={styles.iconBtn}
              disabled={!data || data.totals.total === 0}
              title={t("items.checklistExportMarkdown")}
              aria-label={t("items.checklistExportMarkdown")}
            >
              <FileDown className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                flushSync(() => setPrinting(true));
                window.print();
                setPrinting(false);
              }}
              className={styles.iconBtn}
              title={t("items.checklistPrint")}
              aria-label={t("items.checklistPrint")}
            >
              <Printer className="size-4" aria-hidden />
            </button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={styles.settingsBtn}
                  title={t("items.checklistSettings")}
                  aria-label={t("items.checklistSettings")}
                >
                  <Settings className="size-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>
                  {t("items.checklistSettings")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showOwned}
                  onCheckedChange={(checked) =>
                    setShowOwned(checked === true)
                  }
                >
                  {t("items.checklistShowOwned")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={masterSet}
                  onCheckedChange={(checked) => {
                    const on = checked === true;
                    setMasterSet(on);
                    if (on) setMasterSetSuggestDismissed(true);
                  }}
                >
                  {t("items.checklistMasterSet")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={alwaysShowFinishLabels}
                  disabled={!masterSet}
                  onCheckedChange={(checked) =>
                    setAlwaysShowFinishLabels(checked === true)
                  }
                >
                  {t("items.checklistAlwaysShowFinishLabels")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showPrices}
                  onCheckedChange={(checked) =>
                    setShowPrices(checked === true)
                  }
                >
                  {t("items.checklistShowPrices")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={hideZeroSealedExpectation}
                  disabled={!showPrices}
                  onCheckedChange={(checked) =>
                    setHideZeroSealedExpectation(checked === true)
                  }
                >
                  {t("items.checklistHideZeroSealedExpectation")}
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className={styles.hero}>
          <div className={styles.heroText}>
            <h1 className={styles.title}>{t("items.checklistTitle")}</h1>
            <p className={styles.subtitle}>{t("items.checklistSubtitle")}</p>
          </div>
          {data && (
            <div className={styles.totals}>
              <strong>
                {t("items.checklistOwnedOf", {
                  owned: data.totals.owned,
                  total: data.totals.total,
                })}
              </strong>
              <CompletionBar value={data.totals.completion} />
              <span className={styles.totalsPct}>
                {data.totals.completion}%
              </span>
            </div>
          )}
        </div>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search className={styles.searchIcon} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("items.checklistSearch")}
              aria-label={t("items.checklistSearch")}
              className={styles.searchInput}
            />
          </label>
          {(data?.languages.length ?? 0) > 1 && (
            <select
              value={language ?? data?.language ?? ""}
              onChange={(event) => setLanguage(event.target.value)}
              aria-label={t("items.checklistLanguage")}
              className={styles.select}
            >
              {data?.languages.map((code) => {
                const label = printLanguageLabel(code);
                return (
                  <option key={code} value={code}>
                    {label.flag} {label.name}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {data && masterSet && (data.untaggedOwned ?? 0) > 0 && (
          <p className={styles.untaggedHint}>
            {t("items.checklistUntaggedOwned", {
              count: data.untaggedOwned ?? 0,
            })}
          </p>
        )}
        {data &&
          !masterSet &&
          data.suggestMasterSet &&
          !masterSetSuggestDismissed && (
            <div className={styles.suggestMasterSet} role="status">
              <p className={styles.suggestMasterSetText}>
                {t("items.checklistMasterSetSuggest", {
                  count: data.multiFinishOwned ?? 0,
                })}
              </p>
              <div className={styles.suggestMasterSetActions}>
                <button
                  type="button"
                  className={styles.suggestMasterSetEnable}
                  onClick={() => {
                    setMasterSet(true);
                    setMasterSetSuggestDismissed(true);
                  }}
                >
                  {t("items.checklistMasterSetSuggestEnable")}
                </button>
                <button
                  type="button"
                  className={styles.suggestMasterSetDismiss}
                  onClick={() => setMasterSetSuggestDismissed(true)}
                >
                  {t("items.checklistMasterSetSuggestDismiss")}
                </button>
              </div>
            </div>
          )}
      </header>

      {isLoading && (
        <p className={styles.loading}>
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </p>
      )}

      {data && data.totals.total === 0 && !isLoading && (
        <p className={styles.empty}>{t("items.checklistEmpty")}</p>
      )}

      {data && data.sets.length > 0 && filteredSets.length === 0 && searchQuery && (
        <p className={styles.empty}>{t("items.checklistSearchNoResults")}</p>
      )}

      {data && filteredSets.length > 0 && (
        <section className={styles.group}>
          <ul className={styles.setList}>
            {filteredSets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                advice={adviceBySet.get(set.id)}
                expandable={
                  set.missing.length > 0 ||
                  showOwned ||
                  Boolean(searchQuery)
                }
                showOwned={showOwned}
                alwaysShowFinishLabels={alwaysShowFinishLabels}
                showPrices={showPrices}
                hideZeroSealedExpectation={hideZeroSealedExpectation}
                searchQuery={searchQuery}
                forceExpand={printing}
                t={t}
              />
            ))}
          </ul>
        </section>
      )}

      {/*
        Ce que le catalogue ne tient pas se dit, il ne se tait pas : un set
        absent n'est pas un set complet, et la check-list ne peut pas mesurer
        ce qu'elle ignore.
      */}
      {(data?.setsWithoutCatalogue.length ?? 0) > 0 &&
        (!searchQuery ||
          data!.setsWithoutCatalogue.some((set) =>
            checklistTextMatches(searchQuery, set.label, set.id),
          )) && (
        <section className={styles.group}>
          <h2 className={styles.groupTitle}>
            {t("items.checklistNoCatalogue")}
            <span className={styles.groupCount}>
              {
                data!.setsWithoutCatalogue.filter(
                  (set) =>
                    !searchQuery ||
                    checklistTextMatches(searchQuery, set.label, set.id),
                ).length
              }
            </span>
          </h2>
          <p className={styles.hint}>{t("items.checklistNoCatalogueHint")}</p>
          <ul className={styles.plainList}>
            {data!.setsWithoutCatalogue
              .filter(
                (set) =>
                  !searchQuery ||
                  checklistTextMatches(searchQuery, set.label, set.id),
              )
              .map((set) => (
                <li key={set.id}>{set.label}</li>
              ))}
          </ul>
        </section>
      )}
    </main>
    </TooltipPrimitive.Provider>
  );
}
