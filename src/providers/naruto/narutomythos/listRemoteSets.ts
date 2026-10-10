/**
 * Mythos remote set list — official gallery API ∪ disk checklist.
 *
 * Local sqlite must not hide a set already announced by CICABOOM.
 */
import { existsSync, readFileSync } from "node:fs";

import { httpGet, HTTP_DEFAULT_USER_AGENT } from "@/lib/http/httpClient";

import {
  mapOfficialMythosCard,
  parseOfficialMythosApiPayload,
} from "./parse/catalogues";
import { mythosOfficialChecklistPath } from "./pipeline/ledgers";

const OFFICIAL_API = "https://cards.narutotcgmythos.com/api/cards";

function setsFromChecklistFile(): { id: string; label: string }[] {
  const p = mythosOfficialChecklistPath();
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      sets?: { code?: string; label?: string }[];
    };
    const out: { id: string; label: string }[] = [];
    for (const row of raw.sets ?? []) {
      const id = row.code?.trim().toLowerCase();
      if (!id) continue;
      out.push({ id, label: row.label?.trim() || id.toUpperCase() });
    }
    return out;
  } catch {
    return [];
  }
}

async function setsFromOfficialApi(): Promise<{ id: string; label: string }[]> {
  try {
    const res = await httpGet<unknown>(`${OFFICIAL_API}?lang=fr`, {
      headers: {
        "User-Agent": `${HTTP_DEFAULT_USER_AGENT} mythos-sets`,
        Accept: "application/json",
      },
      timeout: 20_000,
      validateStatus: (s: number) => s === 200,
    });
    const byId = new Map<string, string>();
    for (const card of parseOfficialMythosApiPayload(res.data)) {
      const print = mapOfficialMythosCard(card);
      if (!print) continue;
      const id = print.setCode.trim().toLowerCase();
      if (!id || byId.has(id)) continue;
      byId.set(id, print.setLabel.trim() || id.toUpperCase());
    }
    return [...byId.entries()].map(([id, label]) => ({ id, label }));
  } catch {
    return [];
  }
}

export async function listMythosRemoteSets(): Promise<
  { id: string; label: string }[]
> {
  const disk = setsFromChecklistFile();
  const remote = await setsFromOfficialApi();
  const byId = new Map<string, string>();
  // Disk first (curated labels), then API fills gaps.
  for (const row of [...disk, ...remote]) {
    if (!byId.has(row.id)) byId.set(row.id, row.label);
  }
  return [...byId.entries()].map(([id, label]) => ({ id, label }));
}
