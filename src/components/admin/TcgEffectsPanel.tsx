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
  catalogueFranchises,
  catalogueFranchiseForPack,
  cataloguePackForDataPack,
  resolveCataloguePackId,
  type CatalogueFranchise,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";

type TopTab =
  | { kind: "franchise"; franchise: CatalogueFranchise }
  | {
      kind: "corpus";
      providerId: string;
      label: string;
    };

function topTabValue(tab: TopTab): string {
  return tab.kind === "franchise"
    ? `franchise:${tab.franchise.id}`
    : `corpus:${tab.providerId}`;
}

/**
 * Admin Catalogue — franchise tabs, then product-line tabs when a franchise
 * has several (Dragon Ball Masters | Fusion World). Naruto is one Carddass line.
 *
 * `?pack=` is always the line / data pack id (or a non-pack corpus provider).
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

  const franchises = useMemo(() => catalogueFranchises(), []);

  const otherCorpora = useMemo(
    () =>
      corpora.filter((corpus) => !cataloguePackForDataPack(corpus.dataPack)),
    [corpora],
  );

  const topTabs = useMemo<TopTab[]>(
    () => [
      ...franchises.map((franchise): TopTab => ({
        kind: "franchise",
        franchise,
      })),
      ...otherCorpora.map((corpus): TopTab => ({
        kind: "corpus",
        providerId: corpus.providerId,
        label: corpus.label,
      })),
    ],
    [franchises, otherCorpora],
  );

  const requested = searchParams.get("pack");
  const packFromUrl = resolveCataloguePackId(requested);
  const corpusFromUrl =
    otherCorpora.find(
      (corpus) =>
        corpus.providerId === requested || corpus.dataPack === requested,
    ) ?? null;
  const defaultPackId: CataloguePackId | null =
    franchises[0]?.lines[0]?.id ?? null;
  const activePackId: CataloguePackId | null =
    packFromUrl ??
    (corpusFromUrl || (requested && corporaLoading) ? null : defaultPackId);
  const activeFranchise = activePackId
    ? catalogueFranchiseForPack(activePackId)
    : null;
  const activeCorpus = corpusFromUrl;

  const activeTopValue = activeFranchise
    ? `franchise:${activeFranchise.id}`
    : activeCorpus
      ? `corpus:${activeCorpus.providerId}`
      : topTabs[0]
        ? topTabValue(topTabs[0])
        : "";

  const selectPack = useCallback(
    (packId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      applyCataloguePackParams(params, packId);
      if (!params.get("tab")) params.set("tab", "tcg-effects");
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const selectTop = useCallback(
    (value: string) => {
      if (value.startsWith("franchise:")) {
        const franchiseId = value.slice("franchise:".length);
        const franchise = franchises.find((row) => row.id === franchiseId);
        const lines = franchise?.lines ?? [];
        const keep = lines.find((line) => line.id === activePackId);
        const next = keep?.id ?? lines[0]?.id;
        if (next) selectPack(next);
        return;
      }
      if (value.startsWith("corpus:")) {
        selectPack(value.slice("corpus:".length));
      }
    },
    [activePackId, franchises, selectPack],
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

  const showLineTabs = (activeFranchise?.lines.length ?? 0) > 1;

  const tabBar = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {topTabs.length ? (
          <SegmentedControl
            value={activeTopValue}
            onChange={selectTop}
            options={topTabs.map((tab) => ({
              value: topTabValue(tab),
              label:
                tab.kind === "franchise"
                  ? fr
                    ? tab.franchise.labelFr
                    : tab.franchise.labelEn
                  : tab.label,
            }))}
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
          disabled={topTabs.length === 0}
          onRefresh={refresh}
        />
      </div>
      {showLineTabs && activeFranchise ? (
        <SegmentedControl
          value={activePackId ?? activeFranchise.lines[0]!.id}
          onChange={selectPack}
          options={activeFranchise.lines.map((line) => ({
            value: line.id,
            label: fr ? line.lineLabelFr : line.lineLabelEn,
          }))}
        />
      ) : null}
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
      {activePackId ? (
        <FoilPlayroom
          samples={samples}
          packArts={catalog?.packArts}
          locale={locale}
        />
      ) : activeCorpus ? (
        <CorpusPanel corpus={activeCorpus} busy={busy} onRefresh={refresh} />
      ) : null}
    </div>
  );
}
