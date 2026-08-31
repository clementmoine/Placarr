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
 */
import { NextRequest, NextResponse } from "next/server";

import { buildChecklistForShelf } from "@/lib/collect/shelfChecklist";
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

  const items = await prisma.item.findMany({
    where: { shelfId: shelf.id, printKey: { not: null } },
    select: { printKey: true, language: true },
  });

  const params = request.nextUrl.searchParams;
  const language =
    params.get("language")?.trim().toLowerCase() || dominantLanguage(items);

  /*
    Les exemplaires d'une autre langue ne comptent pas comme possédés : avoir
    l'Inari japonaise ne complète pas la Série 1 française. Un exemplaire dont
    la langue est inconnue est compté — le retirer punirait un item que la
    passe de rattrapage n'a pas su trancher.
  */
  const owned = new Set(
    items
      .filter((item) => {
        const code = item.language?.trim().toLowerCase();
        return !language || !code || code === language;
      })
      .map((item) => item.printKey!.trim().toLowerCase()),
  );

  const checklist = await buildChecklistForShelf({
    shelfType: shelf.type as MediaType,
    owned,
    language,
    shelfName: shelf.name,
  });

  return NextResponse.json({
    shelf: { id: shelf.id, name: shelf.name, slug: shelf.slug },
    ...checklist,
  });
}
