"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  enqueueCatalogueRefresh,
  fetchCatalogueCorpora,
} from "@/lib/client/catalogueCorpora";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

/**
 * Catalogue hub — all ProviderModule.catalog corpora (TCG + LaunchBox / …).
 * Refresh all / per-provider; status from registry hooks.
 */
export function CatalogueCorporaPanel() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: corpora = [], isLoading } = useQuery({
    queryKey: ["catalogueCorpora"],
    queryFn: fetchCatalogueCorpora,
    refetchInterval: 30_000,
  });

  const run = async (opts: { providerId?: string; all?: boolean }) => {
    const key = opts.all ? "*" : (opts.providerId ?? "");
    setBusy(key);
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
  };

  return (
    <Card className="border bg-card/60">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="size-4 text-primary" />
            {fr ? "Corpus locaux" : "Local corpora"}
          </CardTitle>
          <CardDescription>
            {fr
              ? "Providers catalog (registry) — refresh unitaire ou tout. Auto Plex-like via worker."
              : "Catalog providers (registry) — unit or full refresh. Plex-like auto via worker."}
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={busy !== null || corpora.length === 0}
          onClick={() => void run({ all: true })}
        >
          <RefreshCw
            className={`size-3.5 ${busy === "*" ? "animate-spin" : ""}`}
          />
          {fr ? "Tout rafraîchir" : "Refresh all"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground col-span-full">
            {fr ? "Chargement…" : "Loading…"}
          </p>
        )}
        {corpora.map((row) => {
          const staleLabel = row.status.empty
            ? fr
              ? "vide"
              : "empty"
            : row.status.stale
              ? fr
                ? "obsolète"
                : "stale"
              : fr
                ? "à jour"
                : "fresh";
          return (
            <div
              key={row.providerId}
              className="flex flex-col gap-2 rounded-md border bg-background/50 p-3"
            >
              <div className="text-sm font-medium">{row.label}</div>
              <p className="text-xs text-muted-foreground flex-1">
                {row.dataPack} · {row.supplyMode} · {staleLabel}
                {row.status.lastSyncAt
                  ? ` · ${new Date(row.status.lastSyncAt).toLocaleString()}`
                  : ""}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void run({ providerId: row.providerId })}
              >
                <RefreshCw
                  className={`size-3.5 ${
                    busy === row.providerId ? "animate-spin" : ""
                  }`}
                />
                {fr ? "Rafraîchir" : "Refresh"}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
