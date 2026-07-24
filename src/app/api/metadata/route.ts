import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import {
  getMetadata,
  getDatabaseSuggestions,
  filterMetadataForShelfPlatform,
} from "@/core/enrich";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";
import { normalizeRomChecksums } from "@/core/enrich/romChecksums";
import { isAbortError } from "@/lib/http/abort";

export async function GET(req: NextRequest) {
  // Proxy vers des API tierces (souvent payantes) → auth obligatoire.
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    const type = searchParams.get("type");
    const barcode = searchParams.get("barcode");
    const platform = searchParams.get("platform");
    const shelfName = searchParams.get("shelfName");
    const suggestions = searchParams.get("suggestions") === "true";
    const romChecksums = normalizeRomChecksums({
      crc: searchParams.get("crc") || searchParams.get("crc32"),
      md5: searchParams.get("md5"),
      sha1: searchParams.get("sha1"),
    });

    if (!name || !type) {
      return NextResponse.json(
        { error: "Name and type are required" },
        { status: 400 },
      );
    }

    const resolvedPlatform = resolveGameMetadataPlatform(
      platform,
      shelfName,
      type,
    );

    if (suggestions) {
      const list = await getDatabaseSuggestions(
        name,
        type,
        resolvedPlatform ?? platform,
      );
      return NextResponse.json(list);
    }

    const metadata = await getMetadata(name, type, barcode, platform, {
      shelfName,
      queuePriority: "high",
      romChecksums,
    });
    const filtered =
      metadata && shelfName
        ? filterMetadataForShelfPlatform(metadata, {
            type,
            name: shelfName,
          })
        : metadata;
    return NextResponse.json(filtered);
  } catch (error) {
    if (isAbortError(error)) {
      return NextResponse.json(null);
    }
    console.error("Error in GET request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
