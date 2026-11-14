/**
 * Shared Wayback CDX helpers — digs pass a query URL + label; no pack forks.
 */
import { httpGet } from "@/lib/http/httpClient";

export const WAYBACK_CDX_UA =
  "Mozilla/5.0 (compatible; PlacarrBot/1.0; +https://placarr.app)";

export type CdxCaptureRow = {
  timestamp: string;
  original: string;
  mimetype: string;
  statuscode: string;
};

/** Prefer newest capture; CDX rows are [timestamp, original, …]. */
export function pickLatestCdxRow(
  rows: readonly (readonly string[])[],
): { timestamp: string; original: string } | null {
  let best: { timestamp: string; original: string } | null = null;
  for (const row of rows) {
    const timestamp = row[0];
    const original = row[1];
    if (!timestamp || !original) continue;
    if (!best || timestamp > best.timestamp) {
      best = { timestamp, original };
    }
  }
  return best;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch CDX JSON rows with retries. `cdxUrl` is the full archive.org search URL
 * (packs own the url= filter / limit — this is transport only).
 */
export async function fetchCdxRows(
  cdxUrl: string,
  label: string,
  opts?: {
    attempts?: number;
    timeoutMs?: number;
    userAgent?: string;
    log?: (message: string) => void;
  },
): Promise<CdxCaptureRow[]> {
  const attempts = opts?.attempts ?? 5;
  const timeout = opts?.timeoutMs ?? 180_000;
  const ua = opts?.userAgent ?? WAYBACK_CDX_UA;
  const log = opts?.log ?? ((message: string) => console.log(message));
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    log(`CDX ${label} attempt ${attempt}/${attempts}…`);
    try {
      const response = await httpGet<string[][]>(cdxUrl, {
        headers: { "user-agent": ua },
        timeout,
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`CDX HTTP ${response.status}`);
      }
      const rows: CdxCaptureRow[] = [];
      for (const row of response.data) {
        if (!row[0] || row[0] === "timestamp") continue;
        rows.push({
          timestamp: row[0]!,
          original: row[1]!,
          mimetype: (row[2] || "").toLowerCase(),
          statuscode: row[3] || "",
        });
      }
      log(
        `CDX ${label} done in ${Math.round((Date.now() - started) / 1000)}s → rows=${rows.length}`,
      );
      return rows;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const wait = attempt * 3_000;
      console.warn(
        `CDX ${label} attempt ${attempt}/${attempts} failed: ${lastError.message} — retry in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw lastError ?? new Error(`CDX ${label} failed`);
}
