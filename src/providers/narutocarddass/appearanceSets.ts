/**
 * Valeurs d'`appearances.json` : une série, ou plusieurs quand la checklist
 * papier (ou le disque) place la même carte dans plusieurs extensions.
 */
export type NarutoAppearanceValue = string | readonly string[];

export type NarutoLangAppearances = Record<string, NarutoAppearanceValue>;

/** Normalise `s5` | `["s1","s5"]` → liste unique triée. */
export function appearanceSetsOf(
  value: NarutoAppearanceValue | null | undefined,
): string[] {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  const out = new Set<string>();
  for (const row of raw) {
    const set = String(row ?? "")
      .trim()
      .toLowerCase();
    if (set && set !== "unknown") out.add(set);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export function mergeAppearanceValues(
  ...values: Array<NarutoAppearanceValue | null | undefined>
): string[] {
  const out = new Set<string>();
  for (const value of values) {
    for (const set of appearanceSetsOf(value)) out.add(set);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/**
 * Série « primaire » pour `prints.set_code` / libellé lookup.
 * Préfère la plus petite série FR (s1 avant s5) ; évite unknown et les 巻ノ
 * (autre découpe, hors membership européenne).
 */
export function primaryAppearanceSet(
  sets: readonly string[],
  fallback = "unknown",
): string {
  const clean = appearanceSetsOf([...sets]);
  if (clean.length === 0) return fallback;
  const retail = clean.filter((set) => /^s[1-5]$/.test(set));
  if (retail.length) return retail[0]!;
  const nonVolume = clean.filter(
    (set) => set !== "s6" && !/^maki\d+$/i.test(set),
  );
  if (nonVolume.length) return nonVolume[0]!;
  const nonS6 = clean.filter((set) => set !== "s6");
  return nonS6[0] ?? clean[0]!;
}

/** Valeur à persister dans appearances.json (scalaire si une seule série). */
export function appearanceValueForJson(
  sets: readonly string[],
): NarutoAppearanceValue {
  const clean = appearanceSetsOf([...sets]);
  if (clean.length <= 1) return clean[0] ?? "unknown";
  return clean;
}
