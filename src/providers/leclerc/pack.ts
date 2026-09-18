/**
 * Leclerc pack / op registry — **client-safe** (no `node:*`).
 * `cataloguePacks` imports this from the admin Catalogue tab.
 * Disk roots: {@link leclercCuratedDir} in `./curatedPaths`.
 */
/** Shared printKey game slug — every op keeps `leclerc:set-number`. */
export const LECLERC_PRINT_GAME = "leclerc";

export type LeclercFamilyId = "marvel" | "disney" | "starwars";

export type LeclercOpSpec = {
  /** Disk / catalogue set code (`marvel21`, `disney25`, …). */
  setCode: string;
  /** `data/<packId>/` + admin line id. */
  packId: `leclerc/${string}`;
  providerId: string;
  extractTarget: string;
  effectPackId: string;
  family: LeclercFamilyId;
  /** Only ops with a curated checklist are registered. */
  enabled: boolean;
};

const FAMILY_EFFECT: Record<LeclercFamilyId, string> = {
  marvel: "leclerc-marvel",
  disney: "leclerc-disney",
  starwars: "leclerc-starwars",
};

const FAMILY_META: Record<
  LeclercFamilyId,
  { id: string; labelFr: string; labelEn: string }
> = {
  marvel: { id: "marvel", labelFr: "Marvel", labelEn: "Marvel" },
  disney: { id: "disney", labelFr: "Disney", labelEn: "Disney" },
  starwars: { id: "starwars", labelFr: "Star Wars", labelEn: "Star Wars" },
};

function op(
  setCode: string,
  family: LeclercFamilyId,
  enabled: boolean,
): LeclercOpSpec {
  return {
    setCode,
    packId: `leclerc/${setCode}`,
    providerId: `leclerc${setCode}`,
    extractTarget: `leclerc-${setCode}`,
    effectPackId: FAMILY_EFFECT[family],
    family,
    enabled,
  };
}

/**
 * Toutes les opérations connues. `enabled` = checklist curated présente
 * (sinon réservé pour un Sync ultérieur, pas encore une ligne admin).
 */
export const LECLERC_OPS: readonly LeclercOpSpec[] = [
  op("sw15", "starwars", false),
  op("sw16", "starwars", false),
  op("sw18", "starwars", false),
  op("sw19", "starwars", false),
  op("sw19sb", "starwars", false),
  op("marvel20", "marvel", false),
  op("marvel20sb", "marvel", false),
  op("marvel21", "marvel", true),
  op("marvel22", "marvel", true),
  op("marvel23", "marvel", true),
  op("marvel24", "marvel", true),
  op("disney25", "disney", true),
];

export const LECLERC_ACTIVE_OPS: readonly LeclercOpSpec[] = LECLERC_OPS.filter(
  (row) => row.enabled,
);

export function leclercOpForSetCode(setCode: string): LeclercOpSpec | null {
  const code = setCode.trim().toLowerCase();
  return LECLERC_OPS.find((row) => row.setCode === code) ?? null;
}

export function leclercOpForPackId(packId: string): LeclercOpSpec | null {
  return LECLERC_OPS.find((row) => row.packId === packId) ?? null;
}

export function leclercOpForExtractTarget(
  target: string,
): LeclercOpSpec | null {
  return LECLERC_OPS.find((row) => row.extractTarget === target) ?? null;
}

export function leclercFamilyMeta(family: LeclercFamilyId) {
  return FAMILY_META[family];
}

/** @deprecated Prefer per-op pack ids (`leclerc/marvel21`, …). */
export const LECLERC_MARVEL_PACK_ID = "leclerc/marvel21";
/** @deprecated Prefer per-op pack ids. */
export const LECLERC_DISNEY_PACK_ID = "leclerc/disney25";
/** @deprecated Prefer per-op provider ids. */
export const LECLERC_MARVEL_PROVIDER_ID = "leclercmarvel21";
/** @deprecated Prefer per-op provider ids. */
export const LECLERC_DISNEY_PROVIDER_ID = "leclercdisney25";
export const LECLERC_MARVEL_EFFECT_PACK_ID = FAMILY_EFFECT.marvel;
export const LECLERC_DISNEY_EFFECT_PACK_ID = FAMILY_EFFECT.disney;
