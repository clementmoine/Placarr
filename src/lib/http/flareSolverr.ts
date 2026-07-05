import axios from "axios";

import { isAbortError } from "@/lib/http/abort";
import { looksLikeImageBuffer } from "@/core/enrich/media/imageBuffer";

export type FlareSolverrCookies = {
  cookie: string;
  userAgent: string;
};

export type FlareSolverrDownloadedImage = {
  url: string;
  buffer: Buffer;
  contentType?: string;
};

function flareSolverrBaseUrl(): string | null {
  const flaresolverrUrl = process.env.FLARESOLVERR_URL?.trim();
  return flaresolverrUrl ? flaresolverrUrl.replace(/\/+$/, "") : null;
}

export async function flareSolverrCookiesFor(
  referer: string,
  maxTimeoutMs = 60_000,
  signal?: AbortSignal,
): Promise<FlareSolverrCookies | null> {
  const baseUrl = flareSolverrBaseUrl();
  if (!baseUrl) return null;

  try {
    const response = await axios.post(
      `${baseUrl}/v1`,
      {
        cmd: "request.get",
        url: referer,
        maxTimeout: maxTimeoutMs,
      },
      { timeout: maxTimeoutMs + 10_000, validateStatus: () => true, signal },
    );
    if (response.data?.status !== "ok") return null;
    const solution = response.data.solution;
    const cookie = (solution?.cookies || [])
      .map(
        (entry: { name: string; value: string }) =>
          `${entry.name}=${entry.value}`,
      )
      .join("; ");
    if (!cookie) return null;
    return {
      cookie,
      userAgent:
        solution?.userAgent ||
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

/**
 * Uses FlareSolverr's browser fetch (download + downloadUrls) to bypass TLS
 * fingerprinting on protected CDN assets such as Booknode /full/ JPEGs.
 */
export async function flareSolverrDownloadImages(
  referer: string,
  imageUrls: string[],
  maxTimeoutMs = 60_000,
  signal?: AbortSignal,
): Promise<FlareSolverrDownloadedImage[]> {
  const baseUrl = flareSolverrBaseUrl();
  if (!baseUrl || imageUrls.length === 0) return [];

  try {
    const response = await axios.post(
      `${baseUrl}/v1`,
      {
        cmd: "request.get",
        url: referer,
        maxTimeout: maxTimeoutMs,
        download: true,
        downloadUrls: imageUrls,
      },
      { timeout: maxTimeoutMs + 10_000, validateStatus: () => true, signal },
    );
    if (response.data?.status !== "ok") return [];

    const downloads = response.data?.solution?.download;
    if (!Array.isArray(downloads)) return [];

    const results: FlareSolverrDownloadedImage[] = [];
    for (const entry of downloads) {
      const entryUrl = typeof entry?.url === "string" ? entry.url : "";
      const encoded =
        typeof entry?.encoded_data === "string" ? entry.encoded_data : "";
      if (!entryUrl || !encoded) continue;

      const buffer = Buffer.from(encoded, "base64");
      const contentType =
        typeof entry?.mime_type === "string" ? entry.mime_type : undefined;
      if (!looksLikeImageBuffer(buffer, contentType)) continue;

      results.push({ url: entryUrl, buffer, contentType });
    }
    return results;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return [];
  }
}

export type FlareSolverrRequestGetOptions = {
  maxTimeoutMs?: number;
  waitInSeconds?: number;
  session?: string;
  signal?: AbortSignal;
};

export async function flareSolverrRequestGet(
  url: string,
  options: FlareSolverrRequestGetOptions = {},
): Promise<string | null> {
  const baseUrl = flareSolverrBaseUrl();
  if (!baseUrl) return null;

  const maxTimeoutMs = options.maxTimeoutMs ?? 45_000;
  const body: Record<string, unknown> = {
    cmd: "request.get",
    url,
    maxTimeout: maxTimeoutMs,
  };
  if (options.session) body.session = options.session;
  if (options.waitInSeconds) body.waitInSeconds = options.waitInSeconds;

  try {
    const response = await axios.post(`${baseUrl}/v1`, body, {
      timeout: maxTimeoutMs + 5_000,
      validateStatus: () => true,
      signal: options.signal,
    });
    const html = response.data?.solution?.response;
    const status = Number(response.data?.solution?.status || 0);
    if (typeof html !== "string" || status >= 400) return null;
    return html;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function flareSolverrDestroySession(
  session: string,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = flareSolverrBaseUrl();
  if (!baseUrl || !session) return;

  try {
    await axios.post(
      `${baseUrl}/v1`,
      { cmd: "sessions.destroy", session },
      { timeout: 10_000, validateStatus: () => true, signal },
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
  }
}

export async function fetchWithFlareSolverr(
  url: string,
  maxTimeoutMs = 45_000,
  signal?: AbortSignal,
): Promise<string | null> {
  return flareSolverrRequestGet(url, { maxTimeoutMs, signal });
}
