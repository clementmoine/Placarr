"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import {
  FoilPlayroom,
  type PlayroomSample,
} from "@/components/admin/FoilPlayroom";
import {
  CorpusPanel,
  RefreshAllCorporaButton,
  useCatalogueCorpora,
} from "@/components/admin/CatalogueCorporaPanel";
import { SegmentedControl } from "@/components/admin/SegmentedControl";
import type { PlayroomArt } from "@/effects/pokemon/playroomArt";
import { getItems } from "@/lib/api/items";
import { Skeleton } from "@/components/ui/skeleton";
import {
  applyCataloguePackParams,
  cataloguePackForDataPack,
  resolveCataloguePackId,
} from "@/lib/admin/cataloguePacks";

/**
 * Admin Catalogue — one tab per catalog provider.
 *
 * The tab bar owns the active provider (URL `?pack=`): a TCG pack opens the
 * playroom / cards browser, any other corpus (LaunchBox, No-Intro, Players)
 * shows its status and its own refresh. `Refresh all` sits on the tab row
 * because it spans every tab.
 *
 * Mount only when the Catalogue tab is open — the foil grid spins WebGL canvases.
 */
export function TcgEffectsPanel({ locale }: { locale: string }) {
  const fr = locale === "fr";
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    corpora,
    isLoading: corporaLoading,
    busy,
    refresh,
  } = useCatalogueCorpora();

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["foilPlayroomSample"],
    queryFn: () => getItems(),
  });

  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ["foilPlayroomCatalog"],
    queryFn: async () => {
      const response = await fetch("/api/admin/foil-playroom-samples");
      if (!response.ok) {
        throw new Error("foil playroom catalog unavailable");
      }
      return (await response.json()) as {
        samples: PlayroomSample[];
        packArts?: Record<string, Record<string, PlayroomArt[]>>;
      };
    },
  });

  /** Card packs first (they own a browser), then the plain corpora. */
  const tabs = useMemo(() => {
    const rows = corpora.map((corpus) => ({
      corpus,
      pack: cataloguePackForDataPack(corpus.dataPack),
    }));
    return [
      ...rows.filter((row) => row.pack),
      ...rows.filter((row) => !row.pack),
    ].map((row) => ({
      // A pack tab is addressed by its pack id so `?pack=` keeps working for
      // deep links; a plain corpus falls back to the provider id.
      value: row.pack?.id ?? row.corpus.providerId,
      label: row.pack
        ? fr
          ? row.pack.labelFr
          : row.pack.labelEn
        : row.corpus.label,
      corpus: row.corpus,
      hasBrowser: Boolean(row.pack),
    }));
  }, [corpora, fr]);

  const requested = searchParams.get("pack");
  const active =
    tabs.find((tab) => tab.value === resolveCataloguePackId(requested)) ??
    tabs.find((tab) => tab.value === requested) ??
    tabs[0] ??
    null;

  const selectTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      applyCataloguePackParams(params, value);
      if (!params.get("tab")) params.set("tab", "tcg-effects");
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const samples = useMemo<PlayroomSample[]>(() => {
    const fromCollection = (items ?? [])
      .filter((item) => item.printKey && item.variant)
      .map((item) => ({
        id: item.id,
        name: item.name,
        variant: item.variant ?? null,
        printKey: item.printKey ?? null,
        shelfType: item.shelf?.type ?? null,
        imageUrl: item.imageUrl ?? null,
      }));

    const ownedKeys = new Set(
      fromCollection.map((sample) => `${sample.printKey}|${sample.variant}`),
    );

    const fromCatalog = (catalog?.samples ?? []).filter(
      (sample) =>
        sample.printKey &&
        !ownedKeys.has(`${sample.printKey}|${sample.variant}`),
    );

    return [...fromCollection, ...fromCatalog];
  }, [catalog?.samples, items]);

  const tabBar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {tabs.length ? (
        <SegmentedControl
          value={active?.value ?? ""}
          onChange={selectTab}
          options={tabs.map((tab) => ({ value: tab.value, label: tab.label }))}
        />
      ) : (
        <span className="text-sm text-muted-foreground">
          {corporaLoading
            ? fr
              ? "Chargement…"
              : "Loading…"
            : fr
              ? "Aucun corpus"
              : "No corpora"}
        </span>
      )}
      <RefreshAllCorporaButton
        busy={busy}
        disabled={tabs.length === 0}
        onRefresh={refresh}
      />
    </div>
  );

  if (itemsLoading || catalogLoading) {
    return (
      <div className="space-y-4">
        {tabBar}
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tabBar}
      {active?.hasBrowser ? (
        <FoilPlayroom
          samples={samples}
          packArts={catalog?.packArts}
          locale={locale}
        />
      ) : active ? (
        <CorpusPanel corpus={active.corpus} busy={busy} onRefresh={refresh} />
      ) : null}
    </div>
  );
}
