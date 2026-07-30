"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import Header from "@/components/Header";
import {
  FoilPlayroom,
  type PlayroomSample,
} from "@/components/admin/FoilPlayroom";
import { getItems } from "@/lib/api/items";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The foil bench.
 *
 * Every look is drawn on a real print that actually carries that finish (and
 * varnish, when the material bakes one in). Collection copies are preferred;
 * the catalogue fills gaps so Magma is never shown on a Silver mask.
 */
export default function FoilPlayroomPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["foilPlayroomSample"],
    queryFn: () => getItems(),
    enabled: status === "authenticated" && isAdmin,
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
    enabled: status === "authenticated" && isAdmin,
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

  if (status === "loading" || (isAdmin && (itemsLoading || catalogLoading))) {
    return (
      <div className="flex flex-col">
        <Header />
        <div className="mx-auto w-full max-w-7xl p-6">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col">
        <Header />
        <p className="mx-auto w-full max-w-7xl p-6 text-sm text-muted-foreground">
          Réservé à l&apos;administration.
        </p>
      </div>
    );
  }

  const collectionCount = (items ?? []).filter(
    (item) => item.printKey && item.variant,
  ).length;
  const catalogCount = samples.length - collectionCount;

  return (
    <div className="flex flex-col">
      <Header />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Administration
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-black tracking-tight">
            Salle d&apos;essai
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tous les effets que l&apos;app sait dessiner.
            {samples.length > 0 ? (
              <>
                {" "}
                Chaque effet uniquement sur une carte adaptée —{" "}
                {collectionCount} exemplaire
                {collectionCount === 1 ? "" : "s"} en collection
                {catalogCount > 0
                  ? `, ${catalogCount} comblé${catalogCount === 1 ? "" : "s"} depuis le catalogue`
                  : ""}
                .
              </>
            ) : null}
          </p>
        </div>

        {samples.length > 0 ? (
          <FoilPlayroom samples={samples} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune carte à effet disponible (collection vide et catalogue
            inaccessible).
          </p>
        )}
      </div>
    </div>
  );
}
