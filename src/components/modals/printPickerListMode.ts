import { parseNameList } from "@/core/enrich/titles/parseNameList";

/**
 * Non-empty unique lines from the print-picker search box.
 * Two or more → guided one-by-one mode.
 */
export function printPickerListLines(raw: string): string[] {
  return parseNameList(raw);
}

export function isPrintPickerListMode(raw: string): boolean {
  return printPickerListLines(raw).length >= 2;
}

/**
 * Line used for `/api/prints` search while the box may hold a full list.
 */
export function printPickerActiveSearchQuery(
  raw: string,
  listIndex: number,
): string {
  const lines = printPickerListLines(raw);
  if (lines.length >= 2) {
    const i = Math.max(0, Math.min(listIndex, lines.length - 1));
    return lines[i] ?? "";
  }
  return raw.trim();
}
