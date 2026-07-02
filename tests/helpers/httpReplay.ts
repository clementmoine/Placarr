import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { BatchInterceptor } from "@mswjs/interceptors";
import nodeInterceptors from "@mswjs/interceptors/presets/node";

/**
 * Enregistrement / rejeu du trafic HTTP (axios-sur-http + fetch) pour rendre
 * les tests du pipeline code-barres déterministes.
 *
 * - Mode RECORD : laisse passer vers le vrai réseau et capture chaque échange.
 * - Mode REPLAY : sert les réponses enregistrées ; toute requête non couverte
 *   est comptée comme "miss" (le test peut alors échouer franchement).
 *
 * Un SEUL intercepteur est installé par process et n'est jamais disposé :
 * ré-appliquer un intercepteur @mswjs après dispose dans le même process est
 * silencieusement inopérant (le 2e patch n'intercepte plus rien et les
 * requêtes partent sur le vrai réseau). Les sessions record/replay se relaient
 * via `activeSession` ; sans session active, toute requête reçoit un 504
 * déterministe plutôt que d'atteindre le réseau réel.
 *
 * Les secrets (clés d'API présentes dans l'environnement) sont expurgés des
 * fixtures : ils ne doivent jamais être commités.
 */

export type Interaction = {
  request: { method: string; url: string };
  response: { status: number; body: string; headers?: Record<string, string> };
};

function secretValues(): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || value.length < 6) continue;
    if (/KEY|SECRET|TOKEN|PASSWORD|CLIENT_ID|DEV_ID/i.test(key)) {
      values.push(value);
    }
  }
  // Les plus longs d'abord pour éviter les remplacements partiels.
  return values.sort((a, b) => b.length - a.length);
}

const SECRETS = secretValues();

export function redact(input: string): string {
  let out = input;
  for (const secret of SECRETS) {
    out = out.split(secret).join("__REDACTED__");
  }
  return out;
}

function keyOf(method: string, url: string): string {
  return `${method.toUpperCase()} ${redact(normalizeReplayUrl(url))}`;
}

/** Collapse redirect-only query noise so record/replay keys stay aligned. */
function normalizeReplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === "www.pricecharting.com" &&
      parsed.pathname === "/search-products"
    ) {
      const q = parsed.searchParams.get("q")?.trim();
      if (q && /^\d{8,14}$/.test(q.replace(/[^\d]/g, ""))) {
        const cleaned = q.replace(/[^\d]/g, "");
        return `${parsed.origin}/search-products?q=${cleaned}`;
      }
    }
    if (parsed.hostname.includes("googleapis.com")) {
      parsed.searchParams.delete("key");
      return parsed.toString();
    }
  } catch {
    // ignore malformed URLs
  }
  return url;
}

async function readResponseBody(response: Response): Promise<string> {
  const buffer = Buffer.from(await response.clone().arrayBuffer());
  const encoding =
    response.headers.get("content-encoding")?.toLowerCase() ?? "";
  if (encoding.includes("br")) {
    return brotliDecompressSync(buffer).toString("utf8");
  }
  if (encoding.includes("gzip") || (buffer[0] === 0x1f && buffer[1] === 0x8b)) {
    return gunzipSync(buffer).toString("utf8");
  }
  if (encoding.includes("deflate")) {
    return gunzipSync(buffer).toString("utf8");
  }
  return buffer.toString("utf8");
}

const MAX_RECORD_BODY_CHARS = 128_000;
const SKIP_RECORD_URL_RE =
  /\/sitemaps\/sitemap-|sitemap-master\.xml|sitemap-videogames/i;

function shouldSkipRecord(url: string): boolean {
  return SKIP_RECORD_URL_RE.test(url);
}

function prepareRecordBody(url: string, body: string): string | null {
  if (shouldSkipRecord(url)) return null;
  if (body.length <= MAX_RECORD_BODY_CHARS) return body;
  return `${body.slice(0, MAX_RECORD_BODY_CHARS)}\n<!-- truncated ${body.length} chars -->`;
}

function createSharedInterceptor() {
  return new BatchInterceptor({
    name: "barcode-replay",
    interceptors: nodeInterceptors,
  });
}

let sharedInterceptor: ReturnType<typeof createSharedInterceptor> | null = null;
let activeSession: HttpReplay | null = null;

function activateSession(session: HttpReplay) {
  activeSession = session;
  if (sharedInterceptor) return;
  sharedInterceptor = createSharedInterceptor();
  sharedInterceptor.on("request", ({ request, controller }) => {
    const current = activeSession;
    if (!current) {
      // Requête hors session (fuite asynchrone d'un cas précédent) : échec
      // déterministe plutôt que réseau réel.
      controller.respondWith(
        new Response("replay-no-session", { status: 504 }),
      );
      return;
    }
    const mocked = current.mockedResponseFor(request.method, request.url);
    if (mocked) controller.respondWith(mocked);
    // null = mode record : laisser passer vers le vrai réseau.
  });
  sharedInterceptor.on("response", ({ request, response }) => {
    activeSession?.captureResponse(request.method, request.url, response);
  });
  sharedInterceptor.apply();
}

function deactivateSession(session: HttpReplay) {
  if (activeSession === session) activeSession = null;
}

export class HttpReplay {
  private mode: "record" | "replay" | null = null;
  private recorded: Interaction[] = [];
  private replayQueue = new Map<string, Interaction[]>();
  private misses = new Set<string>();
  private pending: Promise<void>[] = [];

  /** Démarre la capture du trafic réseau réel. */
  startRecord() {
    this.mode = "record";
    this.recorded = [];
    this.pending = [];
    activateSession(this);
  }

  /** Démarre le rejeu à partir d'interactions enregistrées. */
  startReplay(interactions: Interaction[]) {
    this.mode = "replay";
    this.replayQueue = new Map();
    for (const it of interactions) {
      const key = keyOf(it.request.method, it.request.url);
      const list = this.replayQueue.get(key) || [];
      list.push(it);
      this.replayQueue.set(key, list);
    }
    this.misses = new Set();
    activateSession(this);
  }

  /**
   * Réponse simulée pour une requête interceptée (délégué par l'intercepteur
   * partagé). `null` en mode record : la requête part sur le vrai réseau.
   */
  mockedResponseFor(method: string, url: string): Response | null {
    if (this.mode !== "replay") return null;
    const key = keyOf(method, url);
    const list = this.replayQueue.get(key);
    const it = list && (list.length > 1 ? list.shift() : list[0]);
    if (!it) {
      this.misses.add(key);
      // Échec déterministe : le fournisseur est traité comme indisponible.
      return new Response("replay-miss", { status: 504 });
    }
    return new Response(it.response.body, {
      status: it.response.status,
      headers: it.response.headers,
    });
  }

  /** Capture une réponse réelle (délégué par l'intercepteur partagé). */
  captureResponse(method: string, url: string, response: Response) {
    if (this.mode !== "record") return;
    // La lecture du corps est asynchrone : on suit la promesse pour pouvoir
    // l'attendre via flush() avant de lire les interactions.
    const p = (async () => {
      try {
        if (shouldSkipRecord(url)) return;
        const body = prepareRecordBody(url, await readResponseBody(response));
        if (body === null) return;
        const headers: Record<string, string> = {};
        const location = response.headers.get("location");
        if (location) headers.location = location;
        this.recorded.push({
          request: { method, url: redact(url) },
          response: {
            status: response.status,
            body: redact(body),
            ...(Object.keys(headers).length > 0 ? { headers } : {}),
          },
        });
      } catch {
        // réponse illisible (binaire/stream) — ignorée
      }
    })();
    this.pending.push(p);
  }

  /** Attend que toutes les captures asynchrones soient terminées (borné). */
  async flush(timeoutMs = 30_000) {
    if (this.pending.length === 0) return;
    await Promise.race([
      Promise.allSettled(this.pending),
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
    this.pending = [];
  }

  getRecorded(): Interaction[] {
    return this.recorded;
  }

  getMisses(): string[] {
    return [...this.misses];
  }

  stop() {
    deactivateSession(this);
    this.mode = null;
  }
}
