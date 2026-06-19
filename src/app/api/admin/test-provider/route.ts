import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { extractProductName } from "@/lib/productName";

import {
  confrontWithDatabase,
  getDatabaseSuggestions,
  type MetadataResult,
} from "@/services/metadata";
import { testProviderHandlers } from "@/services/providerTestHandlers";

async function processScrapedNames(
  rawNames: string[] | undefined,
  type: string | null,
) {
  if (!rawNames) {
    return { rawNames: null, extractedName: null, suggestions: [] };
  }
  const name = extractProductName(rawNames);
  const confrontedName = name ? await confrontWithDatabase(name, type) : null;
  const dbSuggestions = name ? await getDatabaseSuggestions(name, type) : [];

  const suggestions = [
    confrontedName,
    ...dbSuggestions,
    name,
    ...rawNames,
  ].filter((s): s is string => !!s);
  const seen = new Set<string>();
  const uniqueSuggestions: string[] = [];
  for (const s of suggestions) {
    const norm = s.toLowerCase().trim();
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      uniqueSuggestions.push(s.trim());
    }
  }

  return {
    rawNames,
    extractedName: confrontedName || name,
    suggestions: uniqueSuggestions.slice(0, 6),
  };
}

async function processResolvedProducts(
  products: Array<{ name: string; coverUrl?: string | null }>,
  type: string | null,
) {
  const suggestions: string[] = [];
  const matches: {
    cleanName: string;
    rawName: string;
    coverUrl?: string | null;
  }[] = [];
  let firstConfrontedName: string | null = null;

  for (const product of products) {
    const rawName = product.name;
    const confrontedName = await confrontWithDatabase(rawName, type);

    matches.push({
      cleanName: confrontedName || rawName,
      rawName,
      coverUrl: product.coverUrl,
    });

    if (confrontedName) {
      if (!firstConfrontedName) firstConfrontedName = confrontedName;
      suggestions.push(confrontedName);
    }
    const dbSuggestions = await getDatabaseSuggestions(rawName, type);
    suggestions.push(...dbSuggestions);
    suggestions.push(rawName);
  }

  const uniqueSuggestions = Array.from(
    new Set(suggestions.map((item) => item.toLowerCase().trim())),
  )
    .map((normalized) =>
      suggestions.find((item) => item.toLowerCase().trim() === normalized),
    )
    .filter((item): item is string => Boolean(item))
    .map((item) => item.trim());

  return {
    matches,
    rawNames: products.map((product) => product.name),
    extractedName:
      firstConfrontedName || (products[0] ? products[0].name : null),
    suggestions: uniqueSuggestions.slice(0, 6),
  };
}

function metadataBarcodeResult(metadata: MetadataResult | null) {
  const rawTitle = metadata?.title || null;
  return {
    rawNames: rawTitle ? [rawTitle] : [],
    extractedName: rawTitle,
    rawResponse: metadata,
  };
}

export async function POST(req: NextRequest) {
  // Ensure the user is an admin
  const adminCheck = await requireAdmin();
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  try {
    const body = await req.json();
    const { provider, query, type } = body;

    if (!provider || !query) {
      return NextResponse.json(
        { error: "Missing provider or query" },
        { status: 400 },
      );
    }

    let result: any = null;
    let providerName = "";

    const handler = testProviderHandlers[provider];
    if (!handler) {
      return NextResponse.json(
        { error: `Unknown provider: ${provider}` },
        { status: 400 },
      );
    }
    providerName = handler.label;

    const resolved = await handler.run(query, type || null);

    if (handler.kind === "scraped-list") {
      result = await processResolvedProducts(
        (resolved as Array<{ name: string; coverUrl?: string | null }>) || [],
        type || null,
      );
    } else if (handler.kind === "scandex") {
      const scandex = resolved as {
        igdb_metadata?: {
          name?: string;
          platform?: { name?: string | null } | null;
        } | null;
      } | null;
      const rawNames = scandex?.igdb_metadata?.name ? [scandex.igdb_metadata.name] : [];
      const processed = await processScrapedNames(rawNames, type || null);
      result = {
        ...processed,
        platformName: scandex?.igdb_metadata?.platform?.name || null,
        rawResponse: scandex,
      };
    } else if (handler.kind === "prices") {
      result = { prices: resolved };
    } else if (handler.kind === "metadata-barcode") {
      result = metadataBarcodeResult((resolved as MetadataResult | null) || null);
    } else if (handler.kind === "metadata") {
      result = { metadata: resolved };
    } else if (handler.kind === "cover") {
      result = { coverUrl: resolved || null };
    }

    return NextResponse.json({
      success: true,
      provider: providerName,
      query,
      result,
    });
  } catch (error: any) {
    console.error("[TestProvider] Error running provider test:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "An error occurred during testing",
        details: error.response?.data || null,
      },
      { status: 500 },
    );
  }
}
