/**
 * Donne sa langue à chaque exemplaire déjà rangé, puis le re-slugue.
 *
 * La colonne `Item.language` est arrivée le 2026-08-21, après 238 ajouts. Sans
 * elle, deux localisations d'une même carte étaient le même objet : même clé,
 * même slug, et la seconde recevait un `-copy-N` qui affirmait qu'elle
 * dupliquait la première.
 *
 * **Deux indices, aucun devinement.**
 *
 * 1. Le chemin de l'image, quand elle vient d'un pack : `…/cards/ni/ni0046/fr/`
 *    porte la langue dans son avant-dernier segment.
 * 2. Le **nom stocké**, comparé aux titres du catalogue langue par langue. Une
 *    correspondance exacte sur une seule langue tranche ; sur plusieurs — Inari
 *    s'écrit pareil en français et en italien — elle ne tranche pas, et on
 *    laisse `null`.
 *
 * `null` veut dire **inconnu**, jamais « la langue par défaut ». Un exemplaire
 * sans langue garde son ancien slug, qui reste une URL valide.
 *
 *   pnpm tsx scripts/backfillItemLanguage.ts [--apply]
 */
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { parsePrintKey } from "@/core/identify/printKey";
import { prisma } from "@/lib/db/prisma";
import { printKeyItemSlug } from "@/lib/routing/slugs";

/** `…/cards/ni/ni0046/fr/art.webp` → `fr`. */
function languageFromImagePath(url: string | null): string | null {
  const match = /\/(?:cards|products)\/[^/]+\/[^/]+\/([a-z]{2})\//.exec(
    url ?? "",
  );
  return match ? match[1] : null;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Les langues dont le catalogue donne exactement ce titre pour cette clé.
 *
 * Rendre **toutes** les langues qui collent, et non la première, est ce qui
 * rend l'indice honnête : deux langues qui répondent, c'est un indice qui ne
 * tranche pas.
 */
async function languagesMatchingTitle(
  printKey: string,
  name: string,
): Promise<string[]> {
  const wanted = normalizeTitle(name);
  if (!wanted) return [];
  const game = parsePrintKey(printKey)?.game;
  if (!game) return [];
  const hits = new Set<string>();
  for (const provider of PROVIDER_MODULES) {
    if (!provider.lookupPrint && !provider.searchPrints) continue;
    try {
      const rows = provider.searchPrints
        ? await provider.searchPrints({ query: printKey, limit: 40 })
        : [];
      for (const row of rows) {
        if (row.printKey?.trim().toLowerCase() !== printKey) continue;
        if (normalizeTitle(row.title ?? "") !== wanted) continue;
        const lang = row.language?.trim().toLowerCase();
        if (lang) hits.add(lang);
      }
    } catch {
      /* un provider muet n'invalide pas les autres */
    }
  }
  return [...hits];
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const items = await prisma.item.findMany({
    where: { printKey: { not: null }, language: null },
    select: {
      id: true,
      name: true,
      slug: true,
      shelfId: true,
      printKey: true,
      variant: true,
      imageUrl: true,
    },
  });

  let fromPath = 0;
  let fromTitle = 0;
  const undecided: string[] = [];
  const updates: { id: string; language: string; slug: string }[] = [];

  for (const item of items) {
    const printKey = item.printKey!.trim().toLowerCase();
    let language = languageFromImagePath(item.imageUrl);
    if (language) fromPath += 1;
    else {
      const matches = await languagesMatchingTitle(printKey, item.name);
      if (matches.length === 1) {
        language = matches[0];
        fromTitle += 1;
      } else {
        undecided.push(
          `${printKey} « ${item.name} »${matches.length > 1 ? ` — ${matches.join("/")} disent la même chose` : ""}`,
        );
        continue;
      }
    }
    const slug = printKeyItemSlug(printKey, item.variant, language);
    if (slug) updates.push({ id: item.id, language, slug });
  }

  console.log(`items sans langue        : ${items.length}`);
  console.log(`  par le chemin d'image  : ${fromPath}`);
  console.log(`  par le titre catalogue : ${fromTitle}`);
  console.log(`  indécidables           : ${undecided.length}`);
  for (const row of undecided.slice(0, 20)) console.log(`     ${row}`);
  if (undecided.length > 20)
    console.log(`     … et ${undecided.length - 20} autres`);

  if (!apply) {
    console.log("\n(essai à blanc — relancer avec --apply)");
    return;
  }

  /*
    Le slug est réservé par étagère : deux exemplaires d'une même carte dans la
    même langue restent des copies, et gardent leur suffixe. On ne réattribue
    donc que les slugs libres, et on laisse l'ancien là où il ne l'est pas.
  */
  const takenByShelf = new Map<string, Set<string>>();
  for (const item of await prisma.item.findMany({
    select: { shelfId: true, slug: true },
  })) {
    if (!item.slug) continue;
    const set = takenByShelf.get(item.shelfId) ?? new Set<string>();
    set.add(item.slug);
    takenByShelf.set(item.shelfId, set);
  }
  const shelfOf = new Map(items.map((item) => [item.id, item.shelfId]));
  const oldSlug = new Map(items.map((item) => [item.id, item.slug]));

  let reslugged = 0;
  for (const update of updates) {
    const shelfId = shelfOf.get(update.id)!;
    const taken = takenByShelf.get(shelfId) ?? new Set<string>();
    const previous = oldSlug.get(update.id) ?? null;
    const free = !taken.has(update.slug) || previous === update.slug;
    await prisma.item.update({
      where: { id: update.id },
      data: {
        language: update.language,
        ...(free ? { slug: update.slug } : {}),
      },
    });
    if (free) {
      if (previous) taken.delete(previous);
      taken.add(update.slug);
      takenByShelf.set(shelfId, taken);
      reslugged += 1;
    }
  }
  console.log(`\nlangue posée : ${updates.length} | re-slugués : ${reslugged}`);
}

void main().finally(() => prisma.$disconnect());
