/**
 * Dernière capture Wayback (HTTP 200, HTML) d'une page — repli quand
 * l'origine est murée. Rend le HTML brut (`id_`) et la citation ouvrable
 * (`/web/<ts>/<url>`), jamais une page d'accueil.
 */
import { waybackPublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import { httpGet } from "@/lib/http/httpClient";

import { fetchCdxRows, pickLatestCdxRow, type CdxCaptureRow } from "./cdx";
import { waybackRawUrl } from "./waybackRawUrl";

export type WaybackHtmlCapture = {
  html: string;
  timestamp: string;
  original: string;
  /** Copie archivée lisible (citation). */
  citationUrl: string;
};

export function waybackCdxQueryUrl(originalUrl: string): string {
  const target = originalUrl.replace(/^https?:\/\//i, "");
  return `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(target)}&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&filter=mimetype:text/html`;
}

async function defaultFetchText(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      responseType: "text",
      timeout: 60_000,
      validateStatus: (s) => s === 200,
    });
    return String(res.data);
  } catch {
    return null;
  }
}

export async function fetchWaybackLatestHtml(
  originalUrl: string,
  opts: {
    fetchRows?: (cdxUrl: string) => Promise<CdxCaptureRow[]>;
    fetchText?: (url: string) => Promise<string | null>;
  } = {},
): Promise<WaybackHtmlCapture | null> {
  const fetchRows =
    opts.fetchRows ??
    ((cdxUrl: string) =>
      fetchCdxRows(cdxUrl, originalUrl, {
        attempts: 2,
        timeoutMs: 60_000,
        log: () => {},
      }));
  const fetchText = opts.fetchText ?? defaultFetchText;
  let rows: CdxCaptureRow[];
  try {
    rows = await fetchRows(waybackCdxQueryUrl(originalUrl));
  } catch {
    return null;
  }
  const latest = pickLatestCdxRow(
    rows
      .filter((r) => r.statuscode === "200")
      .map((r) => [r.timestamp, r.original]),
  );
  if (!latest) return null;
  const html = await fetchText(
    waybackRawUrl(latest.timestamp, latest.original),
  );
  if (!html || html.length < 400) return null;
  return {
    html,
    timestamp: latest.timestamp,
    original: latest.original,
    citationUrl: waybackPublicCitationUrl(latest.timestamp, latest.original),
  };
}
