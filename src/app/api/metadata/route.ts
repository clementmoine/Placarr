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
import { existingLocalizedUploadForUrl } from "@/core/enrich/media/imageDownload";

import type { MetadataResult } from "@/types/metadataProvider";

/**
 * Point every image at its local copy when one is already on disk.
 *
 * A localized file is named `md5(sourceUrl)`, so the provider URL and its
 * download are the same picture under two names — and a client merging this
 * response with what it already stored would list that picture twice. Answering
 * with one URL per image is also simply more accurate: the file we have is the
 * file we will serve.
 */
async function withLocalizedImageUrls(
  metadata: MetadataResult | null | undefined,
): Promise<MetadataResult | null | undefined> {
  if (!metadata) return metadata;

  const localize = async (url?: string | null) =>
    url && /^https?:\/\//i.test(url)
      ? ((await existingLocalizedUploadForUrl(url)) ?? url)
      : url;

  const attachments = metadata.attachments
    ? await Promise.all(
        metadata.attachments.map(async (attachment) => ({
          ...attachment,
          url: (await localize(attachment.url)) ?? attachment.url,
        })),
      )
    : undefined;

  return {
    ...metadata,
    imageUrl: (await localize(metadata.imageUrl)) ?? metadata.imageUrl,
    ...(attachments ? { attachments } : {}),
  };
}

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
    return NextResponse.json(await withLocalizedImageUrls(filtered));
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
