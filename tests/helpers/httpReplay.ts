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
 * Les secrets (clés d'API présentes dans l'environnement) sont expurgés des
 * fixtures : ils ne doivent jamais être commités.
 */

export type Interaction = {
  request: { method: string; url: string };
  response: { status: number; body: string };
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
  } catch {
    // ignore malformed URLs
  }
  return url;
}

async function readResponseBody(response: Response): Promise<string> {
  const buffer = Buffer.from(await response.clone().arrayBuffer());
  const encoding = response.headers.get("content-encoding")?.toLowerCase() ?? "";
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

export class HttpReplay {
  private interceptor = new BatchInterceptor({
    name: "barcode-replay",
    interceptors: nodeInterceptors,
  });
  private recorded: Interaction[] = [];
  private replayQueue = new Map<string, Interaction[]>();
  private misses = new Set<string>();
  private pending: Promise<void>[] = [];

  /** Démarre la capture du trafic réseau réel. */
  startRecord() {
    this.recorded = [];
    this.pending = [];
    this.interceptor.on("response", ({ request, response }) => {
      // La lecture du corps est asynchrone : on suit la promesse pour pouvoir
      // l'attendre via flush() avant de lire les interactions.
      const p = (async () => {
        try {
          const body = await readResponseBody(response);
          this.recorded.push({
            request: { method: request.method, url: redact(request.url) },
            response: { status: response.status, body: redact(body) },
          });
        } catch {
          // réponse illisible (binaire/stream) — ignorée
        }
      })();
      this.pending.push(p);
    });
    this.interceptor.apply();
  }

  /** Attend que toutes les captures asynchrones soient terminées (borné). */
  async flush(timeoutMs = 5_000) {
    if (this.pending.length === 0) return;
    await Promise.race([
      Promise.allSettled(this.pending),
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
    this.pending = [];
  }

  /** Démarre le rejeu à partir d'interactions enregistrées. */
  startReplay(interactions: Interaction[]) {
    this.replayQueue = new Map();
    for (const it of interactions) {
      const key = keyOf(it.request.method, it.request.url);
      const list = this.replayQueue.get(key) || [];
      list.push(it);
      this.replayQueue.set(key, list);
    }
    this.misses = new Set();

    this.interceptor.on("request", ({ request, controller }) => {
      const key = keyOf(request.method, request.url);
      const list = this.replayQueue.get(key);
      const it = list && (list.length > 1 ? list.shift() : list[0]);
      if (!it) {
        this.misses.add(key);
        // Échec déterministe : le fournisseur est traité comme indisponible.
        controller.respondWith(new Response("replay-miss", { status: 504 }));
        return;
      }
      controller.respondWith(
        new Response(it.response.body, { status: it.response.status }),
      );
    });
    this.interceptor.apply();
  }

  getRecorded(): Interaction[] {
    return this.recorded;
  }

  getMisses(): string[] {
    return [...this.misses];
  }

  stop() {
    this.interceptor.dispose();
  }
}
