"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  FoilPlayroom,
  type PlayroomSample,
} from "@/components/admin/FoilPlayroom";
import { CatalogueCorporaPanel } from "@/components/admin/CatalogueCorporaPanel";
import type { PlayroomArt } from "@/effects/pokemon/playroomArt";
import { getItems } from "@/lib/api/items";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Admin Catalogue — local corpora hub + TCG playroom / cards browser.
 *
 * Mount only when the Catalogue tab is open — the foil grid spins WebGL canvases.
 */
export function TcgEffectsPanel({ locale }: { locale: string }) {
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

  if (itemsLoading || catalogLoading) {
    return (
      <div className="space-y-4">
        <CatalogueCorporaPanel />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CatalogueCorporaPanel />
      <FoilPlayroom
        samples={samples}
        packArts={catalog?.packArts}
        locale={locale}
      />
    </div>
  );
}
