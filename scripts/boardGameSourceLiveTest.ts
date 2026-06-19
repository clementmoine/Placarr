#!/usr/bin/env npx tsx
/**
 * Live smoke test for board game metadata sources proposed in admin audit.
 */
import { createBGGResolver } from "@/services/providers/bgg/resolver";
import { createPhilibertResolver } from "@/services/providers/philibert/resolver";
import { createWikidataResolver } from "@/services/providers/wikidata/resolver";
import { fetchFromAchatMoinsCher } from "@/services/providers/achatmoinscher";
import { formatScore } from "@/services/metadataSearchUtils";
import { mergeBoardGameMetadata } from "@/services/metadataMerge";
import axios from "axios";

const SAMPLE = { name: "Catan", barcode: "3558380126133" };

async function probeRetailer(label: string, searchUrl: string) {
  try {
    const response = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 Chrome/120" },
      timeout: 12000,
    });
    const html =
      typeof response.data === "string"
        ? response.data
        : response.data.rendered_products || "";
    const hasProducts =
      typeof html === "string" &&
      (html.includes("product") ||
        html.includes("catan") ||
        html.includes("Catan"));
    console.log(`[${label}]`, hasProducts ? "search ok" : "empty/unknown");
    return hasProducts;
  } catch (error: any) {
    console.log(`[${label}]`, "fail", error?.response?.status || error.message);
    return false;
  }
}

async function main() {
  console.log("=== Board game source live test ===\n");

  const fetchFromWikidata = createWikidataResolver();
  const fetchFromPhilibert = createPhilibertResolver();
  const fetchFromBGG = createBGGResolver({ formatScore });

  const wikidata = await fetchFromWikidata(SAMPLE.name);
  console.log("Wikidata:", {
    ok: Boolean(wikidata?.title),
    title: wikidata?.title,
    descLen: wikidata?.description?.length,
    image: Boolean(wikidata?.imageUrl),
  });

  const philibert = await fetchFromPhilibert(SAMPLE.name, SAMPLE.barcode);
  console.log("Philibert:", {
    ok: Boolean(philibert?.title),
    title: philibert?.title,
    descLen: philibert?.description?.length,
    barcode: philibert?.barcode,
    image: Boolean(philibert?.imageUrl),
  });

  const bgg = await fetchFromBGG(SAMPLE.name);
  console.log("BGG:", {
    ok: Boolean(bgg?.title),
    title: bgg?.title,
    blocked: !process.env.BGG_API_TOKEN ? "BGG_API_TOKEN missing" : undefined,
    duration: bgg?.duration,
  });

  const amc = await fetchFromAchatMoinsCher(SAMPLE.barcode);
  console.log("AchatMoinsCher:", {
    ok: amc.length > 0,
    title: amc[0]?.name,
    cover: Boolean(amc[0]?.coverUrl),
  });

  const merged = mergeBoardGameMetadata(
    bgg,
    wikidata,
    philibert ? [philibert] : [],
  );
  console.log("Merged:", {
    title: merged.title,
    descLen: merged.description?.length,
    barcode: merged.barcode,
    facts: merged.facts?.length,
  });

  console.log("\n=== Retailers (search only) ===");
  await probeRetailer(
    "Monsieur de",
    "https://www.monsieurde.com/recherche?controller=search&s=catan&ajax=1",
  );
  await probeRetailer(
    "BCD Jeux",
    "https://www.bcd-jeux.fr/recherche?controller=search&search_query=catan&ajax=1",
  );
  await probeRetailer(
    "Le Passe-Temps",
    "https://www.le-passe-temps.com/recherche?controller=search&search_query=catan&ajax=1",
  );
  await probeRetailer(
    "Idealo",
    "https://www.idealo.fr/preisvergleich/MainSearchProductCategory.html?q=catan",
  );
  console.log(
    "\nSkipped: Ludum (blog), BGA (jeu en ligne), TCGAPIs (clé payante)",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
