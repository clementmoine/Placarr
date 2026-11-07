import { NextResponse } from "next/server";

import { assetsPrintFaceUrl, isPokemonAssetPack } from "@/lib/packAssetUrls";
import { resolveAssetsDiskRoot, splitAssetsPackPath } from "@/lib/packPaths";
import {
  matchPrintsAssetRest,
  resolvePrintFace,
} from "@/lib/media/resolvePrintFace";
import {
  matchAssetsBacksRest,
  resolveRoleBack,
} from "@/lib/media/resolveRoleBack";
import {
  matchSealedProductsAssetRest,
  resolveSealedProductFace,
} from "@/providers/shared/sealedProducts/resolveProductFace";
import {
  legacyLangFirstCardsRest,
  legacySetFirstCardsRest,
  pokemonCardsRestFallbacks,
} from "@/lib/media/legacySetFirstCardsRest";
import {
  resolveUnderRoot,
  streamFileResponse,
} from "@/lib/media/streamDataFile";
import {
  narutoLangFirstAssetsRest,
  narutoRetailAssetsRest,
} from "@/providers/naruto/narutocarddass/diskArtAttachments";

type Ctx = { params: Promise<{ path?: string[] }> };

function tryResolveRest(pack: string, rest: string[]): string | null {
  const mapped = resolveAssetsDiskRoot(pack, rest);
  if (!mapped) return null;
  return resolveUnderRoot(mapped.root, mapped.relative);
}

function resolveAssetFile(
  pack: string,
  rest: string[],
): string | null {
  const hit = tryResolveRest(pack, rest);
  if (hit) return hit;

  /*
    Stale Item URLs: cards/{set}/{lang}/{card}/… while disk is lang-first
    (Dragon Ball Masters/JCC, etc.). Try the swapped path before pack-specific
    remaps.
  */
  const langFirstRest = legacySetFirstCardsRest(rest);
  if (langFirstRest) {
    const lfHit = tryResolveRest(pack, langFirstRest);
    if (lfHit) return lfHit;
  }

  /*
    Pokémon Live (and any pack still on set-first disk): client URLs are
    lang-first (`cards/fr/xy12/011/art.webp`) while bytes sit at
    `cards/xy12/en/011/…`.
  */
  const setFirstRest = legacyLangFirstCardsRest(rest);
  if (setFirstRest) {
    const sfHit = tryResolveRest(pack, setFirstRest);
    if (sfHit) return sfHit;
  }

  if (isPokemonAssetPack(pack)) {
    for (const candidate of pokemonCardsRestFallbacks(rest)) {
      const alt = tryResolveRest(pack, candidate);
      if (alt) return alt;
    }
  }

  if (pack === "naruto/carddass" || pack.startsWith("naruto/")) {
    // Pre–lang-first Item URLs: cards/ninja/ni0001/fr/… → cards/fr/s1/ni0001/…
    const narutoLangFirst = narutoLangFirstAssetsRest(rest);
    if (narutoLangFirst) {
      const lfHit = tryResolveRest(pack, narutoLangFirst);
      if (lfHit) return lfHit;
    }
    // Stale Metadata still points at `…/ta0081-promo/…` while bytes are retail.
    const retailRest = narutoRetailAssetsRest(rest);
    if (retailRest) {
      const retailHit = tryResolveRest(pack, retailRest);
      if (retailHit) return retailHit;
    }
  }
  return null;
}

/** Pack assets are public — the collection is browsable without unlock. */
export async function GET(req: Request, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  if (!segments?.length) {
    return new NextResponse("Not found", { status: 404 });
  }
  const split = splitAssetsPackPath(segments);
  if (!split || split.rest.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Role backs (all packs): /assets/<pack>/backs/{lang}[/sets/{set}|/tiers/{tier}]
  if (split.rest[0] === "backs") {
    const matched = matchAssetsBacksRest(split.rest);
    if (!matched) {
      return new NextResponse("Not found", { status: 404 });
    }
    const hit = resolveRoleBack(split.pack, matched);
    if (!hit) {
      return new NextResponse("Not found", { status: 404 });
    }
    const diskLabel =
      hit.kind === "set" && hit.set
        ? `${hit.lang}/${hit.set}/back`
        : hit.kind === "tier" && hit.tier
          ? `back.${hit.tier}`
          : `${hit.lang}/back`;
    return streamFileResponse(hit.filePath, {
      request: req,
      cache: "revalidate",
      headers: {
        "X-Placarr-Art-Source": "owned",
        "X-Placarr-Art-Disk": diskLabel,
        "Access-Control-Expose-Headers":
          "X-Placarr-Art-Source, X-Placarr-Art-Disk",
      },
    });
  }

  // Sealed SKU roles: /assets/<pack>/products/{slug}/{lang}/face|thumb|back|logo
  if (split.rest[0] === "products") {
    const matched = matchSealedProductsAssetRest(split.rest);
    if (matched) {
      const hit = resolveSealedProductFace({
        packId: split.pack,
        slug: matched.slug,
        lang: matched.lang,
        role: matched.role,
      });
      if (!hit) {
        return new NextResponse("Not found", { status: 404 });
      }
      return streamFileResponse(hit.filePath, {
        request: req,
        cache: "revalidate",
        headers: {
          "X-Placarr-Art-Source": "owned",
          "X-Placarr-Art-Disk": `${hit.disk.slug}/${hit.disk.lang}/${hit.artFile}`,
          "Access-Control-Expose-Headers":
            "X-Placarr-Art-Source, X-Placarr-Art-Disk",
        },
      });
    }
  }

  // Print-scoped face: /assets/<pack>/prints/{set}-{id}-{lang}/face
  if (split.rest[0] === "prints") {
    const matched = matchPrintsAssetRest(split.pack, split.rest);
    if (!matched) {
      return new NextResponse("Not found", { status: 404 });
    }
    const hit = resolvePrintFace({
      pack: split.pack,
      printKey: matched.printKey,
      lang: matched.lang,
      role: matched.role,
    });
    if (!hit) {
      return new NextResponse("Not found", { status: 404 });
    }
    const headers: Record<string, string> = {
      "X-Placarr-Art-Source": hit.source,
      "X-Placarr-Art-Disk": `${hit.disk.lang}/${hit.disk.set}/${hit.disk.card}/${hit.artFile}`,
      "Access-Control-Expose-Headers":
        "X-Placarr-Art-Source, X-Placarr-Art-Donor, X-Placarr-Art-Disk",
    };
    if (hit.donorPrintKey) {
      headers["X-Placarr-Art-Donor"] = hit.donorPrintKey;
    }
    if (hit.source === "borrowed" && hit.donorPrintKey) {
      headers["Content-Location"] = assetsPrintFaceUrl(
        split.pack,
        hit.donorPrintKey,
        hit.disk.lang,
        matched.role,
      );
    }
    return streamFileResponse(hit.filePath, {
      request: req,
      cache: "revalidate",
      headers,
    });
  }

  const filePath = resolveAssetFile(split.pack, split.rest);
  if (!filePath) {
    return new NextResponse("Not found", { status: 404 });
  }
  return streamFileResponse(filePath, {
    request: req,
    /*
      Pack faces keep stable names (`art.imadoki.jpg`, `art.coleka.webp`) while
      harvest/install rewrites them in place. `immutable` made a remapped NS
      planche invisible: the file on disk was Kakashi and the browser kept
      serving the old sequential cut forever.
    */
    cache: "revalidate",
  });
}
