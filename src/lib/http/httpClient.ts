/**
 * Shared outbound HTTP client.
 *
 * Every provider GET should go through here so three things are uniform:
 * a request timeout (axios has none by default — a stalled scrape used to hold
 * a worker slot forever), the ambient job abort signal (cancelling an item's
 * refresh actually cancels its sockets), and de-duplication of identical
 * in-flight GETs (the same search URL is often requested by several passes at
 * once).
 */
import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";

import {
  waitForHostSlot,
  type HostLimiterProfile,
} from "@/lib/http/hostLimiter";
import { resolveRequestAbortSignal } from "@/lib/http/jobAbort";

/** Third-party JSON object whose members the caller narrows itself. */
export type JsonObject = { [key: string]: unknown };

/** Cap for any GET that does not ask for its own timeout. */
export const HTTP_DEFAULT_TIMEOUT_MS = 15_000;

/**
 * User-Agent déclaré quand l'appelant n'en fournit pas : on ne se fait pas
 * passer pour un navigateur quand on n'est pas en train d'imiter un
 * navigateur. À faire suivre avec `version` dans package.json. Les providers
 * de scraping qui posent leur propre UA navigateur gardent la main — cet
 * en-tête n'est posé qu'en l'absence du leur.
 */
export const HTTP_DEFAULT_USER_AGENT = "Placarr/0.1.0 (+https://github.com/)";

/**
 * Re-exported so providers can narrow errors thrown by {@link httpGet} /
 * {@link httpPost} without importing axios directly (no-restricted-imports).
 */
export function isAxiosError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}

/** Bound the maps so a long-running worker cannot grow them without limit. */
const MAX_CACHE_ENTRIES = 200;

export type HttpGetOptions = AxiosRequestConfig & {
  signal?: AbortSignal;
  /**
   * Reuse an identical response for this long. Off by default — only callers
   * that know the resource is stable within a pass should opt in.
   */
  cacheTtlMs?: number;
  /** Bypass both the in-flight join and the response cache. */
  noDedup?: boolean;
  /**
   * Cadence plancher vers ce host, en ms. Défaut : le profil `api` du
   * limiteur (voir `hostLimiter`). `0` court-circuite le limiteur.
   */
  minIntervalMs?: number;
  /** Profil de cadence du limiteur par host (`api` par défaut). */
  hostProfile?: HostLimiterProfile;
};

type InFlight = {
  promise: Promise<AxiosResponse<unknown>>;
  controller: AbortController;
  /** Callers still waiting; the socket is aborted when the last one leaves. */
  waiters: number;
};

const inFlight = new Map<string, InFlight>();
const responseCache = new Map<
  string,
  { at: number; response: AxiosResponse<unknown> }
>();

const stats = { requests: 0, dedupHits: 0, cacheHits: 0 };

/** Counters for tests and the runtime audit. */
export function httpClientStats(): Readonly<typeof stats> {
  return { ...stats };
}

export function resetHttpClient(): void {
  inFlight.clear();
  responseCache.clear();
  stats.requests = 0;
  stats.dedupHits = 0;
  stats.cacheHits = 0;
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return String(value ?? "");
  const record = value as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]),
  );
}

function requestKey(url: string, options: HttpGetOptions): string {
  return [
    url,
    stableStringify(options.params),
    stableStringify(options.headers),
    options.responseType ?? "",
    options.maxRedirects ?? "",
  ].join("|");
}

function rememberEntry<T>(map: Map<string, T>, key: string, value: T): void {
  map.set(key, value);
  while (map.size > MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

/**
 * Join an in-flight request. Aborting one caller must not cancel the others,
 * so the shared socket is only aborted once every waiter has left.
 */
function joinInFlight(
  entry: InFlight,
  signal: AbortSignal | undefined,
): Promise<AxiosResponse<unknown>> {
  entry.waiters += 1;

  if (!signal) {
    return entry.promise.finally(() => {
      entry.waiters -= 1;
    });
  }

  return new Promise<AxiosResponse<unknown>>((resolve, reject) => {
    let settled = false;
    const leave = () => {
      if (settled) return;
      settled = true;
      entry.waiters -= 1;
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      const reason = signal.reason;
      leave();
      if (entry.waiters <= 0) entry.controller.abort(reason);
      reject(abortError(reason));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(
      (response) => {
        leave();
        resolve(response);
      },
      (error) => {
        leave();
        reject(error);
      },
    );
  });
}

/**
 * Vrai si les en-têtes portent déjà un User-Agent — objet plat ou instance
 * `AxiosHeaders`, casse indifférente. Un provider qui assume son UA navigateur
 * le garde.
 */
function hasUserAgent(headers: unknown): boolean {
  if (!headers || typeof headers !== "object") return false;
  const maybeAxiosHeaders = headers as { has?: unknown };
  if (typeof maybeAxiosHeaders.has === "function") {
    return Boolean(
      (maybeAxiosHeaders as { has: (name: string) => boolean }).has(
        "User-Agent",
      ),
    );
  }
  return Object.keys(headers as Record<string, unknown>).some(
    (key) => key.toLowerCase() === "user-agent",
  );
}

/**
 * Pose l'UA honnête si l'appelant n'en a pas mis un. Les en-têtes fournis sont
 * copiés (jamais mutés) ; un `AxiosHeaders` est aplati via son `toJSON` —
 * pas d'import de la classe, pour rester compatible avec les tests qui
 * mockent `axios` au strict minimum.
 */
function withDefaultUserAgent(
  headers: AxiosRequestConfig["headers"],
): AxiosRequestConfig["headers"] {
  if (hasUserAgent(headers)) return headers;
  const base =
    headers && typeof (headers as { toJSON?: unknown }).toJSON === "function"
      ? (headers as { toJSON: () => Record<string, unknown> }).toJSON()
      : { ...(headers as Record<string, unknown> | undefined) };
  return { ...base, "User-Agent": HTTP_DEFAULT_USER_AGENT };
}

/**
 * GET with a default timeout, the ambient job signal, and in-flight dedup.
 * Responses are shared between joined callers — treat them as read-only.
 */
export async function httpGet<T = unknown>(
  url: string,
  options: HttpGetOptions = {},
): Promise<AxiosResponse<T>> {
  const {
    cacheTtlMs = 0,
    noDedup,
    minIntervalMs,
    hostProfile,
    signal: explicitSignal,
    ...rest
  } = options;
  const signal = resolveRequestAbortSignal(explicitSignal);
  if (signal?.aborted) throw abortError(signal.reason);

  const axiosOptions: AxiosRequestConfig = {
    ...rest,
    headers: withDefaultUserAgent(rest.headers),
    timeout: rest.timeout ?? HTTP_DEFAULT_TIMEOUT_MS,
  };

  // Chaque requête qui part réellement prend un créneau du limiteur de son
  // host — les hits cache/dedup n'attendent pas, eux.
  const waitSlot = (slotSignal?: AbortSignal) =>
    waitForHostSlot(url, {
      profile: hostProfile ?? "api",
      minIntervalMs,
      signal: slotSignal,
    });

  // Streams have a single consumer — never share or replay them.
  const shareable = !noDedup && axiosOptions.responseType !== "stream";
  if (!shareable) {
    stats.requests += 1;
    await waitSlot(signal);
    return axios.get<T>(url, { ...axiosOptions, signal });
  }

  const key = requestKey(url, options);

  if (cacheTtlMs > 0) {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.at <= cacheTtlMs) {
      stats.cacheHits += 1;
      return cached.response as AxiosResponse<T>;
    }
    if (cached) responseCache.delete(key);
  }

  const pending = inFlight.get(key);
  if (pending) {
    stats.dedupHits += 1;
    return (await joinInFlight(pending, signal)) as AxiosResponse<T>;
  }

  const controller = new AbortController();
  stats.requests += 1;
  const entry: InFlight = {
    controller,
    waiters: 0,
    promise: waitSlot(controller.signal)
      .then(() => {
        // Tous les waiters sont partis pendant l'attente du créneau : ne pas
        // émettre une requête que plus personne n'écoute.
        if (controller.signal.aborted)
          throw abortError(controller.signal.reason);
        return axios.get<T>(url, {
          ...axiosOptions,
          signal: controller.signal,
        });
      })
      .then((response) => {
        if (cacheTtlMs > 0 && response.status >= 200 && response.status < 300) {
          rememberEntry(responseCache, key, { at: Date.now(), response });
        }
        return response;
      })
      .finally(() => {
        inFlight.delete(key);
      }),
  };
  inFlight.set(key, entry);

  return (await joinInFlight(entry, signal)) as AxiosResponse<T>;
}

/**
 * POST with the same timeout and abort defaults as {@link httpGet}.
 * Never de-duplicated — POSTs are not idempotent.
 */
export async function httpPost<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<HttpGetOptions, "cacheTtlMs" | "noDedup"> = {},
): Promise<AxiosResponse<T>> {
  const {
    signal: explicitSignal,
    minIntervalMs,
    hostProfile,
    ...rest
  } = options;
  const signal = resolveRequestAbortSignal(explicitSignal);
  if (signal?.aborted) throw abortError(signal.reason);

  stats.requests += 1;
  await waitForHostSlot(url, {
    profile: hostProfile ?? "api",
    minIntervalMs,
    signal,
  });
  return axios.post<T>(url, body, {
    ...rest,
    headers: withDefaultUserAgent(rest.headers),
    timeout: rest.timeout ?? HTTP_DEFAULT_TIMEOUT_MS,
    signal,
  });
}

/**
 * HEAD with the same timeout and abort defaults as {@link httpGet}.
 * Never de-duplicated or cached — existence probes must hit the origin.
 */
export async function httpHead(
  url: string,
  options: Omit<HttpGetOptions, "cacheTtlMs" | "noDedup"> = {},
): Promise<AxiosResponse<unknown>> {
  const {
    signal: explicitSignal,
    minIntervalMs,
    hostProfile,
    ...rest
  } = options;
  const signal = resolveRequestAbortSignal(explicitSignal);
  if (signal?.aborted) throw abortError(signal.reason);

  stats.requests += 1;
  await waitForHostSlot(url, {
    profile: hostProfile ?? "api",
    minIntervalMs,
    signal,
  });
  return axios.head(url, {
    ...rest,
    headers: withDefaultUserAgent(rest.headers),
    timeout: rest.timeout ?? HTTP_DEFAULT_TIMEOUT_MS,
    signal,
  });
}
