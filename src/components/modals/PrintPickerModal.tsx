"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { BaseModal } from "@/components/modals/BaseModal";
import { FoilCardImage } from "@/components/FoilCardImage";
import { OrientedMediaFrame } from "@/components/OrientedMediaFrame";
import { RemoteImage } from "@/components/RemoteImage";
import { expandPrintCandidatesByFinish } from "@/core/enrich/variants";
import {
  variantRendering,
  type PrintVariantInfo,
} from "@/lib/client/hooks/usePrintVariant";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { localizeFinishLabel } from "@/lib/text/finishLabel";
import { cn } from "@/lib/shared/utils";
import "@/effects";

/** Mirrors `PrintCandidate` from the provider contract, minus server-only bits. */
export type PrintCandidateView = {
  printKey: string;
  title: string;
  reference: string;
  rarity?: string | null;
  category?: string | null;
  faceQuarterTurns?: 0 | 1 | 2 | 3;
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

type PrintPickerModalProps = {
  shelfId: string;
  shelfType: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called once the item exists, so the shelf can refetch. */
  onAdded: () => void;
};

/** Long enough that typing a card name is one request, not eight. */
const SEARCH_DEBOUNCE_MS = 300;

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
}: PrintPickerModalProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PrintCandidateView[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

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
    onClose();
  }, [onClose]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
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
        const response = await fetch(
          `/api/prints?q=${encodeURIComponent(trimmedQuery)}&type=${encodeURIComponent(shelfType)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as {
          candidates?: PrintCandidateView[];
        };
        setCandidates(data.candidates ?? []);
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
  }, [trimmedQuery, shelfType, t]);

  /**
   * Derived rather than cleared by an effect: an empty box shows nothing, and a
   * stale list never flashes between two queries.
   */
  const pickerRows = useMemo(
    () => expandPrintCandidatesByFinish(trimmedQuery ? candidates : []),
    [trimmedQuery, candidates],
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
        const art = candidateCoverUrl(candidate, finish);
        const response = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shelfId,
            name: candidate.title,
            printKey: candidate.printKey,
            variant: finish,
            imageUrl: art,
            condition: "used",
          }),
        });
        if (!response.ok) throw new Error(String(response.status));
        onAdded();
        handleClose();
      } catch {
        setError(t("errors.genericMessage"));
      } finally {
        setAddingKey(null);
      }
    },
    [shelfId, onAdded, handleClose, t],
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      title={t("items.printPicker.title")}
      description={t("items.printPicker.description")}
      footer={
        <button
          type="button"
          onClick={handleClose}
          className="rounded-xl h-10 px-4 text-sm font-bold border border-border bg-card hover:bg-accent cursor-pointer"
        >
          {t("common.cancel")}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="relative">
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

        {error && (
          <p className="text-sm font-medium text-destructive">{error}</p>
        )}

        {!trimmedQuery && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("items.printPicker.hint")}
          </p>
        )}

        {hasSearched && !isSearching && pickerRows.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("items.printPicker.noResults")}
          </p>
        )}

        {pickerRows.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {pickerRows.map((row) => {
              const isAdding = addingKey === row.rowKey;
              return (
                <li key={row.rowKey}>
                  <button
                    type="button"
                    disabled={Boolean(addingKey)}
                    onClick={() => void addRow(row, row.finish, row.rowKey)}
                    className={cn(
                      "group flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-2 text-left transition-all",
                      "hover:border-primary/60 hover:shadow-md disabled:opacity-60",
                      isAdding && "border-primary",
                    )}
                  >
                    <div className="relative">
                      <OrientedMediaFrame
                        aspectRatio="5 / 7"
                        faceQuarterTurns={row.faceQuarterTurns}
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
