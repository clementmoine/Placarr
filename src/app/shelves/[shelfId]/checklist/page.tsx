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
} from "lucide-react";

import { formatChecklistMarkdown } from "@/core/collect/checklistMarkdown";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import { cn } from "@/lib/shared/utils";
import styles from "./checklist.module.css";

type ChecklistPrint = {
  printKey: string;
  reference: string;
  title: string;
  thumbnailUrl?: string | null;
  owned?: boolean;
};

type ChecklistSet = {
  id: string;
  label: string;
  group?: string | null;
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
  basis: string;
  imageUrl?: string | null;
  language?: string | null;
  languageMismatch?: boolean;
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
  /** `printKey` → centimes EUR, pour afficher le prix à côté de chaque manquante. */
  prices: Record<string, number>;
  /** `printKey` → produits scellés qui garantissent la carte. */
  sealedSources: Record<string, SealedPrintSource[]>;
  options: BuyOption[];
  plan: {
    buySinglesCount: number;
    buySinglesCents: number;
    sealedHoles: number;
    boostersExpected: number | null;
    boostersToComplete: number | null;
    recommendedSlug: string | null;
    preferSingles: boolean;
  };
};

type ChecklistResponse = {
  shelf: { id: string; name: string | null; slug: string | null };
  language: string | null;
  languages: string[];
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

/**
 * Miniature → aperçu agrandi au survol (portail : évite le clip
 * `overflow: hidden` des lignes de set / colonnes CSS).
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
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <img
          src={src}
          alt=""
          className={className}
          loading="lazy"
          decoding="async"
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
          <img src={src} alt="" className={styles.thumbPopoverImg} />
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
 * Résumé = **une** intention : singles en fin de set / chase, sinon reco
 * scellé + volume. Pas de teaser display quand `preferSingles`.
 */
function Advice({
  advice,
  t,
}: {
  advice: SetAdvice;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  const { singles, options, plan } = advice;
  const recommended =
    options.find((option) => option.slug === plan.recommendedSlug) ?? null;
  /*
    Fin de set / chase : pas de teaser booster — ça faisait lire « Recommandé
    · display » alors que le plan dit singles.
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

  /** Au plus 2–3 bribes ; le reste est dans le détail. */
  const briefParts: string[] = [];
  if (plan.preferSingles && plan.buySinglesCount > 0) {
    briefParts.push(
      t("items.checklistAdviceBriefBuySingles", {
        count: plan.buySinglesCount,
        price: euros(plan.buySinglesCents),
      }),
    );
  } else if (teaser != null) {
    briefParts.push(teaser.name);
  }
  if (hasVolume) {
    briefParts.push(
      t("items.checklistAdviceBriefBoostersToComplete", {
        boosters: plan.boostersToComplete!,
      }),
    );
  }
  if (singles.priced > 0 && !(plan.preferSingles && plan.buySinglesCount > 0)) {
    briefParts.push(
      t("items.checklistAdviceBriefSingles", {
        price: euros(singles.totalCents),
      }),
    );
  } else if (singles.unpriced > 0 && briefParts.length === 0) {
    briefParts.push(
      t("items.checklistAdviceBriefUnpriced", { count: singles.unpriced }),
    );
  }
  if (briefParts.length === 0) {
    briefParts.push(t("items.checklistNoAdvice"));
  }
  const brief = briefParts.join(" · ");

  const listedOptions = (() => {
    /*
      Un known_bundle déjà couvert (DVD Vol.3 → TA-214 possédée) sort
      `newCards: 0` + `certainty: exact` — ce n'est **pas** une option utile.
      Ne garder que ce qui apporte au moins une carte neuve.
    */
    const useful = options.filter((option) => option.newCards > 0);
    if (plan.preferSingles) return useful.slice(0, 5);
    const head = recommended ? [recommended] : [];
    const rest = useful.filter((option) => option.slug !== recommended?.slug);
    return [...head, ...rest].slice(0, 5);
  })();

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
            {recommended != null && (
              <span className={styles.badge}>
                {t("items.checklistRecommended")}
              </span>
            )}
            {plan.preferSingles && plan.buySinglesCount > 0 && (
              <span className={styles.badge}>
                {t("items.checklistRecommended")}
              </span>
            )}
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
          <div className={styles.adviceCols}>
            <div className={styles.adviceCol}>
              <h3 className={styles.adviceTitle}>
                {t("items.checklistSingles")}
              </h3>
              {plan.buySinglesCount > 0 && (
                <p className={styles.adviceNote}>
                  {t("items.checklistPlanSingles", {
                    count: plan.buySinglesCount,
                    price: euros(plan.buySinglesCents),
                  })}
                </p>
              )}
              {singles.priced > 0 && (
                <p className={styles.adviceTotal}>
                  {t("items.checklistSinglesTotal", {
                    price: euros(singles.totalCents),
                  })}
                </p>
              )}
              {singles.expensiveCount > 0 && (
                <p className={styles.adviceNote}>
                  {t("items.checklistCliff", {
                    cheapCount: singles.cheapCount,
                    cheapPrice: euros(singles.cheapCents),
                    expensiveCount: singles.expensiveCount,
                    expensivePrice: euros(singles.expensiveCents),
                  })}
                </p>
              )}
              {singles.medianCents != null && (
                <p className={styles.adviceNote}>
                  {t("items.checklistMedian", {
                    price: euros(singles.medianCents),
                  })}
                </p>
              )}
              {singles.unpriced > 0 && (
                <p className={styles.adviceWarn}>
                  {t("items.checklistUnpriced", { count: singles.unpriced })}
                </p>
              )}
              {singles.priced === 0 &&
                singles.unpriced === 0 &&
                plan.buySinglesCount === 0 && (
                  <p className={styles.adviceNote}>
                    {t("items.checklistNoSinglesAdvice")}
                  </p>
                )}
            </div>

            <div className={styles.adviceCol}>
              <h3 className={styles.adviceTitle}>
                {t("items.checklistSealed")}
              </h3>
              {plan.preferSingles ? (
                <p className={styles.adviceNote}>
                  {t("items.checklistSealedNotRecommended")}
                </p>
              ) : hasSplitVolume ? (
                <p className={styles.adviceNote}>
                  {t("items.checklistPlanBoosters", {
                    holes: plan.sealedHoles,
                    boosters: plan.boostersExpected!,
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
              ) : null}
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
                    <span
                      className={cn(
                        styles.optionGain,
                        option.certainty === "exact" && styles.optionExact,
                        option.languageMismatch && styles.optionMuted,
                      )}
                      title={option.basis}
                    >
                      {t("items.checklistNewCards", {
                        count: option.newCards,
                      })}
                      {" · "}
                      {t(
                        option.certainty === "exact"
                          ? "items.checklistExact"
                          : option.certainty === "atLeast"
                            ? "items.checklistAtLeast"
                            : "items.checklistEstimated",
                      )}
                    </span>
                    {option.priceCents != null && (
                      <span className={styles.optionPrice}>
                        {euros(option.priceCents)}
                      </span>
                    )}
                    {option.centsPerNewCard != null && (
                      <span className={styles.optionPerCard}>
                        {t("items.checklistPerCard", {
                          price: euros(option.centsPerNewCard),
                        })}
                      </span>
                    )}
                    {recommended != null && option.slug === recommended.slug && (
                      <span className={styles.badge}>
                        {t("items.checklistRecommended")}
                      </span>
                    )}
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
  searchQuery,
  forceExpand,
  t,
}: {
  set: ChecklistSet;
  advice?: SetAdvice;
  expandable: boolean;
  showOwned: boolean;
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

  const listOpen = forceExpand || (searching ? rows.length > 0 : open);
  const prices = advice?.prices ?? {};
  const sealedSources = advice?.sealedSources ?? {};
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
      {advice && listOpen && !searching && <Advice advice={advice} t={t} />}

      {listOpen && rows.length > 0 && (
        <ol className={cn(styles.missing, styles.missingOpen)}>
          {rows.map((row) => {
            const priceCents = row.owned ? null : (prices[row.printKey] ?? null);
            const sources = row.owned
              ? []
              : (sealedSources[row.printKey] ?? []);
            const sealedLabel =
              sources.length > 0
                ? sources.map((source) => source.name).join(" · ")
                : "";
            return (
              <li
                key={row.printKey}
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
    Par défaut : manquantes seulement — la liste à chasser. Cocher le
    toggle pour revoir aussi ce qui est déjà sur l'étagère.
  */
  const [showOwned, setShowOwned] = useState(false);
  const [search, setSearch] = useState("");
  /** Déplie tous les sets le temps d'imprimer (sinon les cartes ne sont pas dans le DOM). */
  const [printing, setPrinting] = useState(false);
  const searchQuery = useMemo(
    () => normalizeChecklistQuery(search),
    [search],
  );

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
    queryKey: ["checklist", shelfId, language],
    queryFn: async (): Promise<ChecklistResponse> => {
      const params = new URLSearchParams();
      if (language) params.set("language", language);
      const query = params.toString();
      const url = `/api/shelves/${encodeURIComponent(shelfId)}/checklist${
        query ? `?${query}` : ""
      }`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as ChecklistResponse;
    },
    enabled: Boolean(shelfId),
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
    const markdown = formatChecklistMarkdown({
      shelfName: data.shelf.name,
      language: data.language,
      languageLabel,
      totals: data.totals,
      includeOwned: true,
      sets: data.sets.map((set) => ({
        label: set.label,
        owned: set.owned,
        total: set.total,
        completion: set.completion,
        cards: (set.cards ?? []).map((card) => ({
          reference: card.reference,
          title: card.title,
          owned: Boolean(card.owned),
        })),
      })),
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
  }, [data]);

  return (
    <TooltipPrimitive.Provider
      delayDuration={220}
      skipDelayDuration={0}
      disableHoverableContent
    >
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headBar}>
          <Link
            href={`/shelves/${encodeURIComponent(shelfId)}`}
            className={styles.back}
          >
            <ArrowLeft className="size-4" aria-hidden />
            {data?.shelf.name ?? ""}
          </Link>

          <div className={styles.actions}>
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
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={showOwned}
                onChange={(event) => setShowOwned(event.target.checked)}
              />
              {t("items.checklistShowOwned")}
            </label>

            <button
              type="button"
              onClick={downloadMarkdown}
              className={styles.exportMd}
              disabled={!data || data.totals.total === 0}
            >
              <FileDown className="size-4" aria-hidden />
              {t("items.checklistExportMarkdown")}
            </button>

            <button
              type="button"
              onClick={() => {
                flushSync(() => setPrinting(true));
                window.print();
                setPrinting(false);
              }}
              className={styles.print}
            >
              <Printer className="size-4" aria-hidden />
              {t("items.checklistPrint")}
            </button>
          </div>
        </div>

        <h1 className={styles.title}>{t("items.checklistTitle")}</h1>
        <p className={styles.subtitle}>{t("items.checklistSubtitle")}</p>

        {data && (
          <div className={styles.totals}>
            <strong>
              {t("items.checklistOwnedOf", {
                owned: data.totals.owned,
                total: data.totals.total,
              })}
            </strong>
            <CompletionBar value={data.totals.completion} />
            <span>{data.totals.completion}%</span>
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
