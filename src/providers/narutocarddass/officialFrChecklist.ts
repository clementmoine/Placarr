/**
 * Checklist papier Bandai FR S1–S5 → appartenances multi-séries sur le disque.
 *
 * Source : `curated/sources/carddass-fr-checklist.json`.
 * Cible : `data/…/appearances.json` (plusieurs sets par langue quand Bandai
 * liste le même numéro dans plusieurs séries).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  appearanceSetsOf,
  appearanceValueForJson,
  mergeAppearanceValues,
} from "./appearanceSets";
import { narutoDiskCardId } from "./collectorIdentity";
import { narutoCuratedSourcesDir } from "./curatedPaths";
import type { NarutoAppearancesFile } from "./migrateCardLayout";

type ChecklistFile = {
  sets?: Record<string, { ids?: readonly string[] }>;
};

let numbersBySet: Map<string, string[]> | null = null;

function checklistPath(): string {
  return path.join(narutoCuratedSourcesDir(), "carddass-fr-checklist.json");
}

/** Formes possibles de `prints.number` / disk id pour un id checklist. */
export function checklistIdToNumberForms(id: string): string[] {
  const raw = id.trim().toLowerCase();
  const m = /^(ni|te|ta|cl|pr)(\d+)$/i.exec(raw);
  if (!m) return raw ? [raw] : [];
  const type = m[1]!.toLowerCase();
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 0) return [raw];
  return [
    ...new Set([
      `${type}${n}`,
      `${type}${String(n).padStart(3, "0")}`,
      `${type}${String(n).padStart(4, "0")}`,
    ]),
  ];
}

function loadChecklistSetsById(): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  const file = checklistPath();
  if (!existsSync(file)) return byId;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ChecklistFile;
    for (const [setId, body] of Object.entries(parsed.sets ?? {})) {
      const sid = setId.trim().toLowerCase();
      if (!/^s[1-5]$/.test(sid)) continue;
      for (const id of body.ids ?? []) {
        const key = id.trim().toLowerCase();
        if (!key) continue;
        const sets = byId.get(key) ?? [];
        if (!sets.includes(sid)) sets.push(sid);
        byId.set(key, sets);
      }
    }
  } catch {
    /* ignore */
  }
  return byId;
}

function loadNumbersBySet(): Map<string, string[]> {
  if (numbersBySet) return numbersBySet;
  const out = new Map<string, string[]>();
  for (const [id, sets] of loadChecklistSetsById()) {
    for (const setId of sets) {
      const forms = out.get(setId) ?? [];
      for (const form of checklistIdToNumberForms(id)) {
        if (!forms.includes(form)) forms.push(form);
      }
      out.set(setId, forms);
    }
  }
  numbersBySet = out;
  return out;
}

export function resetOfficialFrChecklistCache(): void {
  numbersBySet = null;
}

export function officialFrChecklistDiskNumbers(setId: string): string[] {
  return loadNumbersBySet().get(setId.trim().toLowerCase()) ?? [];
}

export function officialFrChecklistSetsForNumber(number: string): string[] {
  const forms = new Set(checklistIdToNumberForms(number));
  const hits: string[] = [];
  for (const [setId, nums] of loadNumbersBySet()) {
    if (nums.some((n) => forms.has(n))) hits.push(setId);
  }
  return hits.sort();
}

/**
 * Fusionne la checklist papier dans `appearances.json` du pack.
 * @returns nombre de cartes FR dont la liste de sets a changé.
 */
export function syncOfficialFrChecklistAppearances(packRoot: string): number {
  const file = path.join(packRoot, "appearances.json");
  let appearances: Record<
    string,
    Record<string, string | readonly string[]>
  > = {};
  let generatedAt = new Date().toISOString();
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as NarutoAppearancesFile;
      appearances = { ...(raw.appearances ?? {}) };
      generatedAt = raw.generatedAt ?? generatedAt;
    } catch {
      /* rebuild */
    }
  }

  let changed = 0;
  for (const [checklistId, sets] of loadChecklistSetsById()) {
    const diskId =
      narutoDiskCardId(checklistId) ??
      checklistIdToNumberForms(checklistId).find((form) =>
        /^[a-z]+\d{4}/.test(form),
      ) ??
      checklistIdToNumberForms(checklistId)[0];
    if (!diskId) continue;
    const langs = appearances[diskId] ?? {};
    const before = appearanceSetsOf(langs.fr).join(",");
    const merged = mergeAppearanceValues(langs.fr, sets);
    if (merged.length === 0) continue;
    langs.fr = appearanceValueForJson(merged);
    appearances[diskId] = langs;
    if (appearanceSetsOf(langs.fr).join(",") !== before) changed += 1;
  }

  writeFileSync(
    file,
    `${JSON.stringify(
      {
        generatedAt,
        appearances,
      } satisfies NarutoAppearancesFile,
      null,
      2,
    )}\n`,
  );
  return changed;
}
