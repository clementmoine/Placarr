"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { BaseModal } from "@/components/modals/BaseModal";
import { FoilCardImage } from "@/components/FoilCardImage";
import { OrientedMediaFrame } from "@/components/OrientedMediaFrame";
import { RemoteImage } from "@/components/RemoteImage";
import { expandPrintCandidatesByFinish } from "@/core/enrich/variants";
import { parsePrintKey } from "@/core/identify/printKey";
import {
  variantRendering,
  type PrintVariantInfo,
} from "@/lib/client/hooks/usePrintVariant";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { localizeFinishLabel } from "@/lib/text/finishLabel";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import { cn } from "@/lib/shared/utils";
import "@/effects";

/** Mirrors `PrintCandidate` from the provider contract, minus server-only bits. */
export type PrintCandidateView = {
  printKey: string;
  /** Le catalogue d'où sort ce tirage, estampillé par le cœur. */
  providerId?: string | null;
  /** L'extension seule, quand le catalogue la nomme. */
  setLabel?: string | null;
  title: string;
  reference: string;
  rarity?: string | null;
  category?: string | null;
  faceQuarterTurns?: 0 | 1 | 2 | 3;
  landscapeFace?: boolean;
  landscapePrint?: boolean;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  language?: string | null;
  finishes?: string[];
  plainFinishes?: string[];
  effectPack?: string | null;
  finishShaders?: Record<string, string>;
  finishFoilMaskUrls?: Record<string, string>;
  varnishShaders?: Record<string, string>;
  varnishType?: string | null;
  varnishColor?: string | null;
  secondVarnishMaskUrl?: string | null;
  secondVarnishColor?: string | null;
  /** Per-finish front art when Live / provider dumps differ by treatment. */
  variantImageUrls?: Record<string, string>;
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
};

/** Ce que l'étagère tient déjà, pour le dire avant qu'on rachète en double. */
export type OwnedPrintRef = {
  printKey?: string | null;
  variant?: string | null;
  /** Sans elle, posséder l'Inari française disait posséder l'イナリ japonaise. */
  language?: string | null;
};

type PrintPickerModalProps = {
  shelfId: string;
  shelfType: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called once the item exists, so the shelf can refetch. */
  onAdded: () => void;
  /**
   * Les tirages déjà rangés sur cette étagère. Passés par la page plutôt que
   * refetchés : elle les a déjà, et deux sources divergeraient à la première
   * carte ajoutée.
   */
  ownedPrints?: readonly OwnedPrintRef[];
};

/**
 * `naruto:cl-0004` + `fr` + `holo` → une clé de comparaison stable.
 *
 * La langue en fait partie depuis le 2026-08-21. Une clé de tirage vaut pour
 * toutes ses localisations — 898 clés Naruto et 19 673 clés Pokémon en portent
 * plusieurs — si bien que posséder l'Inari française marquait l'イナリ
 * japonaise « déjà dans l'étagère ». Ce sont deux cartes.
 */
function ownedRowKey(
  printKey: string,
  variant: string | null,
  language: string | null,
): string {
  return [
    printKey.trim().toLowerCase(),
    (language ?? "").trim().toLowerCase(),
    (variant ?? "").trim().toLowerCase(),
  ].join("|");
}

/** Une ligne du sélecteur : un tirage et une finition. */
type PickerFinishRow = ReturnType<
  typeof expandPrintCandidatesByFinish<PrintCandidateView>
>[number];

/** Long enough that typing a card name is one request, not eight. */
const SEARCH_DEBOUNCE_MS = 300;

/** Valeur du filtre quand aucune langue n'est imposée. */
const ALL_LANGUAGES = "__all__";

/** Idem pour le catalogue : aucun jeu imposé. */
const ALL_CATALOGUES = "__all__";

/** Et pour l'extension : tout le jeu choisi. */
const ALL_SETS = "__all__";

/**
 * Le plafond que la route accepte (`MAX_LIMIT`), demandé explicitement.
 *
 * Sans ce paramètre on retombait sur vingt-quatre. Ce n'était pas qu'une
 * troncature : les résultats arrivent classés langue préférée d'abord, si bien
 * qu'une recherche large ne rendait que du français, et le filtre de langue
 * n'avait plus rien à filtrer.
 */
const SEARCH_RESULT_LIMIT = 48;

function rowArtUrl(
  candidate: PrintCandidateView,
  finish: string | null,
): string | null {
  if (finish && candidate.variantImageUrls?.[finish]) {
    return candidate.variantImageUrls[finish]!;
  }
  return candidate.thumbnailUrl ?? candidate.imageUrl ?? null;
}

/**
 * The picture the created item keeps — full art first, thumbnail only as a
 * fallback. {@link rowArtUrl} is the opposite on purpose: it feeds a small
 * grid tile. Storing that tile made the item page show a 200x286 thumbnail
 * blown up to card size, visibly pixelated, while the full face sat unused
 * next to it.
 */
function candidateCoverUrl(
  candidate: PrintCandidateView,
  finish: string | null,
): string | null {
  if (finish && candidate.variantImageUrls?.[finish]) {
    return candidate.variantImageUrls[finish]!;
  }
  return candidate.imageUrl ?? candidate.thumbnailUrl ?? null;
}

function candidateAsVariantInfo(
  candidate: PrintCandidateView,
): PrintVariantInfo {
  return {
    finishes: candidate.finishes,
    plainFinishes: candidate.plainFinishes,
    effectPack: candidate.effectPack,
    finishShaders: candidate.finishShaders,
    finishFoilMaskUrls: candidate.finishFoilMaskUrls,
    varnishShaders: candidate.varnishShaders,
    varnishType: candidate.varnishType,
    varnishColor: candidate.varnishColor,
    secondVarnishMaskUrl: candidate.secondVarnishMaskUrl,
    secondVarnishColor: candidate.secondVarnishColor,
    variantImageUrls: candidate.variantImageUrls,
    foilMaskUrl: candidate.foilMaskUrl,
    varnishMaskUrl: candidate.varnishMaskUrl,
    faceQuarterTurns: candidate.faceQuarterTurns,
    landscapeFace: candidate.landscapeFace,
    landscapePrint: candidate.landscapePrint,
  };
}

/**
 * Tile art: CSS foil when the pack has a recipe + mask (Lorcana today; Pokémon
 * when its CSS path is ready). Plain finishes stay on a static image.
 */
function PrintPickerTileArt({
  candidate,
  finish,
}: {
  candidate: PrintCandidateView;
  finish: string | null;
}) {
  const fallback = rowArtUrl(candidate, finish);
  const view = variantRendering(
    finish,
    candidateAsVariantInfo(candidate),
    fallback,
  );
  const art = view.imageUrl ?? fallback;
  if (!art) return null;

  if (view.foilMaskUrl && (view.shader || view.varnish)) {
    return (
      <FoilCardImage
        effectPack={view.effectPackId}
        printKey={candidate.printKey}
        title={candidate.title}
        imageUrl={art}
        alt={candidate.title}
        finish={view.finish}
        varnishType={view.varnishType}
        cssFinishShaderId={view.shader?.id ?? null}
        cssVarnishShaderId={view.varnish?.id ?? null}
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
    );
  }

  return (
    <RemoteImage
      src={art}
      alt={candidate.title}
      fill
      sizes="(max-width: 640px) 45vw, 180px"
      className="object-cover"
    />
  );
}

/**
 * Add flow for shelves that cannot be scanned.
 *
 * A card carries no barcode, and its name is not an answer either — five
 * Lorcana prints are called "Chiot dalmatien". So the user searches, then picks
 * a *printing × finish*: reference, rarity, artwork and finish tag are what
 * tell otherwise identical rows apart.
 */
export function PrintPickerModal({
  shelfId,
  shelfType,
  isOpen,
  onClose,
  onAdded,
  ownedPrints,
}: PrintPickerModalProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PrintCandidateView[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [language, setLanguage] = useState<string>(ALL_LANGUAGES);
  const [catalogue, setCatalogue] = useState<string>(ALL_CATALOGUES);
  const [setId, setSetId] = useState<string | null>(null);
  const [catalogues, setCatalogues] = useState<
    readonly {
      id: string;
      label: string;
      sets?: {
        id: string;
        label: string;
        group?: string;
        languages?: string[];
      }[];
      languages?: string[];
    }[]
  >([]);
  const [isMultiple, setIsMultiple] = useState(false);
  /**
   * Ce qui est coché, **avec les données de chaque ligne**.
   *
   * On ne retenait que les clés. Elles survivaient bien au changement de
   * filtre, mais l'ajout ne portait que sur leur intersection avec l'écran :
   * cocher dans la Série 1, passer à la Série 2, puis valider n'ajoutait que
   * la seconde moitié — silencieusement. Une ligne filtrée n'a plus de titre
   * ni de finition à poster, donc on garde la ligne elle-même.
   */
  const [selected, setSelected] = useState<
    ReadonlyMap<string, PickerFinishRow>
  >(new Map());
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  /*
    Deux niveaux, parce qu'ils ne disent pas la même chose : la finition exacte
    est déjà là, ou bien c'est une **autre** finition de la même carte — ce qui
    intéresse un collectionneur qui cherche justement la brillante.
  */
  const owned = useMemo(() => {
    const exact = new Set<string>();
    const anyFinish = new Set<string>();
    const games = new Set<string>();
    for (const row of ownedPrints ?? []) {
      const key = row.printKey?.trim().toLowerCase();
      if (!key) continue;
      exact.add(ownedRowKey(key, row.variant ?? null, row.language ?? null));
      anyFinish.add(key);
      const game = parsePrintKey(key)?.game;
      if (game) games.add(game);
    }
    /*
      Le jeu de l'étagère, déduit de ce qu'elle contient — rien ne le porte
      ailleurs : `Shelf` n'a qu'un `type` (`tcg`), commun à tous les jeux de
      cartes. On ne conclut que si l'étagère est **unanime** ; une étagère mixte
      ou vide n'impose rien.
    */
    return {
      exact,
      anyFinish,
      game: games.size === 1 ? [...games][0]! : null,
    };
  }, [ownedPrints]);

  /** Aborts the previous search so a slow response cannot overwrite a newer one. */
  const searchAbort = useRef<AbortController | null>(null);

  /** Reset on the way out, not in an effect watching `isOpen`. */
  const handleClose = useCallback(() => {
    searchAbort.current?.abort();
    setQuery("");
    setCandidates([]);
    setHasSearched(false);
    setError(null);
    setAddingKey(null);
    setSelected(new Map());
    setLanguage(ALL_LANGUAGES);
    setCatalogue(ALL_CATALOGUES);
    setSetId(null);
    setProgress(null);
    onClose();
  }, [onClose]);

  const trimmedQuery = query.trim();

  /*
    Les catalogues et leurs extensions sont chargés **à l'ouverture**, pas
    dérivés des résultats : c'est ce qui permet de choisir « la Série 1 » avant
    d'avoir la moindre idée de quoi y chercher. Dérivée des résultats, la liste
    était vide tant qu'on n'avait rien tapé, puis ne montrait que les extensions
    tombées dans la page — jamais un set entier.
  */
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void (async () => {
      try {
        /*
          La langue part avec la demande : chez Naruto elle change la **découpe**
          annoncée — les dix-sept 巻ノ japonais au lieu des séries européennes —
          et pas seulement les libellés. Sans elle, choisir « japonais » ne
          donnait jamais accès aux volumes.
        */
        const response = await fetch(
          `/api/prints?type=${encodeURIComponent(shelfType)}${
            language !== ALL_LANGUAGES
              ? `&language=${encodeURIComponent(language)}`
              : ""
          }`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          catalogues?: {
            id: string;
            label: string;
            sets?: {
              id: string;
              label: string;
              group?: string;
              languages?: string[];
            }[];
            languages?: string[];
          }[];
        };
        if (data.catalogues?.length) setCatalogues(data.catalogues);
      } catch {
        // Le sélecteur reste au minimum ; la recherche, elle, marche toujours.
      }
    })();
    return () => controller.abort();
  }, [isOpen, shelfType, language]);

  /*
    Les extensions que la langue choisie laisse voir.

    Une série européenne n'a jamais paru en japonais, ni un 巻ノ en français :
    les filtrer sur la langue **retire les découpes qui n'existent pas** dans
    cette langue, au lieu d'offrir un choix qui ne rendrait rien. Une extension
    qui n'annonce pas ses langues n'est jamais masquée — on ne cache pas ce
    qu'on ne sait pas.

    On lit la langue **brute** et non `activeLanguage` : celle-ci se dérive des
    résultats, qui dépendent de l'extension retenue, qui dépend de cette liste.
    Le cycle se refermerait, et rien ne pourrait se déclarer.
  */
  const visibleCatalogues = useMemo(() => {
    if (language === ALL_LANGUAGES) return catalogues;
    return (
      catalogues
        /*
          Le **catalogue** tranche en premier : un jeu qui annonce ses langues
          et n'a pas celle-ci disparaît entièrement, quoi que disent ses
          extensions. Fusion World n'est sorti qu'en anglais et en japonais ; le
          garder sous « français » parce que ses extensions ne disent rien
          revenait à ne rien filtrer du tout.
        */
        .filter(
          (row) => !row.languages?.length || row.languages.includes(language),
        )
        /*
          Puis les extensions, pour les jeux dont les **découpes** diffèrent
          selon le marché : le Naruto Carddass est sorti en français comme en
          japonais, mais ses 巻ノ sont japonais et ses Séries européennes. Une
          extension muette est gardée — on ne masque que le su.
        */
        .map((row) => ({
          ...row,
          sets: (row.sets ?? []).filter(
            (set) => !set.languages?.length || set.languages.includes(language),
          ),
        }))
    );
  }, [catalogues, language]);

  /**
   * Les extensions du jeu retenu, groupées par découpe.
   *
   * Vide tant qu'aucun jeu n'est choisi : c'est ce qui rend la seconde liste
   * courte. Une liste de toutes les extensions de tous les jeux est exactement
   * celle qu'on vient de casser en deux.
   */
  const catalogueCuts = useMemo(() => {
    const row =
      catalogue === ALL_CATALOGUES
        ? null
        : visibleCatalogues.find((entry) => entry.id === catalogue);
    type CatalogueSet = NonNullable<
      (typeof visibleCatalogues)[number]["sets"]
    >[number];
    const cuts = new Map<string, CatalogueSet[]>();
    for (const set of row?.sets ?? []) {
      const key = set.group ?? "";
      cuts.set(key, [...(cuts.get(key) ?? []), set]);
    }
    return cuts;
  }, [visibleCatalogues, catalogue]);

  const catalogueSets = useMemo(
    () => [...catalogueCuts.values()].flat(),
    [catalogueCuts],
  );

  /*
    L'extension retenue est **dérivée**, comme la langue : une extension que le
    filtre de langue vient de faire disparaître cesse d'être retenue, sans qu'un
    effet ait à la remettre à zéro. Écrite dans un effet, elle laissait la
    requête bornée à un set invisible le temps d'un rendu — un filtre qu'on ne
    peut plus relâcher parce qu'on ne le voit plus.
  */
  const activeSetId =
    setId && catalogueSets.some((set) => set.id === setId) ? setId : null;

  useEffect(() => {
    /*
      Une extension choisie est une question complète — « montre-moi la Série 1 »
      — même sans mot-clé. C'est tout l'intérêt du sélecteur : parcourir un set
      qu'on ne sait pas encore nommer.
    */
    if (!trimmedQuery && !activeSetId) {
      searchAbort.current?.abort();
      return;
    }

    const timer = setTimeout(async () => {
      searchAbort.current?.abort();
      const controller = new AbortController();
      searchAbort.current = controller;
      setIsSearching(true);
      setError(null);

      try {
        /*
          Une famille compte des centaines de cartes, et le plafond par défaut
          est de vingt-quatre. Ce n'est pas qu'une troncature : les résultats
          arrivent classés langue préférée d'abord, donc à vingt-quatre lignes
          une recherche large ne rendait que du français — et le filtre de
          langue n'avait plus rien à filtrer.
        */
        /*
          Le catalogue part avec la requête plutôt que de filtrer après coup :
          les places du plafond reviennent alors **toutes** au jeu demandé, au
          lieu d'être partagées avec des catalogues qu'on ne regarde pas.
        */
        const params = new URLSearchParams({
          type: shelfType,
          limit: String(SEARCH_RESULT_LIMIT),
        });
        if (trimmedQuery) params.set("q", trimmedQuery);
        if (catalogue !== ALL_CATALOGUES) params.set("catalogue", catalogue);
        if (activeSetId) params.set("set", activeSetId);
        /*
          La langue part aussi : une extension japonaise ne se lit pas dans la
          même colonne qu'une série européenne, et le serveur a besoin de savoir
          dans quelle découpe l'identifiant demandé s'entend.
        */
        if (language !== ALL_LANGUAGES) params.set("language", language);
        const response = await fetch(`/api/prints?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as {
          candidates?: PrintCandidateView[];
          catalogues?: { id: string; label: string; languages?: string[] }[];
        };
        setCandidates(data.candidates ?? []);
        if (data.catalogues?.length) setCatalogues(data.catalogues);
        setHasSearched(true);
      } catch (caught) {
        if ((caught as Error)?.name === "AbortError") return;
        setError(t("errors.genericMessage"));
        setCandidates([]);
        setHasSearched(true);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmedQuery, shelfType, catalogue, activeSetId, language, t]);

  /**
   * Derived rather than cleared by an effect: an empty box shows nothing, and a
   * stale list never flashes between two queries.
   */
  const pickerRows = useMemo(
    () =>
      expandPrintCandidatesByFinish(
        trimmedQuery || activeSetId ? candidates : [],
      ),
    [trimmedQuery, activeSetId, candidates],
  );

  /*
    Les langues proposées sortent des résultats eux-mêmes. Une liste écrite en
    dur mentirait dès qu'un jeu sortirait dans une langue de plus — et elle
    afficherait des choix qui ne rendent rien.
  */
  const languages = useMemo(() => {
    const found = new Set<string>();
    /*
      Ce que les catalogues **annoncent** vient en premier : c'est ce qui rend
      la langue choisissable avant la première recherche. Elle en a besoin —
      chez Naruto elle décide de la découpe des extensions, et la déduire des
      résultats obligeait à chercher en japonais pour pouvoir choisir le
      japonais.
    */
    for (const row of catalogues) {
      if (catalogue !== ALL_CATALOGUES && !catalogue.startsWith(row.id))
        continue;
      for (const code of row.languages ?? []) {
        const trimmed = code.trim().toLowerCase();
        if (trimmed) found.add(trimmed);
      }
    }
    // Ce que les résultats montrent s'y ajoute : un pack muet reste utilisable.
    for (const row of pickerRows) {
      const code = row.language?.trim().toLowerCase();
      if (code) found.add(code);
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [catalogues, catalogue, pickerRows]);

  /*
    Le filtre est **dérivé**, pas remis à zéro par un effet : une langue qui ne
    figure plus dans les résultats retomberait sinon sur un écran vide le temps
    d'un rendu, et la remettre en état demanderait d'écrire dans un effet ce
    qu'un calcul dit déjà.
  */
  const activeLanguage =
    language !== ALL_LANGUAGES && languages.includes(language)
      ? language
      : ALL_LANGUAGES;

  const visibleRows = useMemo(() => {
    const byLanguage =
      activeLanguage === ALL_LANGUAGES
        ? pickerRows
        : pickerRows.filter(
            (row) => row.language?.trim().toLowerCase() === activeLanguage,
          );
    // L'extension borne déjà la requête côté serveur : rien à refiltrer ici.
    const rows = byLanguage;
    if (!owned.game) return rows;
    /*
      La recherche interroge **tous** les jeux de cartes du type `tcg` : sur une
      étagère Naruto, « inari » remontait onze cartes Lorcana avant la bonne,
      « Illuminarium » contenant « inari ».

      On classe, on ne cache pas — même doctrine que les jaquettes d'une autre
      console : une étagère peut légitimement mélanger des jeux, et masquer
      rendrait une carte réelle inaccessible. Le tri est stable, donc l'ordre de
      pertinence rendu par le provider est conservé à l'intérieur de chaque camp.
    */
    return [...rows].sort((a, b) => {
      const aMine = parsePrintKey(a.printKey)?.game === owned.game ? 0 : 1;
      const bMine = parsePrintKey(b.printKey)?.game === owned.game ? 0 : 1;
      return aMine - bMine;
    });
  }, [pickerRows, activeLanguage, owned.game]);

  /*
    La sélection, elle, ne dépend **plus** de ce qui est à l'écran : cocher
    dans un set, changer de filtre, cocher ailleurs, puis valider ajoute les
    deux. Elle ne portait avant que sur l'intersection avec les lignes
    affichées, si bien que la première moitié disparaissait sans un mot.
  */
  const activeSelection = useMemo(() => [...selected.values()], [selected]);

  /*
    Un POST par carte, comme l'ajout unitaire. `/api/items/batch` ne prend que
    des **noms** et re-résout le tirage : il perdrait la finition choisie et
    pourrait retomber sur un autre tirage du même nom — exactement ce que ce
    sélecteur existe pour éviter.
  */
  const postRow = useCallback(
    async (candidate: PrintCandidateView, finish: string | null) => {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shelfId,
          name: candidate.title,
          printKey: candidate.printKey,
          variant: finish,
          language: candidate.language ?? null,
          imageUrl: candidateCoverUrl(candidate, finish),
          condition: "used",
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
    },
    [shelfId],
  );

  const addRow = useCallback(
    async (
      candidate: PrintCandidateView,
      finish: string | null,
      rowKey: string,
    ) => {
      setAddingKey(rowKey);
      setError(null);
      try {
        await postRow(candidate, finish);
        onAdded();
        handleClose();
      } catch {
        setError(t("errors.genericMessage"));
      } finally {
        setAddingKey(null);
      }
    },
    [postRow, onAdded, handleClose, t],
  );

  const toggleRow = useCallback((row: PickerFinishRow) => {
    setSelected((current) => {
      const next = new Map(current);
      if (!next.delete(row.rowKey)) next.set(row.rowKey, row);
      return next;
    });
  }, []);

  /*
    Séquentiel, et une carte ratée n'arrête pas les autres : on rend compte du
    nombre d'échecs à la fin plutôt que de laisser un lot à moitié posé sans
    rien dire. `onAdded()` n'est appelé qu'une fois, quand tout est retombé.
  */
  const addSelected = useCallback(async () => {
    const rows = activeSelection;
    if (rows.length === 0) return;
    setError(null);
    setProgress({ done: 0, total: rows.length });
    let failed = 0;
    for (const [index, row] of rows.entries()) {
      try {
        await postRow(row, row.finish);
      } catch {
        failed += 1;
      }
      setProgress({ done: index + 1, total: rows.length });
    }
    setProgress(null);
    onAdded();
    if (failed > 0) {
      setError(t("items.printPicker.partialFailure", { failed }));
      setSelected(new Map());
      return;
    }
    handleClose();
  }, [activeSelection, postRow, onAdded, handleClose, t]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      title={t("items.printPicker.title")}
      description={t("items.printPicker.description")}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {isMultiple && activeSelection.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Map())}
              disabled={Boolean(progress)}
              className="rounded-xl h-10 px-4 text-sm font-bold border border-border bg-card hover:bg-accent cursor-pointer disabled:opacity-60"
            >
              {t("items.printPicker.clearSelection")}
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            disabled={Boolean(progress)}
            className="rounded-xl h-10 px-4 text-sm font-bold border border-border bg-card hover:bg-accent cursor-pointer disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
          {isMultiple && (
            <button
              type="button"
              onClick={() => void addSelected()}
              disabled={activeSelection.length === 0 || Boolean(progress)}
              className="inline-flex items-center gap-2 rounded-xl h-10 px-4 text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              {progress && <Loader2 className="size-4 animate-spin" />}
              {progress
                ? t("items.printPicker.addingProgress", {
                    done: progress.done,
                    total: progress.total,
                  })
                : t("items.printPicker.addSelected", {
                    count: activeSelection.length,
                  })}
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("items.printPicker.searchPlaceholder")}
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {/*
            Trois portées, trois contrôles. Le catalogue et l'extension tenaient
            dans une seule liste tant qu'elle restait courte ; à 399 entrées
            elle ne se parcourt plus. Les séparer coûte un clic de plus et rend
            la seconde liste **courte** — celle du seul jeu qu'on regarde.

            La langue vient en tête : elle réduit la liste des jeux, qui réduit
            celle des extensions.
          */}
          {languages.length > 1 && (
            <Select
              value={activeLanguage}
              onValueChange={(value) => setLanguage(value)}
            >
              <SelectTrigger
                aria-label={t("items.printPicker.languageLabel")}
                className="h-[42px] w-[11rem] rounded-xl"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LANGUAGES}>
                  {t("items.printPicker.languageAll")}
                </SelectItem>
                {languages.map((code) => {
                  const label = printLanguageLabel(code);
                  return (
                    <SelectItem key={code} value={code}>
                      <span className="flex items-center gap-2">
                        {label.flag && (
                          <span aria-hidden className="text-base leading-none">
                            {label.flag}
                          </span>
                        )}
                        {label.name}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}

          {visibleCatalogues.length > 1 && (
            <Select
              value={catalogue}
              onValueChange={(value) => {
                setCatalogue(value);
                /*
                  Changer de jeu relâche l'extension : celle d'avant appartenait
                  à un autre catalogue, et la garder aurait borné la requête sur
                  un identifiant que le nouveau ne connaît pas.
                */
                setSetId(null);
              }}
            >
              <SelectTrigger
                aria-label={t("items.printPicker.catalogueLabel")}
                className="h-[42px] w-[13rem] rounded-xl"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATALOGUES}>
                  {t("items.printPicker.catalogueAll")}
                </SelectItem>
                {visibleCatalogues.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/*
            L'extension ne s'affiche qu'une fois le jeu choisi : « toutes les
            extensions de tous les jeux » est la liste qu'on vient de casser en
            deux, et la reproposer annulerait le partage.
          */}
          {catalogueSets.length > 0 && (
            <Select
              value={activeSetId ?? ALL_SETS}
              onValueChange={(value) =>
                setSetId(value === ALL_SETS ? null : value)
              }
            >
              <SelectTrigger
                aria-label={t("items.printPicker.setLabel")}
                className="h-[42px] w-[15rem] rounded-xl"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SETS}>
                  {t("items.printPicker.setAll")}
                </SelectItem>
                {[...catalogueCuts].map(([cut, sets]) =>
                  cut ? (
                    <SelectGroup key={cut}>
                      <SelectLabel>{cut}</SelectLabel>
                      {sets.map((set) => (
                        <SelectItem key={set.id} value={set.id}>
                          {set.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : (
                    sets.map((set) => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.label}
                      </SelectItem>
                    ))
                  ),
                )}
              </SelectContent>
            </Select>
          )}
        </div>

        {/*
          Le mode reste visible même sans résultat : c'est un réglage de la
          modale, pas une action sur la liste, et le voir disparaître au
          changement de recherche donnerait l'impression de l'avoir perdu.
        */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-border p-0.5">
            {[false, true].map((mode) => (
              <button
                key={String(mode)}
                type="button"
                onClick={() => {
                  setIsMultiple(mode);
                  if (!mode) setSelected(new Map());
                }}
                className={cn(
                  "rounded-[10px] px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
                  isMultiple === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode
                  ? t("items.printPicker.selectionMultiple")
                  : t("items.printPicker.selectionSingle")}
              </button>
            ))}
          </div>
          {isMultiple && visibleRows.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSelected((current) => {
                  /*
                    S'ajoute à ce qui est déjà coché ailleurs : « tout
                    sélectionner » porte sur ce qu'on voit, il n'annule pas un
                    choix fait sous un autre filtre.
                  */
                  const next = new Map(current);
                  for (const row of visibleRows) next.set(row.rowKey, row);
                  return next;
                })
              }
              className="text-xs font-bold text-muted-foreground underline-offset-2 hover:underline cursor-pointer"
            >
              {t("items.printPicker.selectAll")}
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm font-medium text-destructive">{error}</p>
        )}

        {!trimmedQuery && !activeSetId && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("items.printPicker.hint")}
          </p>
        )}

        {/*
          « Aucun tirage » et « le filtre de langue ne laisse rien passer » ne
          sont pas la même chose : dans le second cas la recherche a bien
          trouvé, et dire l'inverse enverrait chercher ailleurs pour rien.
        */}
        {hasSearched && !isSearching && visibleRows.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {pickerRows.length > 0
              ? t("items.printPicker.noResultsForLanguage")
              : t("items.printPicker.noResults")}
          </p>
        )}

        {visibleRows.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {visibleRows.map((row) => {
              const isAdding = addingKey === row.rowKey;
              const printKey = row.printKey.trim().toLowerCase();
              const hasExact = owned.exact.has(
                ownedRowKey(printKey, row.finish, row.language ?? null),
              );
              const hasOtherFinish = !hasExact && owned.anyFinish.has(printKey);
              const isChecked = selected.has(row.rowKey);
              return (
                <li key={row.rowKey}>
                  <button
                    type="button"
                    disabled={Boolean(addingKey) || Boolean(progress)}
                    aria-pressed={isMultiple ? isChecked : undefined}
                    onClick={() =>
                      isMultiple
                        ? toggleRow(row)
                        : void addRow(row, row.finish, row.rowKey)
                    }
                    className={cn(
                      "group flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-2 text-left transition-all",
                      "hover:border-primary/60 hover:shadow-md disabled:opacity-60",
                      isAdding && "border-primary",
                      isChecked && "border-primary ring-2 ring-primary/40",
                    )}
                  >
                    <div className="relative">
                      <OrientedMediaFrame
                        aspectRatio="5 / 7"
                        faceQuarterTurns={row.faceQuarterTurns}
                        landscapeFace={row.landscapeFace}
                        className="overflow-hidden rounded-lg bg-muted"
                      >
                        <PrintPickerTileArt
                          candidate={row}
                          finish={row.finish}
                        />
                      </OrientedMediaFrame>
                      {row.finish && (
                        <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 max-w-[calc(100%-0.75rem)] truncate rounded-md border border-amber-300/40 bg-zinc-950/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-200 shadow-sm">
                          ✦ {localizeFinishLabel(row.finish, t)}
                        </span>
                      )}
                      {/*
                        Deux états distincts : ce tirage-là est déjà rangé, ou
                        bien c'est une autre finition de la même carte — ce
                        second cas n'empêche rien, il informe.
                      */}
                      {(hasExact || hasOtherFinish) && (
                        <span
                          className={cn(
                            "pointer-events-none absolute top-1.5 left-1.5 z-10 max-w-[calc(100%-0.75rem)] truncate rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide shadow-sm",
                            hasExact
                              ? "bg-emerald-600/95 text-white"
                              : "border border-border bg-background/95 text-muted-foreground",
                          )}
                        >
                          {hasExact
                            ? `✓ ${t("items.printPicker.owned")}`
                            : t("items.printPicker.ownedOtherFinish")}
                        </span>
                      )}
                      {isMultiple && (
                        <span
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute top-1.5 right-1.5 z-10 grid size-5 place-items-center rounded-md border text-[11px] font-black",
                            isChecked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background/95 text-transparent",
                          )}
                        >
                          ✓
                        </span>
                      )}
                      {isAdding && (
                        <div className="absolute inset-0 z-20 grid place-items-center rounded-lg bg-background/70">
                          <Loader2 className="size-5 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{row.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {row.reference}
                      </p>
                      {row.rarity && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {row.rarity}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BaseModal>
  );
}
