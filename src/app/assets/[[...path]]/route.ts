import { NextResponse } from "next/server";

import { assetsPrintFaceUrl } from "@/lib/packAssetUrls";
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
  resolveUnderRoot,
  streamFileResponse,
} from "@/lib/media/streamDataFile";
import {
  narutoLangFirstAssetsRest,
  narutoRetailAssetsRest,
} from "@/providers/naruto/narutocarddass/diskArtAttachments";

type Ctx = { params: Promise<{ path?: string[] }> };

function resolveAssetFile(
  pack: string,
  rest: string[],
): string | null {
  const mapped = resolveAssetsDiskRoot(pack, rest);
  if (!mapped) return null;
  const hit = resolveUnderRoot(mapped.root, mapped.relative);
  if (hit) return hit;

  if (pack === "naruto/carddass" || pack.startsWith("naruto/")) {
    // Pre–lang-first Item URLs: cards/ninja/ni0001/fr/… → cards/fr/s1/ni0001/…
    const langFirstRest = narutoLangFirstAssetsRest(rest);
    if (langFirstRest) {
      const lfMapped = resolveAssetsDiskRoot(pack, langFirstRest);
      const lfHit = lfMapped
        ? resolveUnderRoot(lfMapped.root, lfMapped.relative)
        : null;
      if (lfHit) return lfHit;
    }
    // Stale Metadata still points at `…/ta0081-promo/…` while bytes are retail.
    const retailRest = narutoRetailAssetsRest(rest);
    if (retailRest) {
      const retailMapped = resolveAssetsDiskRoot(pack, retailRest);
      if (retailMapped) {
        const retailHit = resolveUnderRoot(
          retailMapped.root,
          retailMapped.relative,
        );
        if (retailHit) return retailHit;
      }
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
        matched.lang,
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
