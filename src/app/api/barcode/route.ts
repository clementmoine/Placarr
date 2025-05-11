import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { AvesAPI } from "@/services/serp/avesAPI";
import { DataForSEO } from "@/services/serp/dataForSEO";
import { ScaleSerp } from "@/services/serp/scaleSerp";
import { SerpAPI } from "@/services/serp/serpAPI";
import { SerpWow } from "@/services/serp/serpWow";
import { ValueSerp } from "@/services/serp/valueSerp";

import { extractProductName } from "@/lib/productName";
import { cleanCode, createBarcodeQuery } from "@/lib/barcodeQuery";

const providers = [
  new SerpWow(),
  new ValueSerp(),
  new ScaleSerp(),
  new SerpAPI(),
  new AvesAPI(),
  new DataForSEO(),
];

export async function GET(req: NextRequest) {
  const barcode = req.nextUrl.searchParams.get("q");
  const cleanedBarcode = cleanCode(barcode);

  if (!cleanedBarcode.length) {
    return NextResponse.json({ error: "Missing barcode" }, { status: 400 });
  }

  // Check cache first
  const cachedResult = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });

  if (cachedResult) {
    const name = extractProductName(
      cachedResult.rawNames.map((rn) => rn.value),
    );
    return NextResponse.json({
      provider: cachedResult.provider,
      rawNames: cachedResult.rawNames.map((rn) => rn.value),
      cleanName: name,
    });
  }

  for (const provider of providers) {
    try {
      const query = createBarcodeQuery(cleanedBarcode);
      const rawNames = await provider.search(query);

      if (rawNames) {
        const name = extractProductName(rawNames);

        // Cache the result
        await prisma.barcodeCache.create({
          data: {
            barcode: cleanedBarcode,
            provider: provider.name,
            rawNames: {
              create: rawNames.map((name) => ({ value: name })),
            },
          },
        });

        return NextResponse.json({
          provider: provider.name,
          rawNames: rawNames,
          cleanName: name,
        });
      }
    } catch (error) {
      console.error(
        `[${provider.name}] Error searching with barcode "${cleanedBarcode}":`,
        error,
      );
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
