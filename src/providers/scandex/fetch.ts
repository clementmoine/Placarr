import axios from "axios";

export interface ScanDexLookupResult {
  id: number;
  source: string;
  igdb_metadata?: {
    id: number;
    name: string;
    platform?: {
      id: number;
      name: string;
    } | null;
  } | null;
}

type ScanDexLookupOptions = {
  timeoutMs?: number;
  suppressNotFoundLog?: boolean;
};

export async function fetchFromScanDex(
  barcode: string,
  options: ScanDexLookupOptions = {},
): Promise<ScanDexLookupResult | null> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return null;

  const token = process.env.SCANDEX_ACCESS_TOKEN;
  if (!token) {
    console.warn(
      "[ScanDex] Access token not configured in environment variables.",
    );
    return null;
  }

  try {
    const res = await axios.get<ScanDexLookupResult>(
      "https://scandex.gamery.app/api/v2/lookup",
      {
        params: { value: cleanedBarcode },
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: options.timeoutMs ?? 5000,
      },
    );
    return res.data ?? null;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      if (!options.suppressNotFoundLog) {
        console.info(`[ScanDex] Barcode "${cleanedBarcode}" not found (404).`);
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ScanDex] Error fetching barcode "${cleanedBarcode}":`,
        message,
      );
    }
    return null;
  }
}
