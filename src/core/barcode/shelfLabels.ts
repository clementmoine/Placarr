export function isBookShelfType(type?: string | null): boolean {
  return type === "books";
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
