"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  enqueueCatalogueRefresh,
  fetchCatalogueCorpora,
  type CatalogueCorpusRow,
  type CatalogueRefreshRequest,
} from "@/lib/client/catalogueCorpora";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

/**
 * Catalogue corpora — all `ProviderModule.catalog` providers (TCG + LaunchBox /
 * No-Intro / …).
 *
 * The admin shows one tab per provider rather than a hub block, so this module
 * exposes the shared query + refresh plumbing and the small pieces the tabs
 * render; the tab bar itself lives in `TcgEffectsPanel`.
 */

const ALL = "*";

export function useCatalogueCorpora() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: corpora = [], isLoading } = useQuery({
    queryKey: ["catalogueCorpora"],
    queryFn: fetchCatalogueCorpora,
    refetchInterval: 30_000,
  });

  const { locale } = useLocale();
  const fr = locale === "fr";

  const refresh = useCallback(
    async (opts: CatalogueRefreshRequest) => {
      setBusy(opts.all ? ALL : (opts.providerId ?? ""));
      try {
        const done = await enqueueCatalogueRefresh(opts);
        toast.success(
          fr
            ? `${done.jobs.length} job(s) en file`
            : `${done.jobs.length} job(s) queued`,
        );
        void queryClient.invalidateQueries({ queryKey: ["backgroundJobs"] });
        void queryClient.invalidateQueries({ queryKey: ["catalogueCorpora"] });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(null);
      }
    },
    [fr, queryClient],
  );

  return { corpora, isLoading, busy, refresh };
}

/** Camera index snippet — empty when the pack has no visual faces yet. */
export function formatIdentifyIndexes(
  identify: CatalogueCorpusRow["identifyIndexes"],
  fr: boolean,
): string {
  if (!identify?.hasVisual) return "";
  const vis = identify.visualEntries;
  const emb = identify.embeddingEntries;
  if (identify.embeddingsStale) {
    return fr
      ? ` · caméra ${vis} vis / ${emb} CLIP (à reconstruire)`
      : ` · camera ${vis} vis / ${emb} CLIP (rebuild)`;
  }
  return fr
    ? ` · caméra ${vis} vis · ${emb} CLIP`
    : ` · camera ${vis} vis · ${emb} CLIP`;
}

export function corpusStatusLabel(
  corpus: CatalogueCorpusRow,
  fr: boolean,
): string {
  const state = corpus.status.empty
    ? fr
      ? "vide"
      : "empty"
    : corpus.status.stale
      ? fr
        ? "obsolète"
        : "stale"
      : fr
        ? "à jour"
        : "fresh";
  const synced = corpus.status.lastSyncAt
    ? ` · ${new Date(corpus.status.lastSyncAt).toLocaleString()}`
    : "";
  const growth = formatCorpusLastGrowth(corpus.status.lastGrowth, fr);
  const identify = formatIdentifyIndexes(corpus.identifyIndexes, fr);
  return `${corpus.dataPack} · ${corpus.supplyMode} · ${state}${synced}${growth}${identify}`;
}

function formatGrowthPart(
  total: number | undefined,
  delta: number | undefined,
  labels: { one: string; many: string },
): string | null {
  const hasTotal = typeof total === "number" && Number.isFinite(total);
  const hasDelta = typeof delta === "number" && Number.isFinite(delta) && delta !== 0;
  if (!hasTotal && !hasDelta) return null;
  const n = hasTotal ? total : Math.abs(delta!);
  const label = n === 1 ? labels.one : labels.many;
  const head = hasTotal ? `${total} ${label}` : `${delta! > 0 ? "+" : ""}${delta} ${label}`;
  if (hasTotal && hasDelta) {
    const sign = delta! > 0 ? "+" : "";
    return `${head} (${sign}${delta})`;
  }
  return head;
}

/** Sync growth snippet — empty when the pack did not report counts. */
export function formatCorpusLastGrowth(
  growth: CatalogueCorpusRow["status"]["lastGrowth"],
  fr: boolean,
): string {
  if (!growth) return "";
  const parts: string[] = [];
  const cards = formatGrowthPart(growth.cards, growth.cardsDelta, {
    one: fr ? "carte" : "card",
    many: fr ? "cartes" : "cards",
  });
  if (cards) parts.push(cards);
  const products = formatGrowthPart(growth.products, growth.productsDelta, {
    one: fr ? "scellé" : "sealed",
    many: fr ? "scellés" : "sealed",
  });
  if (products) parts.push(products);
  const sets = formatGrowthPart(growth.sets, growth.setsDelta, {
    one: "set",
    many: "sets",
  });
  if (sets) {
    const added = growth.addedSets?.filter(Boolean) ?? [];
    if (added.length) {
      const shown = added.slice(0, 4).join(", ");
      const more = added.length > 4 ? ` +${added.length - 4}` : "";
      parts.push(`${sets}: ${shown}${more}`);
    } else {
      parts.push(sets);
    }
  } else if (growth.addedSets?.length) {
    const shown = growth.addedSets.slice(0, 4).join(", ");
    const more =
      growth.addedSets.length > 4 ? ` +${growth.addedSets.length - 4}` : "";
    parts.push(fr ? `sets: ${shown}${more}` : `sets: ${shown}${more}`);
  }
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

/** Refresh every catalog provider at once (corpus panels / callers that need it). */
/** Enqueue a full Sync (harvest + faces + camera indexes) for every corpus. */
export function SyncAllCorporaButton({
  busy,
  disabled,
  onRefresh,
}: {
  busy: string | null;
  disabled?: boolean;
  onRefresh: (opts: CatalogueRefreshRequest) => void | Promise<void>;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1 px-2 text-xs"
      disabled={busy !== null || disabled}
      title={
        fr
          ? "Sync tous les corpora (moisson + faces + indexes caméra)"
          : "Sync every corpus (harvest + faces + camera indexes)"
      }
      onClick={() => void onRefresh({ all: true })}
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${busy === ALL ? "animate-spin" : ""}`}
      />
      {fr ? "Sync tout" : "Sync all"}
    </Button>
  );
}

/** @deprecated Use {@link SyncAllCorporaButton} */
export const RefreshAllCorporaButton = SyncAllCorporaButton;

/**
 * A corpus with no cards browser of its own (LaunchBox, No-Intro, Players):
 * status + its own refresh, nothing else to show.
 */
export function CorpusPanel({
  corpus,
  busy,
  onRefresh,
}: {
  corpus: CatalogueCorpusRow;
  busy: string | null;
  onRefresh: (opts: CatalogueRefreshRequest) => void | Promise<void>;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const steps = corpus.pipelineSteps?.filter(Boolean) ?? [];
  const [only, setOnly] = useState("");
  const [langs, setLangs] = useState("");
  const [limit, setLimit] = useState("");

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{corpus.label}</div>
          <p className="text-xs text-muted-foreground">
            {corpusStatusLabel(corpus, fr)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            disabled={busy !== null}
            title={
              fr
                ? "Sync ce corpus (moisson + faces + indexes caméra)"
                : "Sync this corpus (harvest + faces + camera indexes)"
            }
            onClick={() => {
              const limitN = Number(limit);
              void onRefresh({
                providerId: corpus.providerId,
                ...(only.trim() ? { only: only.trim() } : {}),
                ...(langs.trim() ? { langs: langs.trim() } : {}),
                ...(Number.isFinite(limitN) && limitN > 0
                  ? { limit: Math.floor(limitN) }
                  : {}),
              });
            }}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                busy === corpus.providerId ? "animate-spin" : ""
              }`}
            />
            Sync
          </Button>
        </div>
      </div>
      {steps.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            {fr ? "Étapes" : "Steps"}
            <Input
              value={only}
              onChange={(event) => setOnly(event.target.value)}
              placeholder={steps.join(",")}
              className="h-7 text-xs"
              disabled={busy !== null}
            />
          </label>
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            {fr ? "Langues" : "Langs"}
            <Input
              value={langs}
              onChange={(event) => setLangs(event.target.value)}
              placeholder="fr,en"
              className="h-7 text-xs"
              disabled={busy !== null}
            />
          </label>
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            limit
            <Input
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              placeholder="10"
              inputMode="numeric"
              className="h-7 text-xs"
              disabled={busy !== null}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
