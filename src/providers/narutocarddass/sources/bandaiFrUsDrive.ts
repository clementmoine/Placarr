/**
 * Collector Drive « Bandai (FR/US) » — EN CCG sealed packshots + FR S1 dig.
 * Source of truth: `curated/sources/bandai-fr-us-drive.json`.
 *
 * Never mint display-s1…s6 (FR Carddass collision). Kayou / Panini stay out.
 */
import ledger from "../curated/sources/bandai-fr-us-drive.json";

export type BandaiFrUsDriveProduct = (typeof ledger.products)[number];

const DRIVE_NEW_EN_DISPLAYS = [
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "s12",
] as const;

const DRIVE_DISPLAY_TITLES: Record<
  (typeof DRIVE_NEW_EN_DISPLAYS)[number],
  string
> = {
  s7: "Quest for Power",
  s8: "Battle of Destiny",
  s9: "The Chosen",
  s10: "Lineage of the Legends",
  s11: "Approching Wind",
  s12: "A New Chronicle",
};

export function bandaiFrUsDriveLedger() {
  return ledger;
}

export function bandaiFrUsDriveIngestPackshots(): BandaiFrUsDriveProduct[] {
  return ledger.products.filter(
    (row) => row.ingest && typeof row.slug === "string" && Boolean(row.staging),
  );
}

/**
 * EN display boxes s7–s12 attested by the Drive album — Coleka/Goat start at
 * s13 / Coleka-gap fills. Packshots live under staging; no CDN URL.
 */
export function bandaiFrUsDriveNewEnDisplays(): Array<{
  set: (typeof DRIVE_NEW_EN_DISPLAYS)[number];
  title: string;
}> {
  const held = new Set(
    bandaiFrUsDriveIngestPackshots()
      .filter((row) => row.kind === "display" && row.slug?.startsWith("display-"))
      .map((row) => row.setCode)
      .filter(Boolean),
  );
  return DRIVE_NEW_EN_DISPLAYS.filter((set) => held.has(set)).map((set) => ({
    set,
    title: DRIVE_DISPLAY_TITLES[set],
  }));
}
