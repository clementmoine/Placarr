import { type AxiosRequestConfig } from "axios";

import { isAbortError } from "@/lib/http/abort";
import { httpGet } from "@/lib/http/httpClient";
import { resolveRequestAbortSignal } from "@/lib/http/jobAbort";
import { flareSolverrRequestGet } from "@/lib/http/flareSolverr";
import { yieldToEventLoop } from "@/lib/async/yieldToEventLoop";

export type ScrapeFetchResponse = {
  status: number;
  data: unknown;
  viaFlareSolverr: boolean;
  responseUrl?: string;
};

function bodyToText(body: unknown): string {
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null) {
    try {
      return JSON.stringify(body);
    } catch {
      return "";
    }
  }
  return "";
}

/** True when a scrape response looks blocked (WAF, bot wall, permission page). */
export function scrapeAccessBlocked(status: number, body: unknown): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const text = bodyToText(body);
  if (!text) return false;
  return /don't have permission|acc[eè]s refus[eé]|just a moment|cf-browser-verification|attention required|enable javascript and cookies/i.test(
    text,
  );
}

function parseFlareBody(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through to raw HTML/text
    }
  }
  return body;
}

function directResponseAccepted(
  status: number,
  body: unknown,
  validateStatus: (status: number) => boolean,
): boolean {
  return validateStatus(status) && !scrapeAccessBlocked(status, body);
}

/**
 * GET with a single FlareSolverr retry when direct access is blocked or fails.
 * Requires `FLARESOLVERR_URL` for the fallback path.
 */
export async function fetchGetWithFlareFallback(
  url: string,
  options: AxiosRequestConfig & {
    flareMaxTimeoutMs?: number;
    signal?: AbortSignal;
    skipDirect?: boolean;
    /** Reuse an identical direct GET for this long (shared client). */
    cacheTtlMs?: number;
  } = {},
): Promise<ScrapeFetchResponse> {
  const {
    flareMaxTimeoutMs,
    signal: explicitSignal,
    skipDirect,
    cacheTtlMs,
    ...axiosOptions
  } = options;
  const signal = resolveRequestAbortSignal(explicitSignal);
  if (signal?.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) throw reason;
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }
  const validateStatus =
    axiosOptions.validateStatus ??
    ((status: number) => status >= 200 && status < 300);

  let directStatus = 0;
  let directData: unknown = null;

  if (!skipDirect) {
    try {
      const response = await httpGet(url, {
        ...axiosOptions,
        ...(cacheTtlMs ? { cacheTtlMs } : {}),
        validateStatus: () => true,
        signal,
      });
      directStatus = response.status;
      directData = response.data;
      if (directResponseAccepted(directStatus, directData, validateStatus)) {
        return {
          status: directStatus,
          data: directData,
          viaFlareSolverr: false,
          responseUrl:
            (response.request as { res?: { responseUrl?: string } })?.res
              ?.responseUrl ?? url,
        };
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
    }
  }

  const flareBody = await flareSolverrRequestGet(url, {
    maxTimeoutMs: flareMaxTimeoutMs,
    signal,
  });
  // Flare returns a large HTML string; yield before sync parse/return so
  // interactive API routes can run on the shared Next event loop.
  await yieldToEventLoop();
  if (
    flareBody != null &&
    !scrapeAccessBlocked(200, flareBody) &&
    validateStatus(200)
  ) {
    return {
      status: 200,
      data: parseFlareBody(flareBody),
      viaFlareSolverr: true,
      responseUrl: url,
    };
  }

  return {
    status: directStatus,
    data: directData,
    viaFlareSolverr: false,
  };
}

/** HTML/text GET — returns body or null. */
export async function fetchTextWithFlareFallback(
  url: string,
  options: AxiosRequestConfig & {
    flareMaxTimeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<string | null> {
  const response = await fetchGetWithFlareFallback(url, {
    ...options,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  if (
    response.status >= 400 ||
    scrapeAccessBlocked(response.status, response.data)
  ) {
    return null;
  }
  return typeof response.data === "string"
    ? response.data
    : bodyToText(response.data) || null;
}
