export function isBookShelfType(type?: string | null): boolean {
  return type === "books";
}

/** i18n key for the primary “add …” CTA on a shelf, by type. */
export function itemsAddLabelKey(type?: string | null): string {
  switch (type) {
    case "tcg":
      return "items.addItemTcg";
    case "games":
    case "boardgames":
      return "items.addItemGame";
    case "books":
      return "items.addItemBook";
    case "movies":
      return "items.addItemMovie";
    case "musics":
      return "items.addItemMusic";
    case "hardware":
      return "items.addItemHardware";
    case "toys":
      return "items.addItemToy";
    default:
      return "items.addItem";
  }
}

/**
 * i18n key for the countable noun after a shelf total (`12 cartes`, `1 jeu`).
 * Singular when `count === 1`, plural otherwise (including 0).
 */
export function itemsCountNounKey(
  type?: string | null,
  count = 0,
): string {
  const singular = count === 1;
  switch (type) {
    case "tcg":
      return singular ? "items.countNounTcg" : "items.countNounTcgPlural";
    case "games":
    case "boardgames":
      return singular ? "items.countNounGame" : "items.countNounGamePlural";
    case "books":
      return singular ? "items.countNounBook" : "items.countNounBookPlural";
    case "movies":
      return singular ? "items.countNounMovie" : "items.countNounMoviePlural";
    case "musics":
      return singular ? "items.countNounMusic" : "items.countNounMusicPlural";
    case "hardware":
      return singular
        ? "items.countNounHardware"
        : "items.countNounHardwarePlural";
    case "toys":
      return singular ? "items.countNounToy" : "items.countNounToyPlural";
    default:
      return singular ? "common.item" : "common.items";
  }
}

export function itemsBarcodeLabelKey(type?: string | null): string {
  return isBookShelfType(type) ? "items.barcodeBooks" : "items.barcode";
}

export function itemsBarcodePlaceholderKey(type?: string | null): string {
  return isBookShelfType(type)
    ? "items.enterBarcodeBooks"
    : "items.enterBarcode";
}

export function scannerBarcodePlaceholderKey(type?: string | null): string {
  return isBookShelfType(type)
    ? "scanner.manualBarcodePlaceholderBooks"
    : "scanner.manualBarcodePlaceholder";
}

export function scannerEnterBarcodeKey(type?: string | null): string {
  return isBookShelfType(type)
    ? "scanner.enterBarcodeBooks"
    : "scanner.enterBarcode";
}

export function bookIdentifierLabel(barcode: string): string {
  if (barcode.length === 13 && /^97[89]/.test(barcode)) return "ISBN-13";
  if (barcode.length === 10) return "ISBN-10";
  if (barcode.length === 13) return "EAN-13";
  return "Code-barres";
}
