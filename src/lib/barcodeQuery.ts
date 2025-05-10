export function cleanCode(barcode?: string | null): string {
  if (!barcode) return "";

  return barcode.replace(/[^\d]/g, "").trim();
}

export function createBarcodeQuery(barcode: string): string {
  const websites = [
    "allocine.fr",
    "amazon.fr",
    "auchan.fr",
    "boulanger.fr",
    "carrefour.fr",
    "cdiscount.com",
    "chapitre.com",
    "cultura.com",
    "darty.com",
    "decitre.fr",
    "deezer.com",
    "discogs.com",
    "dvdfr.com",
    "e.leclerc",
    "ebay.fr",
    "espritjeu.com",
    "filmcomplet.fr",
    "fnac.com",
    "furet.com",
    "gibert.com",
    "grosbill.com",
    "jeuxvideo.com",
    "ldlc.com",
    "leboncoin.fr",
    "librairiesindependantes.com",
    "ludifolie.com",
    "micromania.fr",
    "philibert.fr",
    "placedeslibraires.fr",
    "qobuz.com",
    "rakuten.fr",
    "rueducommerce.fr",
    "trictrac.net",
  ];

  const cleanedBarcode = cleanCode(barcode);

  const siteQueries = websites.map((site) => `site:${site}`).join(" OR ");

  return `${cleanedBarcode} (${siteQueries})`;
}
