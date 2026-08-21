#!/usr/bin/env tsx
/**
 * Confronte les catégories déclarées à celles que chaque site publie vraiment.
 *
 *   npx tsx src/providers/shared/dbscards/auditCategories.ts
 *
 * Les cartes se découvrent seules — le `<select>` de séries chez Bandai, le
 * dump complet chez LorcanaJSON. Les **produits scellés**, non : chaque hôte
 * expose ses rayons sous `/products/{slug}` et la liste vit dans `sites.ts`.
 * Un slug oublié ne lève aucune erreur, il rend simplement ses produits
 * invisibles — c'est ainsi que `prerelease-packs` a caché deux packs
 * avant-première Lorcana jusqu'au 2026-08-19.
 *
 * Un slug vu sur un site, typé autrement que `skip` dans
 * `TCGCARDS_CATEGORY_ROLES` et absent du descripteur, est un trou. Les slugs
 * inconnus sont signalés à part : la plupart sont des accessoires (tapis,
 * pochettes) ou des rouages du site (`loader`, `suggest`, `fr`, `en`), mais
 * c'est là qu'un nouveau rayon apparaîtra.
 */
import { httpGet } from "@/lib/http/httpClient";

import {
  TCGCARDS_SITES,
  tcgCardsCategoryRole,
  type TcgCardsSite,
} from "./sites";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type CategoryAudit = {
  site: string;
  /** Rayons publiés, typés ailleurs que `skip`, absents du descripteur. */
  missing: string[];
  /** Déclarés ici mais introuvables dans la nav du site. */
  stale: string[];
  /** Slugs que le rôle ne connaît pas — accessoires et rouages, à trier. */
  unknown: string[];
  reachable: boolean;
};

export async function liveNavSlugs(origin: string): Promise<string[] | null> {
  try {
    const res = await httpGet(origin, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "text",
      timeout: 25_000,
    });
    const html = String((res as { data?: unknown }).data ?? "");
    return [
      ...new Set(
        [...html.matchAll(/\/products\/([a-z0-9-]+)/gi)].map((m) =>
          m[1]!.toLowerCase(),
        ),
      ),
    ].sort();
  } catch {
    return null;
  }
}

export function auditSiteCategories(
  site: TcgCardsSite,
  liveSlugs: readonly string[] | null,
): CategoryAudit {
  if (!liveSlugs) {
    return {
      site: site.id,
      missing: [],
      stale: [],
      unknown: [],
      reachable: false,
    };
  }
  const declared = new Set(site.categories);
  const missing: string[] = [];
  const unknown: string[] = [];
  for (const slug of liveSlugs) {
    if (declared.has(slug)) continue;
    if (tcgCardsCategoryRole(slug) === "skip") unknown.push(slug);
    else missing.push(slug);
  }
  return {
    site: site.id,
    missing,
    stale: site.categories.filter((c) => !liveSlugs.includes(c)),
    unknown,
    reachable: true,
  };
}

async function main(): Promise<void> {
  let holes = 0;
  for (const site of Object.values(TCGCARDS_SITES)) {
    const audit = auditSiteCategories(site, await liveNavSlugs(site.origin));
    if (!audit.reachable) {
      console.log(`${site.id.padEnd(10)} injoignable — ${site.origin}`);
      continue;
    }
    holes += audit.missing.length;
    const parts = [`${String(site.categories.length).padStart(2)} déclarées`];
    if (audit.missing.length) parts.push(`TROU: ${audit.missing.join(", ")}`);
    if (audit.stale.length) parts.push(`hors nav: ${audit.stale.join(", ")}`);
    if (audit.unknown.length) parts.push(`inconnus (${audit.unknown.length})`);
    console.log(`${site.id.padEnd(10)} ${parts.join(" | ")}`);
  }
  console.log(
    holes ? `\n${holes} rayon(s) à déclarer.` : "\nAucun rayon manquant.",
  );
}

if (process.argv[1]?.endsWith("auditCategories.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
