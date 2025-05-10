import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

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

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const barcode = req.nextUrl.searchParams.get("q");

  const cleanedBarcode = cleanCode(barcode);

  if (!cleanedBarcode.length) {
    return NextResponse.json({ error: "Missing barcode" }, { status: 400 });
  }

  let cachedResult;
  try {
    cachedResult = await prisma.barcodeCache.findUnique({
      where: { barcode: cleanedBarcode },
      include: {
        rawNames: true,
      },
    });
  } catch (error) {
    console.error("Error fetching from barcode cache:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (cachedResult) {
    const rawNames = cachedResult.rawNames.map((n) => n.value);

    return NextResponse.json({
      barcode: cachedResult.barcode,
      rawNames: rawNames,
      provider: cachedResult.provider,
      cleanName: extractProductName(rawNames),
    });
  }

  console.log("No cache available");

  for (const provider of providers) {
    try {
      const query = createBarcodeQuery(cleanedBarcode);

      const rawNames = await provider.search(query);

      if (rawNames) {
        try {
          await prisma.barcodeCache.create({
            data: {
              barcode: cleanedBarcode,
              rawNames: {
                create: rawNames.map((value) => ({ value })),
              },
              provider: provider.name,
            },
          });
        } catch (dbError) {
          console.error(
            `[${provider.name}] Error saving to database:`,
            dbError,
          );
        }

        const name = extractProductName(rawNames);

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
