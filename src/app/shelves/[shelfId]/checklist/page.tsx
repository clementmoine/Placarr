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
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
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
  checklistShouldShowFinish,
} from "@/core/collect/checklist";
import { pullRateRank, pullRateScale } from "@/core/collect/buyPlan/pullRates";
import {
  checklistSetsForMarkdown,
  formatChecklistMarkdown,
} from "@/core/collect/checklistMarkdown";
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
import { Advice as AdvicePanel, type SetAdvice } from "./AdvicePanel";
import { ChecklistHoverThumb } from "./ChecklistHoverThumb";

type ChecklistPrint = {
  printKey: string;
  reference: string;
  title: string;
  thumbnailUrl?: string | null;
  owned?: boolean;
  /** Présent en mode master set — une ligne par finition. */
  finish?: string | null;
  landscapeFace?: boolean;
  faceQuarterTurns?: 0 | 1 | 2 | 3;
  landscapePrint?: boolean;
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

function normalizeChecklistQuery(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
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

function Advice(props: {
  advice: SetAdvice;
  cards: readonly ChecklistPrint[];
  hideZeroSealedExpectation: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return <AdvicePanel {...props} />;
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
  const imputedPrices = advice?.imputedPrices ?? {};
  const sealedSources = advice?.sealedSources ?? {};
  const packsPerHit = advice?.packsPerHit ?? {};
  /* Niveaux de rareté relatifs au set (rang parmi ses « 1 sur N »). */
  const rateScale = useMemo(() => pullRateScale(packsPerHit), [packsPerHit]);
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
            const priceImputed =
              priceCents != null && imputedPrices[row.printKey] === true;
            const sources = sealedSources[row.printKey] ?? [];
            const rate = showPrices
              ? (packsPerHit[row.printKey] ?? null)
              : null;
            const rarity = rate != null ? pullRateRank(rate, rateScale) : null;
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
                  className={cn(
                    styles.checkbox,
                    row.owned && styles.checkboxOn,
                  )}
                  aria-hidden
                />
                {row.thumbnailUrl ? (
                  <ChecklistHoverThumb
                    src={row.thumbnailUrl}
                    className={styles.thumb}
                    landscapeFace={row.landscapeFace}
                    faceQuarterTurns={row.faceQuarterTurns}
                    landscapePrint={row.landscapePrint}
                  />
                ) : (
                  <span className={styles.thumbPlaceholder} aria-hidden />
                )}
                <span className={styles.ref}>{row.reference}</span>
                <span className={styles.name}>{row.title}</span>
                <span className={styles.cardMeta}>
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
                          {sources
                            .slice(0, 3)
                            .map((source) =>
                              source.imageUrl ? (
                                <ChecklistHoverThumb
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
                  {rate != null && rarity != null && (
                    <span
                      className={styles.cardRarity}
                      style={
                        {
                          "--fill": `${Math.round(rarity.position * 100)}%`,
                        } as CSSProperties
                      }
                      title={t("items.checklistPullRate", {
                        rank: rarity.rank,
                        count: rarity.count,
                        packs: rate,
                      })}
                      aria-label={t("items.checklistPullRate", {
                        rank: rarity.rank,
                        count: rarity.count,
                        packs: rate,
                      })}
                    />
                  )}
                  {priceCents != null && (
                    <span
                      className={cn(
                        styles.cardPrice,
                        priceImputed && styles.cardPriceImputed,
                      )}
                      title={
                        priceImputed
                          ? t("items.checklistPriceImputedTitle")
                          : undefined
                      }
                    >
                      {priceImputed
                        ? `~${euros(priceCents)}`
                        : euros(priceCents)}
                    </span>
                  )}
                </span>
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
  const [showOwned, setShowOwned] = useState(DEFAULT_CHECKLIST_PREFS.showOwned);
  /*
    Master set : chaque finition (normale / foil / …) est une case. Posséder
    la foil ne coche pas la normale. Off par défaut en début de licence ;
    mémorisé par étagère.
  */
  const [masterSet, setMasterSet] = useState(DEFAULT_CHECKLIST_PREFS.masterSet);
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
  const searchQuery = useMemo(() => normalizeChecklistQuery(search), [search]);

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
      if (checklistTextMatches(searchQuery, set.label, set.group, set.id)) {
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
    const languageLabel = langCode ? printLanguageLabel(langCode).name : null;
    const setsForMd = data.sets.map((set) => {
      if (!showPrices) return set;
      const advice = adviceBySet.get(set.id);
      const prices = advice?.prices;
      if (!prices || Object.keys(prices).length === 0) return set;
      const imputed = advice?.imputedPrices ?? {};
      const labels: Record<string, string> = {};
      for (const [printKey, cents] of Object.entries(prices)) {
        if (typeof cents === "number" && Number.isFinite(cents)) {
          labels[printKey] =
            imputed[printKey] === true
              ? `~${euros(cents)}`
              : euros(cents);
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
  }, [data, showOwned, alwaysShowFinishLabels, showPrices, adviceBySet, t]);

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

        {data &&
          data.sets.length > 0 &&
          filteredSets.length === 0 &&
          searchQuery && (
            <p className={styles.empty}>
              {t("items.checklistSearchNoResults")}
            </p>
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
                    set.missing.length > 0 || showOwned || Boolean(searchQuery)
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
              <p className={styles.hint}>
                {t("items.checklistNoCatalogueHint")}
              </p>
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
