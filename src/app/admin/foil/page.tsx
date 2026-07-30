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
import {
  usePrintVariant,
  variantRendering,
} from "@/lib/client/hooks/usePrintVariant";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The foil bench.
 *
 * Drawn on a real card from the collection rather than a checked pattern: a
 * look only tells the truth over artwork it has to blend with, which is the
 * whole point of recipes built on `mix-blend-mode`. The sample is simply the
 * first print that carries a foil mask.
 */
export default function FoilPlayroomPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const { data: items, isLoading } = useQuery({
    queryKey: ["foilPlayroomSample"],
    queryFn: () => getItems(),
    enabled: status === "authenticated" && isAdmin,
  });

  /**
   * Every foil copy, so each look can be shown on a card that actually carries
   * its finish. A recipe ends in `mix-blend-mode` against the artwork, so a
   * Lava look over a Lava print says something it cannot say over a Silver one.
   */
  const samples = useMemo<PlayroomSample[]>(
    () =>
      (items ?? [])
        .filter((item) => item.printKey && item.variant)
        .map((item) => ({
          id: item.id,
          name: item.name,
          variant: item.variant ?? null,
          printKey: item.printKey ?? null,
          shelfType: item.shelf?.type ?? null,
          imageUrl: item.imageUrl ?? null,
        })),
    [items],
  );

  /** Whatever the collection happens to hold, for looks it owns no card of. */
  const fallbackSample = samples[0] ?? null;
  const printVariant = usePrintVariant(
    fallbackSample?.printKey,
    fallbackSample?.shelfType,
  );
  const view = variantRendering(
    fallbackSample?.variant,
    printVariant,
    fallbackSample?.imageUrl ?? null,
  );

  if (status === "loading" || (isAdmin && isLoading)) {
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
                Chaque effet sur une carte qui porte cette finition, quand la
                collection en a une — {samples.length} exemplaires disponibles.
              </>
            ) : null}
          </p>
        </div>

        {view.imageUrl && view.foilMaskUrl ? (
          <FoilPlayroom
            fallback={{
              imageUrl: view.imageUrl,
              maskUrl: view.foilMaskUrl,
              varnishMaskUrl: view.varnishMaskUrl,
            }}
            samples={samples}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune carte à effet dans la collection pour servir de support — il
            faut au moins un exemplaire dont la finition n&apos;est pas simple,
            puisque c&apos;est son masque que la salle d&apos;essai réutilise.
          </p>
        )}
      </div>
    </div>
  );
}
