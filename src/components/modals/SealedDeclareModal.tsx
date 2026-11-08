"use client";

/**
 * Déclarer les tirages d'un scellé random / déjà ouvert.
 * Recherche prints → multi-select (qty) → POST declareSealedPulls.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus, Search } from "lucide-react";

import { BaseModal } from "@/components/modals/BaseModal";
import { Button } from "@/components/ui/button";
import { declareSealedPulls } from "@/lib/api/items";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import { cn } from "@/lib/shared/utils";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_RESULT_LIMIT = 48;

type PrintSearchHit = {
  printKey: string;
  title: string;
  reference?: string | null;
  language?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
};

type SelectedPrint = {
  printKey: string;
  title: string;
  language: string | null;
  qty: number;
  thumbnailUrl: string | null;
};

export function SealedDeclareModal({
  itemId,
  shelfId,
  shelfType,
  defaultLanguage = null,
  isOpen,
  onClose,
  onDeclared,
}: {
  itemId: string;
  shelfId: string;
  shelfType: string;
  defaultLanguage?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDeclared: (result: { childCount: number }) => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [candidates, setCandidates] = useState<PrintSearchHit[]>([]);
  const [selected, setSelected] = useState<Map<string, SelectedPrint>>(
    () => new Map(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setCandidates([]);
    setSelected(new Map());
    setHasSearched(false);
    setError(null);
    setIsSearching(false);
  }, [isOpen]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!isOpen) return;
    if (!trimmedQuery) {
      searchAbort.current?.abort();
      setCandidates([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      searchAbort.current?.abort();
      const controller = new AbortController();
      searchAbort.current = controller;
      setIsSearching(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          type: shelfType,
          q: trimmedQuery,
          limit: String(SEARCH_RESULT_LIMIT),
          offset: "0",
        });
        if (defaultLanguage?.trim()) {
          params.set("language", defaultLanguage.trim());
        }
        const response = await fetch(`/api/prints?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as {
          candidates?: PrintSearchHit[];
        };
        setCandidates(data.candidates ?? []);
        setHasSearched(true);
      } catch (caught) {
        if ((caught as Error)?.name === "AbortError") return;
        setError(t("items.sealedDeclare.searchFailed"));
        setCandidates([]);
        setHasSearched(true);
      } finally {
        if (searchAbort.current === controller) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isOpen, trimmedQuery, shelfType, defaultLanguage, t]);

  const selectedList = useMemo(() => [...selected.values()], [selected]);
  const totalQty = useMemo(
    () => selectedList.reduce((sum, row) => sum + row.qty, 0),
    [selectedList],
  );

  const bump = useCallback((candidate: PrintSearchHit, delta: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const key = candidate.printKey;
      const current = next.get(key);
      const qty = (current?.qty ?? 0) + delta;
      if (qty <= 0) {
        next.delete(key);
        return next;
      }
      next.set(key, {
        printKey: key,
        title: candidate.title,
        language: candidate.language ?? null,
        qty,
        thumbnailUrl: candidate.thumbnailUrl ?? candidate.imageUrl ?? null,
      });
      return next;
    });
  }, []);

  const setQty = useCallback((printKey: string, qty: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const current = next.get(printKey);
      if (!current) return prev;
      if (qty <= 0) {
        next.delete(printKey);
        return next;
      }
      next.set(printKey, { ...current, qty });
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    if (totalQty === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const prints = selectedList.flatMap((row) =>
        Array.from({ length: row.qty }, () => ({
          printKey: row.printKey,
          name: row.title,
          language: row.language ?? defaultLanguage ?? null,
        })),
      );
      const result = await declareSealedPulls(itemId, { shelfId, prints });
      onDeclared({ childCount: result.childCount });
      onClose();
    } catch {
      setError(t("items.sealedDeclare.failed"));
    } finally {
      setSubmitting(false);
    }
  }, [
    totalQty,
    submitting,
    selectedList,
    defaultLanguage,
    itemId,
    shelfId,
    onDeclared,
    onClose,
    t,
  ]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={t("items.sealedDeclare.title")}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={submitting || totalQty === 0}
            onClick={() => void submit()}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : null}
            {t("items.sealedDeclare.submit", { count: totalQty })}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 min-h-0">
        <p className="text-xs text-muted-foreground">
          {t("items.sealedDeclare.hint")}
        </p>
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("items.sealedDeclare.search")}
            className="w-full h-10 rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
            autoFocus
          />
        </label>

        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {selectedList.length > 0 ? (
          <ul className="flex flex-col gap-1.5 max-h-36 overflow-y-auto rounded-xl border border-border/70 p-2">
            {selectedList.map((row) => (
              <li
                key={row.printKey}
                className="flex items-center gap-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {row.title}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="size-7 rounded-lg border border-border flex items-center justify-center cursor-pointer hover:bg-muted"
                    onClick={() => setQty(row.printKey, row.qty - 1)}
                    aria-label="−"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold tabular-nums">
                    {row.qty}
                  </span>
                  <button
                    type="button"
                    className="size-7 rounded-lg border border-border flex items-center justify-center cursor-pointer hover:bg-muted"
                    onClick={() => setQty(row.printKey, row.qty + 1)}
                    aria-label="+"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex-1 min-h-[14rem] max-h-[40vh] overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {isSearching ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : !trimmedQuery ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("items.sealedDeclare.searchHint")}
            </p>
          ) : hasSearched && candidates.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("items.sealedDeclare.empty")}
            </p>
          ) : (
            candidates.map((candidate) => {
              const qty = selected.get(candidate.printKey)?.qty ?? 0;
              return (
                <button
                  key={`${candidate.printKey}|${candidate.language ?? ""}`}
                  type="button"
                  onClick={() => bump(candidate, 1)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer hover:bg-muted/50",
                    qty > 0 && "bg-primary/10",
                  )}
                >
                  {candidate.thumbnailUrl || candidate.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={candidate.thumbnailUrl || candidate.imageUrl || ""}
                      alt=""
                      className="size-12 rounded-md object-cover bg-muted shrink-0"
                    />
                  ) : (
                    <div className="size-12 rounded-md bg-muted shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {candidate.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[
                        candidate.reference,
                        candidate.language
                          ? printLanguageLabel(candidate.language)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {qty > 0 ? (
                    <span className="text-xs font-black tabular-nums text-primary shrink-0">
                      ×{qty}
                    </span>
                  ) : (
                    <Plus className="size-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </BaseModal>
  );
}
