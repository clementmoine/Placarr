/**
 * Scryfall `/sets` — remote extension list for the shelf picker.
 *
 * Same contract as TCGdex `listTcgdexRemoteSets`: a non-empty local DB must
 * not hide sets already published upstream.
 * FR labels prefer Fullset.fr (`pack_documents` fullset-set-labels) when present.
 */
import { httpGet, HTTP_DEFAULT_USER_AGENT } from "@/lib/http/httpClient";
import { fullsetSetLabel } from "@/providers/shared/fullset/setLabels";

import { MTG_PACK_ID } from "../pack";

const SETS_URL = "https://api.scryfall.com/sets";
const SCRYFALL_UA = `${HTTP_DEFAULT_USER_AGENT} Scryfall-sets`;

type ScryfallSetRow = {
  code?: string;
  name?: string;
  digital?: boolean;
  set_type?: string;
};

export async function listScryfallRemoteSets(opts?: {
  signal?: AbortSignal;
  language?: string | null;
}): Promise<{ id: string; label: string }[]> {
  try {
    const res = await httpGet<{ data?: ScryfallSetRow[] }>(SETS_URL, {
      headers: {
        "User-Agent": SCRYFALL_UA,
        Accept: "application/json",
      },
      timeout: 20_000,
      hostProfile: "api",
      signal: opts?.signal,
    });
    const rows = Array.isArray(res.data?.data) ? res.data.data : [];
    const out: { id: string; label: string }[] = [];
    const lang = opts?.language ?? null;
    for (const row of rows) {
      const id = row.code?.trim().toLowerCase();
      if (!id) continue;
      // Token / memorabilia / digital-only sets clutter the paper shelf.
      if (row.digital) continue;
      const setType = (row.set_type ?? "").toLowerCase();
      if (
        setType === "token" ||
        setType === "memorabilia" ||
        setType === "art_series"
      ) {
        continue;
      }
      const fullset = fullsetSetLabel(MTG_PACK_ID, id, lang);
      const label = fullset || row.name?.trim() || id.toUpperCase();
      out.push({ id, label });
    }
    return out;
  } catch {
    return [];
  }
}
