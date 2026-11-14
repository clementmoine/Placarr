/**
 * La check-list d'une étagère : ce qui existe, ce qu'on a, et quoi acheter.
 *
 * Le calcul est ailleurs — `lib/collect/shelfChecklist` assemble, `core/collect`
 * compte. Cette route ne fait que résoudre l'étagère, lire ses items, et
 * traduire les paramètres.
 *
 * **La langue est obligatoire dans les faits, pas dans la signature.** Sans
 * elle on compte toutes les langues confondues, ce qui ne veut rien dire pour
 * une complétion. On retombe donc sur la langue majoritaire de l'étagère, et on
 * la rend dans la réponse pour que l'écran puisse la montrer et la changer.
 *
 * **Master set** (`?masterSet=1`) : chaque finition est une case à part. Posséder
 * la foil ne coche pas la normale, et inversement.
 *
 * **Set-scoped** : `Item.setCode` borne la case à une extension. Sans setCode
 * (items legacy), le `printKey` compte encore dans chaque set qui le liste.
 *
 * **Virtuels** : scellés fermés à contenu connu → printKeys dérivés, hors
 * « en main », exclus du buy missing.
 */
import { NextRequest, NextResponse } from "next/server";

import { partitionChecklistOwnership } from "@/core/collect/checklistPresence";
import {
  virtualChecklistKeys,
  virtualPrintKeysFromSealedItems,
} from "@/core/collect/checklistVirtual";
import { buildChecklistForShelf } from "@/lib/collect/shelfChecklist";
import { makeVirtualProductLoader } from "@/lib/collect/sealedProductsLoad";
/*
  Lorcana Promo Year ownership (`p4` vs chapter `13`) registers on module load.
  Pull the catalogue so the resolver is installed before we build owned keys.
*/
import "@/core/catalog/registry";
import { prisma } from "@/lib/db/prisma";
import { requireGuestOrHigher } from "@/lib/auth";
import { resolveShelfId } from "@/lib/routing/resolveIds";
import type { MediaType } from "@/types/providerRegistry";

/** La langue que l'étagère porte le plus souvent. */
function dominantLanguage(
  items: readonly { language: string | null }[],
): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    const code = item.language?.trim().toLowerCase();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

function languageMatches(
  itemLanguage: string | null | undefined,
  language: string | null,
): boolean {
  const code = itemLanguage?.trim().toLowerCase();
  return !language || !code || code === language;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shelfId: string }> },
) {
  const auth = await requireGuestOrHigher(request);
  if (auth instanceof NextResponse) return auth;

  const { shelfId: raw } = await context.params;
  const shelfId = await resolveShelfId(raw);
  if (!shelfId) {
    return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
  }

  const shelf = await prisma.shelf.findUnique({
    where: { id: shelfId },
    select: { id: true, name: true, slug: true, type: true },
  });
  if (!shelf) {
    return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const masterSet =
    params.get("masterSet") === "1" ||
    params.get("masterSet")?.trim().toLowerCase() === "true";

  const [items, sealedItems] = await Promise.all([
    prisma.item.findMany({
      where: { shelfId: shelf.id, printKey: { not: null } },
      select: {
        printKey: true,
        setCode: true,
        language: true,
        variant: true,
        presence: true,
      },
    }),
    prisma.item.findMany({
      where: {
        shelfId: shelf.id,
        kind: "sealed",
        skuKey: { not: null },
      },
      select: {
        kind: true,
        skuKey: true,
        skuLanguage: true,
        presence: true,
        openedAt: true,
      },
    }),
  ]);

  const language =
    params.get("language")?.trim().toLowerCase() ||
    dominantLanguage([
      ...items,
      ...sealedItems.map((row) => ({ language: row.skuLanguage })),
    ]);

  /*
    Les exemplaires d'une autre langue ne comptent pas comme possédés : avoir
    l'Inari japonaise ne complète pas la Série 1 française. Un exemplaire dont
    la langue est inconnue est compté — le retirer punirait un item que la
    passe de rattrapage n'a pas su trancher.
  */
  const matching = items.filter((item) =>
    languageMatches(item.language, language),
  );
  const matchingSealed = sealedItems.filter((item) =>
    languageMatches(item.skuLanguage, language),
  );

  const virtualPrintKeys = virtualPrintKeysFromSealedItems(
    matchingSealed,
    makeVirtualProductLoader(),
  );
  const virtualKeys = virtualChecklistKeys(virtualPrintKeys, { masterSet });

  /*
    Presence buckets: past must not inflate owned (buy + %), and past
    must surface as « déjà eu » in the same change or sold cards look missing.
    Virtuals exclude from buy missing without counting as in-hand.
  */
  const { owned, away, virtual, alreadyHad } = partitionChecklistOwnership(
    matching,
    { masterSet, virtualKeys },
  );

  const checklist = await buildChecklistForShelf({
    shelfType: shelf.type as MediaType,
    owned,
    away,
    virtual,
    alreadyHad,
    language,
    shelfName: shelf.name,
    masterSet,
  });

  /*
    En master set, une copie sans `variant` ne coche aucune finition catalogue
    (None vs Silver). On le dit à l'UI pour expliquer un % bas malgré des
    cartes sur l'étagère — ex. Ch1 Lorcana ajouté avant le sélecteur.
  */
  const untaggedOwned = masterSet
    ? matching.filter((item) => !item.variant?.trim()).length
    : 0;

  return NextResponse.json({
    shelf: { id: shelf.id, name: shelf.name, slug: shelf.slug },
    masterSet,
    untaggedOwned,
    ...checklist,
  });
}
