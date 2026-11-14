"use client";

/**
 * Ajout d'un produit scellé depuis le catalogue (étape 3).
 * Jumeau allégé de PrintPickerModal — browse SKU → POST item kind=sealed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Package, Search } from "lucide-react";

import { BaseModal } from "@/components/modals/BaseModal";
import { includesFolded, normalizeForTokens } from "@/core/enrich/titles/normalize";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import { cn } from "@/lib/shared/utils";

type ShelfSealedProductRow = {
  productKey: string;
  packId: string;
  slug: string;
  name: string;
  kind: string;
  imageUrl: string | null;
  language: string | null;
  priceCents: number | null;
  setCode: string | null;
  contentsKnown: boolean;
};

export function SealedPickerModal({
  shelfId,
  isOpen,
  onClose,
  onAdded,
}: {
  shelfId: string;
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ShelfSealedProductRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !shelfId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setQuery("");
    void (async () => {
      try {
        const res = await fetch(
          `/api/shelves/${encodeURIComponent(shelfId)}/sealed-products`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          products?: ShelfSealedProductRow[];
        };
        if (!cancelled) setProducts(data.products ?? []);
      } catch {
        if (!cancelled) {
          setError(t("items.sealedPicker.loadFailed"));
          setProducts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, shelfId, t]);

  const filtered = useMemo(() => {
    const q = normalizeForTokens(query.trim());
    if (!q) return products;
    return products.filter((row) =>
      includesFolded(
        `${row.name} ${row.slug} ${row.kind} ${row.setCode ?? ""}`,
        q,
      ),
    );
  }, [products, query]);

  const toggle = useCallback((productKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productKey)) next.delete(productKey);
      else next.add(productKey);
      return next;
    });
  }, []);

  const addSelected = useCallback(async () => {
    const rows = products.filter((row) => selected.has(row.productKey));
    if (rows.length === 0) return;
    setAdding(true);
    setError(null);
    let failed = 0;
    for (const row of rows) {
      try {
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shelfId,
            name: row.name,
            kind: "sealed",
            skuKey: row.productKey,
            skuName: row.name,
            skuLanguage: row.language,
            catalogueKind: row.kind,
            imageUrl: row.imageUrl,
            purchasePriceCents: row.priceCents,
            condition: "new",
            fetchMetadata: false,
          }),
        });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setAdding(false);
    onAdded();
    if (failed > 0) {
      setError(t("items.sealedPicker.partialFailure", { failed }));
      setSelected(new Set());
      return;
    }
    onClose();
  }, [products, selected, shelfId, onAdded, onClose, t]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("items.sealedPicker.title")}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-3 min-h-0">
        <p className="text-xs text-muted-foreground">
          {t("items.sealedPicker.hint")}
        </p>
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("items.sealedPicker.search")}
            className="w-full h-10 rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
          />
        </label>

        <div className="flex-1 min-h-[16rem] max-h-[50vh] overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("items.sealedPicker.empty")}
            </p>
          ) : (
            filtered.map((row) => {
              const on = selected.has(row.productKey);
              return (
                <button
                  key={row.productKey}
                  type="button"
                  onClick={() => toggle(row.productKey)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer hover:bg-muted/50",
                    on && "bg-primary/10",
                  )}
                >
                  <span
                    className={cn(
                      "size-4 shrink-0 rounded border",
                      on
                        ? "bg-primary border-primary"
                        : "border-border bg-background",
                    )}
                    aria-hidden
                  />
                  {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.imageUrl}
                      alt=""
                      className="size-12 rounded-md object-cover bg-muted shrink-0"
                    />
                  ) : (
                    <span className="size-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Package className="size-5 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">
                      {row.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {[
                        row.kind,
                        row.setCode,
                        row.language
                          ? printLanguageLabel(row.language).name
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-xl border border-border text-sm font-semibold cursor-pointer"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || adding}
            onClick={() => void addSelected()}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("items.sealedPicker.add", { count: selected.size })}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
