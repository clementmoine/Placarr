import axios from "axios";

import { AsyncQueue } from "@/lib/async/asyncQueue";
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

/**
 * FlareSolverr is typically a single remote browser. Parallel challenges just
 * queue there while each axios wait still occupies the Next event loop for
 * 45–90s — serialize outbound Flare calls so enrich fan-out cannot pile up.
 */
const flareQueue = new AsyncQueue(1);

/** Rolling outcome counters for operator logs (Flare is serial — watch wait pressure). */
const flareStats = {
  attempts: 0,
  ok: 0,
  fail: 0,
  lastLogAt: 0,
};

function recordFlareOutcome(ok: boolean): void {
  flareStats.attempts += 1;
  if (ok) flareStats.ok += 1;
  else flareStats.fail += 1;
  const now = Date.now();
  if (flareStats.attempts % 10 !== 0 && now - flareStats.lastLogAt < 60_000) {
    return;
  }
  flareStats.lastLogAt = now;
  console.info(
    `[FlareSolverr] outcomes attempts=${flareStats.attempts} ok=${flareStats.ok} fail=${flareStats.fail} (serial queue depth pressure → lower WORKER_CONCURRENCY if fail climbs)`,
  );
}

function flareSolverrBaseUrl(): string | null {
  const flaresolverrUrl = process.env.FLARESOLVERR_URL?.trim();
  return flaresolverrUrl ? flaresolverrUrl.replace(/\/+$/, "") : null;
}

function runFlareExclusive<T>(fn: () => Promise<T>): Promise<T> {
  return flareQueue.run(fn);
}

export async function flareSolverrCookiesFor(
  referer: string,
  maxTimeoutMs = 60_000,
  signal?: AbortSignal,
): Promise<FlareSolverrCookies | null> {
  const baseUrl = flareSolverrBaseUrl();
  if (!baseUrl) return null;

  return runFlareExclusive(async () => {
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
      if (response.data?.status !== "ok") {
        recordFlareOutcome(false);
        return null;
      }
      const solution = response.data.solution;
      const cookie = (solution?.cookies || [])
        .map(
          (entry: { name: string; value: string }) =>
            `${entry.name}=${entry.value}`,
        )
        .join("; ");
      if (!cookie) {
        recordFlareOutcome(false);
        return null;
      }
      recordFlareOutcome(true);
      return {
        cookie,
        userAgent:
          solution?.userAgent ||
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      recordFlareOutcome(false);
      return null;
    }
  });
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

  return runFlareExclusive(async () => {
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
      if (response.data?.status !== "ok") {
        recordFlareOutcome(false);
        return [];
      }

      const downloads = response.data?.solution?.download;
      if (!Array.isArray(downloads)) {
        recordFlareOutcome(false);
        return [];
      }

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
      recordFlareOutcome(results.length > 0);
      return results;
    } catch (error) {
      if (isAbortError(error)) throw error;
      recordFlareOutcome(false);
      return [];
    }
  });
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

  const maxTimeoutMs = options.maxTimeoutMs ?? 30_000;
  const body: Record<string, unknown> = {
    cmd: "request.get",
    url,
    maxTimeout: maxTimeoutMs,
  };
  if (options.session) body.session = options.session;
  if (options.waitInSeconds) body.waitInSeconds = options.waitInSeconds;

  return runFlareExclusive(async () => {
    try {
      const response = await axios.post(`${baseUrl}/v1`, body, {
        timeout: maxTimeoutMs + 5_000,
        validateStatus: () => true,
        signal: options.signal,
      });
      const html = response.data?.solution?.response;
      const status = Number(response.data?.solution?.status || 0);
      if (typeof html !== "string" || status >= 400) {
        recordFlareOutcome(false);
        return null;
      }
      recordFlareOutcome(true);
      return html;
    } catch (error) {
      if (isAbortError(error)) throw error;
      recordFlareOutcome(false);
      return null;
    }
  });
}

export async function flareSolverrDestroySession(
  session: string,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = flareSolverrBaseUrl();
  if (!baseUrl || !session) return;

  return runFlareExclusive(async () => {
    try {
      await axios.post(
        `${baseUrl}/v1`,
        { cmd: "sessions.destroy", session },
        { timeout: 10_000, validateStatus: () => true, signal },
      );
    } catch (error) {
      if (isAbortError(error)) throw error;
    }
  });
}

export async function fetchWithFlareSolverr(
  url: string,
  maxTimeoutMs = 45_000,
  signal?: AbortSignal,
): Promise<string | null> {
  return flareSolverrRequestGet(url, { maxTimeoutMs, signal });
}
