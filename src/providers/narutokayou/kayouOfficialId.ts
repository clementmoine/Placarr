/** `NREA02-UR-015L3` → `nrea02-ur-015l3` (curated filename + manifest key). */
export function kayouOfficialIdSlug(idCode: string): string {
  return idCode
    .trim()
    .toLowerCase()
    .replace(/\u25C7/g, "shin-")
    .replace(/◇/g, "shin-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Ninja Age official id → Placarr `cc.*` number.
 * `NRCCNA-◇MR-001` (early exclusive) → `cc.mr.001s`; `NRCCNA-MR-001` → `cc.mr.001`.
 */
export function kayouOfficialIdToCcNumber(idCode: string): string | null {
  const raw = idCode.trim();
  // `NRCCNA-◇MR-001` (diamond glued to rarity) vs `NRCCNA-MR-001`.
  const m = raw.match(
    /^NRCCNA-((?:\u25C7|◇))?([A-Za-z]+)-(\d+[A-Za-z0-9]*)$/i,
  );
  if (!m) return null;
  const special = Boolean(m[1]);
  const tier = m[2]!.toLowerCase();
  const num = m[3]!.toLowerCase();
  return `cc.${tier}.${num}${special ? "s" : ""}`;
}

/**
 * Official product id → catalogue set + dotted number.
 * - `NRCCNA-*` → set `ninjaagebox`, number `cc.*`
 * - `NREA02-CR-001L5` → set `nrea02`, number `nrea02.cr.001l5`
 * - `NRI01-*` / `NRSA01–03-*` → same pattern
 */
export function kayouOfficialIdToPrint(
  idCode: string,
): { setCode: string; number: string } | null {
  const cc = kayouOfficialIdToCcNumber(idCode);
  if (cc) return { setCode: "ninjaagebox", number: cc };

  const raw = idCode.trim();
  const m = raw.match(
    /^(NREA\d+|NRI\d+|NRSA\d+|NRSS\d+)-((?:\u25C7|◇))?([A-Za-z+]+)-(\d+[A-Za-z0-9]*)$/i,
  );
  if (!m) return null;
  const product = m[1]!.toLowerCase();
  const special = Boolean(m[2]);
  const tier = m[3]!.toLowerCase().replace(/\+/g, "plus");
  const num = m[4]!.toLowerCase();
  return {
    setCode: product,
    number: `${product}.${tier}.${num}${special ? "s" : ""}`,
  };
}

/** Human label for an official product set code. */
export function kayouOfficialSetLabel(setCode: string): string {
  const code = setCode.trim().toLowerCase();
  const labels: Record<string, string> = {
    ninjaagebox: "Ninja Age",
    nrea01: "Earth Scroll (NREA01)",
    nrea02: "Earth Scroll (NREA02)",
    nri01: "Earth Scroll Box (NRI01)",
    nrsa01: "Chapter Jin Series 1 (NRSA01)",
    nrsa02: "Chapter Jin Series 2 (NRSA02)",
    nrsa03: "Chapter Jin Series 3 (NRSA03)",
  };
  return labels[code] ?? setCode.trim().toUpperCase();
}

/** Suffix keys for lookup when the catalogue ref omits the product prefix. */
export function kayouOfficialIdSuffixKeys(idCode: string): string[] {
  const parts = idCode.trim().split("-").filter(Boolean);
  if (parts.length < 2) return [];
  const keys = new Set<string>();
  keys.add(parts.slice(-2).join("-").toLowerCase());
  if (parts.length >= 3) {
    keys.add(parts.slice(-3).join("-").toLowerCase());
  }
  return [...keys];
}

/** Keys to try from a catalogue `reference` + optional rarity. */
export function kayouOfficialLookupKeys(
  reference: string,
  rarity?: string | null,
): string[] {
  const keys = new Set<string>();
  const ref = reference.trim();
  if (ref) keys.add(kayouOfficialIdSlug(ref));
  const parts = ref.split("-").filter(Boolean);
  if (parts.length >= 2) {
    keys.add(parts.slice(-2).join("-").toLowerCase());
  }
  const r = rarity?.trim().toUpperCase();
  if (r && parts.length >= 1) {
    const num = parts[parts.length - 1]!;
    keys.add(kayouOfficialIdSlug(`${r}-${num}`));
    keys.add(`${r.toLowerCase()}-${num.toLowerCase()}`);
  }
  return [...keys];
}
