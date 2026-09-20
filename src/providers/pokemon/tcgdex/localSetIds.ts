/**
 * TCGdex API set id → local catalogue id.
 *
 * TCGdex publishes anniversary / oddball ids (`30th`) that break the ME block
 * sequence next to `me01`…`me05`. We store the padded block id (`me05.5`) so
 * check-lists read `ME05.5 — …` and Live normalize still yields `me5-5`.
 *
 * API traffic keeps using the remote id (`provider_id`, `/sets/30th`).
 */
export const TCGDEX_API_TO_LOCAL_SET: Readonly<Record<string, string>> = {
  "30th": "me05.5",
  "30th-c": "me05.5c",
};

const LOCAL_TO_API: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(TCGDEX_API_TO_LOCAL_SET).map(([api, local]) => [local, api]),
);

/** Canonical set id for prints / printKeys / the set picker. */
export function canonicalTcgdexSetId(
  setId: string | null | undefined,
): string | null {
  const raw = setId?.trim().toLowerCase();
  if (!raw) return null;
  return TCGDEX_API_TO_LOCAL_SET[raw] ?? raw;
}

/** Remote `/sets/{id}` / card-id prefix when talking to the API. */
export function tcgdexApiSetId(
  setId: string | null | undefined,
): string | null {
  const raw = setId?.trim().toLowerCase();
  if (!raw) return null;
  return LOCAL_TO_API[raw] ?? raw;
}

/**
 * Collector number as printed / stored locally.
 *
 * TCGdex ships Unown `?` as localId `%3F` (and id `exu-%3F`) — a URL encoding
 * leak, not a collector marking. We keep `?` / `!` in printKeys so the checklist
 * reads `?/028`, not `%3F/028`.
 */
export function normalizeTcgdexLocalId(
  localId: string | null | undefined,
): string {
  const raw = localId?.trim() ?? "";
  if (!raw) return "";
  if (/^%3f$/i.test(raw)) return "?";
  if (/^%21$/i.test(raw)) return "!";
  if (raw.includes("%")) {
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded === "?" || decoded === "!") return decoded;
    } catch {
      /* keep raw */
    }
  }
  return raw;
}

/**
 * Card ids to try against `/cards/{id}`, given a local printKey set segment.
 * Prefer the API form when it differs (e.g. `30th-023` before `me05.5-023`).
 */
export function tcgdexApiCardIdCandidates(
  localSetId: string,
  localId: string,
): string[] {
  const local = localSetId.trim().toLowerCase();
  const number = normalizeTcgdexLocalId(localId);
  if (!local || !number) return [];
  const api = tcgdexApiSetId(local) ?? local;
  const out: string[] = [];
  const push = (set: string, num: string) => {
    const id = `${set}-${num}`;
    if (!out.includes(id)) out.push(id);
  };
  /*
    Unown `?` : TCGdex stocke l'id `exu-%3F` (caractères %, 3, F). Il faut
    tenter cette forme **avant** `exu-?`, sinon `encodeURIComponent` produit
    `exu-%3F` qui 404 — le 200 veut `exu-%253F` (= encode de `%3F`).
  */
  const numbers =
    number === "?"
      ? ["%3F", "?"]
      : number === "!"
        ? ["!", "%21"]
        : [number];
  for (const num of numbers) {
    push(api, num);
    if (api !== local) push(local, num);
    if (local.includes(".")) {
      push(local.replace(/\./g, "-"), num);
    }
  }
  return out;
}
