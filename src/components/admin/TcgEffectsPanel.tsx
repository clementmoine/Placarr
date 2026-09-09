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
  useCatalogueCorpora,
} from "@/components/admin/CatalogueCorporaPanel";
import {
  CatalogueNav,
  catalogueTopTabValue,
  type CatalogueTopTab,
} from "@/components/admin/CatalogueNav";
import type { PlayroomArt } from "@/effects/pokemon/playroomArt";
import { getItems } from "@/lib/api/items";
import { Skeleton } from "@/components/ui/skeleton";
import {
  applyCataloguePackParams,
  catalogueFranchises,
  catalogueFranchiseForPack,
  cataloguePackForDataPack,
  resolveCataloguePackId,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";

/**
 * Admin Catalogue — selecteurs + Logs/Sync, puis Cartes/Scellés au-dessus de
 * la grille.
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

  const topTabs = useMemo<CatalogueTopTab[]>(
    () => [
      ...franchises.map((franchise): CatalogueTopTab => ({
        kind: "franchise",
        franchise,
      })),
      ...otherCorpora.map((corpus): CatalogueTopTab => ({
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
        ? catalogueTopTabValue(topTabs[0])
        : "";

  const selectPack = useCallback(
    (packId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      applyCataloguePackParams(params, packId);
      if (!params.get("tab")) params.set("tab", "catalogue");
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

  const nav = topTabs.length ? (
    <CatalogueNav
      topTabs={topTabs}
      topValue={activeTopValue}
      onTopChange={selectTop}
      lines={activeFranchise?.lines ?? []}
      packId={activePackId}
      onPackChange={selectPack}
      locale={locale}
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
  );

  if (!activePackId && !activeCorpus && (itemsLoading || catalogLoading)) {
    return (
      <div className="space-y-4">
        {nav}
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activePackId ? (
        <FoilPlayroom
          samples={samples}
          packArts={catalog?.packArts}
          locale={locale}
          chromeLeading={nav}
        />
      ) : activeCorpus ? (
        <>
          {nav}
          <CorpusPanel
            corpus={activeCorpus}
            busy={busy}
            onRefresh={refresh}
          />
        </>
      ) : (
        nav
      )}
    </div>
  );
}
