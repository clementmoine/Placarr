/**
 * Sync `data/pokemon/liveOwned.json` from Live Rainier commerce APIs.
 *
 * Requires PTCS tokens at `.tmp-foil-audit/live-unity/mitm/tokens.json`
 * (`access_token` + single-use `refresh_token`). See docs/pokemon_live_rainier.md.
 *
 *   pnpm foil:pokemon:sync-owned
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(__dirname, "../../..");
const TOKENS = path.join(ROOT, ".tmp-foil-audit/live-unity/mitm/tokens.json");
const OUT_JSON = path.join(ROOT, "data/pokemon/liveOwned.json");
const SQLITE = path.join(ROOT, "data/pokemon/catalog.sqlite");
const KEY = "421d8904-0236-4ab4-94f5-a8a84aeb3f7b";
const CLIENT = "tpci-tcg-app";
const BASE = "https://api.studio-prod.pokemon.com";

type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

async function req(
  method: string,
  url: string,
  body?: unknown,
  bearer?: string,
  form = false,
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: string | undefined;
  if (body !== undefined) {
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = new URLSearchParams(body as Record<string, string>).toString();
    } else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  headers["User-Agent"] =
    "UnityPlayer/2022.3.22f1 (UnityWebRequest/1.0, libcurl/8.5.0-DEV)";
  const res = await fetch(url, { method, headers, body: payload });
  return { status: res.status, text: await res.text() };
}

function toFrStem(stem: string): string {
  return stem.replace(/_(de|en|it|es|ptbr)_/, "_fr_");
}

async function main() {
  if (!fs.existsSync(TOKENS)) {
    throw new Error(
      `Missing ${TOKENS} — capture a Live login under mitm first`,
    );
  }
  if (!fs.existsSync(SQLITE)) {
    throw new Error(`Missing ${SQLITE} — run pnpm foil:pokemon:index-cards`);
  }

  let tok = JSON.parse(fs.readFileSync(TOKENS, "utf8")) as Tokens;
  if (tok.refresh_token) {
    const r = await req(
      "POST",
      "https://access.pokemon.com/oauth2/token",
      {
        grant_type: "refresh_token",
        refresh_token: tok.refresh_token,
        client_id: CLIENT,
      },
      undefined,
      true,
    );
    if (r.status !== 200) {
      throw new Error(
        `PTCS refresh failed ${r.status}: ${r.text.slice(0, 200)}`,
      );
    }
    tok = { ...tok, ...JSON.parse(r.text) };
    fs.writeFileSync(TOKENS, JSON.stringify(tok, null, 2) + "\n");
  }

  const route = await req("POST", `${BASE}/user/v1/external/routing/route`, {
    clientTypeAccessKey: KEY,
  });
  const api = (JSON.parse(route.text) as { apiEndpoint: string }).apiEndpoint;
  const reg = await req("POST", `${api}/account/v1/external/token/register`, {
    clientTypeAccessKey: KEY,
    clientId: CLIENT,
  });
  const guest = (JSON.parse(reg.text) as { accessToken: string }).accessToken;
  const auth = await req(
    "POST",
    `${api}/account/v1/external/token/auth`,
    { authToken: tok.access_token, authType: "PTOK" },
    guest,
  );
  if (auth.status !== 200) {
    throw new Error(
      `studio auth failed ${auth.status}: ${auth.text.slice(0, 200)}`,
    );
  }
  const studio = (JSON.parse(auth.text) as { accessToken: string }).accessToken;

  const cdxRes = await req(
    "POST",
    `${api}/commerce/v1/external/carddex/getCardDexData`,
    {},
    studio,
  );
  if (cdxRes.status !== 200) {
    throw new Error(
      `carddex failed ${cdxRes.status}: ${cdxRes.text.slice(0, 200)}`,
    );
  }
  const cardRecords = (
    JSON.parse(cdxRes.text) as {
      cardRecords: { cardId: string }[];
    }
  ).cardRecords;
  const ownedIds = [...new Set(cardRecords.map((r) => r.cardId))];

  const walletRes = await req(
    "POST",
    `${api}/commerce/v1/external/wallet/get`,
    {},
    studio,
  );
  const wallet =
    walletRes.status === 200 ? JSON.parse(walletRes.text) : undefined;

  const db = new DatabaseSync(SQLITE, { readOnly: true });
  const stmt = db.prepare(
    `SELECT card_id, bundle_stem, lang, foil_effect
     FROM live_cards WHERE card_id = ?`,
  );

  const byEffect = new Map<string, Set<string>>();
  let matched = 0;
  for (const cardId of ownedIds) {
    const rows = stmt.all(cardId) as {
      card_id: string;
      bundle_stem: string;
      lang: string;
      foil_effect: string | null;
    }[];
    if (!rows.length) continue;
    matched++;
    const row = rows.find((r) => r.lang === "fr") ?? rows[0]!;
    const effect = (row.foil_effect ?? "").trim();
    if (!effect || effect === "None" || effect === "NonFoil") continue;
    const stem = toFrStem(row.bundle_stem);
    let set = byEffect.get(effect);
    if (!set) {
      set = new Set();
      byEffect.set(effect, set);
    }
    set.add(stem);
  }
  db.close();

  // Preserve manual Thatch if present and still absent from carddex pull.
  let prevThatch: string[] | undefined;
  if (fs.existsSync(OUT_JSON)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_JSON, "utf8")) as {
        byEffect?: { Thatch?: string[] };
      };
      prevThatch = prev.byEffect?.Thatch;
    } catch {
      /* ignore */
    }
  }
  if (prevThatch?.length && !byEffect.has("Thatch")) {
    byEffect.set("Thatch", new Set(prevThatch));
  }

  const byEffectObj = Object.fromEntries(
    [...byEffect.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, [...v].sort()]),
  );

  const out = {
    updatedAt: new Date().toISOString().slice(0, 10),
    source: "commerce/v1/external/carddex/getCardDexData",
    notes:
      "Synced via Rainier commerce carddex. Stems normalized to _fr_. " +
      "See docs/pokemon_live_rainier.md.",
    carddexCount: ownedIds.length,
    matchedInSqlite: matched,
    wallet,
    byEffect: byEffectObj,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `Wrote ${OUT_JSON} — carddex=${ownedIds.length} matched=${matched} effects=${Object.keys(byEffectObj).join(",")}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
