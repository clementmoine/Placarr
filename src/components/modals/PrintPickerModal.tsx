"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Search } from "lucide-react";

import { BaseModal } from "@/components/modals/BaseModal";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { cn } from "@/lib/shared/utils";

/** Mirrors `PrintCandidate` from the provider contract, minus server-only bits. */
export type PrintCandidateView = {
  printKey: string;
  title: string;
  reference: string;
  rarity?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  language?: string | null;
  finishes?: string[];
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

/**
 * Add flow for shelves that cannot be scanned.
 *
 * A card carries no barcode, and its name is not an answer either — five
 * Lorcana prints are called "Chiot dalmatien". So the user searches, then picks
 * a *printing*: the reference, rarity and artwork are shown precisely because
 * they are what tells two otherwise identical rows apart.
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
  const visibleCandidates = trimmedQuery ? candidates : [];

  const addCandidate = useCallback(
    async (candidate: PrintCandidateView) => {
      setAddingKey(candidate.printKey);
      setError(null);
      try {
        const response = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shelfId,
            name: candidate.title,
            printKey: candidate.printKey,
            imageUrl: candidate.imageUrl ?? candidate.thumbnailUrl,
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

        {hasSearched &&
          !isSearching &&
          visibleCandidates.length === 0 &&
          !error && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("items.printPicker.noResults")}
            </p>
          )}

        {visibleCandidates.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {visibleCandidates.map((candidate) => {
              const isAdding = addingKey === candidate.printKey;
              return (
                <li key={`${candidate.printKey}-${candidate.language ?? ""}`}>
                  <button
                    type="button"
                    disabled={Boolean(addingKey)}
                    onClick={() => addCandidate(candidate)}
                    className={cn(
                      "group flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-2 text-left transition-all",
                      "hover:border-primary/60 hover:shadow-md disabled:opacity-60",
                      isAdding && "border-primary",
                    )}
                  >
                    <div className="relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-muted">
                      {candidate.thumbnailUrl ? (
                        <Image
                          src={candidate.thumbnailUrl}
                          alt={candidate.title}
                          fill
                          sizes="(max-width: 640px) 45vw, 180px"
                          className="object-cover"
                        />
                      ) : null}
                      {isAdding && (
                        <div className="absolute inset-0 grid place-items-center bg-background/70">
                          <Loader2 className="size-5 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">
                        {candidate.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {candidate.reference}
                      </p>
                      {candidate.rarity && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {candidate.rarity}
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
