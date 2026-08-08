"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  FoilPlayroom,
  type PlayroomSample,
} from "@/components/admin/FoilPlayroom";
import { getItems } from "@/lib/api/items";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Admin bench for every dumped TCG foil look. Collection copies preferred;
 * catalogue fillers cover gaps so a finish is never shown on the wrong mask.
 *
 * Mount only when the Effets TCG tab is open — the grid spins WebGL canvases.
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
      return (await response.json()) as { samples: PlayroomSample[] };
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
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return <FoilPlayroom samples={samples} locale={locale} />;
}
