import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { AvesAPI } from "@/services/avesAPI";
import { DataForSEO } from "@/services/dataForSEO";
import { ScaleSerp } from "@/services/scaleSerp";
import { SerpAPI } from "@/services/serpAPI";
import { SerpWow } from "@/services/serpWow";
import { ValueSerp } from "@/services/valueSerp";

const providers = [
  new SerpWow(),
  new ValueSerp(),
  new ScaleSerp(),
  new SerpAPI(),
  new AvesAPI(),
  new DataForSEO(),
];

const prisma = new PrismaClient();

function cleanName(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .replace(
      /\b(au meilleur prix|meilleur prix|neuf|occasion|prix choc|pas cher|offre spéciale|nouveauté|remise|promotion|promo|livraison gratuite|top vente|en stock|expédié rapidement|100% original|nouveau modèle)\b/gi,
      "",
    )
    .replace(/\s*\|.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  const barcode = req.nextUrl.searchParams.get("q");

  if (!barcode) {
    return NextResponse.json({ error: "Missing barcode" }, { status: 400 });
  }

  const cleanedBarcode = barcode.trim().replace(/\s+/g, "");

  let cachedResult;
  try {
    cachedResult = await prisma.barcodeCache.findUnique({
      where: { barcode: cleanedBarcode },
    });
  } catch (error) {
    console.error("Error fetching from barcode cache:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (cachedResult) {
    return NextResponse.json({
      barcode: cachedResult.barcode,
      name: cachedResult.name,
      cleanName: cleanName(cachedResult.name),
      provider: cachedResult.provider,
    });
  }

  console.log("No cache available");

  for (const provider of providers) {
    try {
      const result = await provider.search(cleanedBarcode);

      if (result?.name) {
        try {
          await prisma.barcodeCache.create({
            data: {
              barcode: cleanedBarcode,
              name: result.name,
              provider: provider.name,
            },
          });
        } catch (dbError) {
          console.error(
            `[${provider.name}] Error saving to database:`,
            dbError,
          );
        }

        return NextResponse.json({
          ...result,
          provider: provider.name,
          cleanName: cleanName(result.name),
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
