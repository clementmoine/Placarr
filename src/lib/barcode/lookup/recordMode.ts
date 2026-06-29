const RECORD_SLIM_SKIP_LOOKUP_KEYS = new Set(["picclick", "leDenicheur"]);

export function isBarcodeRecordSlimMode(): boolean {
  return process.env.BARCODE_RECORD_SLIM === "1";
}

export function filterBarcodeLookupTasksForRecord(
  tasks: Record<string, Promise<unknown>>,
): Record<string, Promise<unknown>> {
  if (!isBarcodeRecordSlimMode()) return tasks;
  return Object.fromEntries(
    Object.entries(tasks).filter(
      ([key]) => !RECORD_SLIM_SKIP_LOOKUP_KEYS.has(key),
    ),
  );
}
