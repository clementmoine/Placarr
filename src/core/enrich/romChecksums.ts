/**
 * ROM dump checksums for Tier0 identify (No-Intro / Redump-compatible).
 * Algorithm labels on identifier facts — not provider ids.
 */
import type { RomChecksums } from "@/types/providerModule";

function cleanHash(value?: string | null): string | undefined {
  const cleaned = value?.trim().toLowerCase().replace(/[^a-f0-9]/g, "");
  return cleaned || undefined;
}

/** Drop empty entries; normalize hex. */
export function normalizeRomChecksums(
  input?: RomChecksums | null,
): RomChecksums | undefined {
  if (!input) return undefined;
  const crc = cleanHash(input.crc);
  const md5 = cleanHash(input.md5);
  const sha1 = cleanHash(input.sha1);
  if (!crc && !md5 && !sha1) return undefined;
  return { crc, md5, sha1 };
}

function labelToChecksumKey(label?: string | null): keyof RomChecksums | null {
  const key = label?.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "crc" || key === "crc32") return "crc";
  if (key === "md5") return "md5";
  if (key === "sha1" || key === "sha") return "sha1";
  return null;
}

/** Rehydrate dump hashes from persisted identifier facts (CRC / MD5 / SHA1). */
export function romChecksumsFromIdentifierFacts(
  facts?: Array<{
    kind?: string | null;
    label?: string | null;
    value?: string | null;
  }> | null,
): RomChecksums | undefined {
  const out: RomChecksums = {};
  for (const fact of facts ?? []) {
    if (fact.kind?.trim().toLowerCase() !== "identifier") continue;
    const key = labelToChecksumKey(fact.label);
    if (!key) continue;
    const value = cleanHash(fact.value);
    if (!value || out[key]) continue;
    out[key] = value;
  }
  return normalizeRomChecksums(out);
}

export function mergeRomChecksums(
  ...parts: Array<RomChecksums | null | undefined>
): RomChecksums | undefined {
  const merged: RomChecksums = {};
  for (const part of parts) {
    if (!part) continue;
    if (!merged.crc && part.crc) merged.crc = part.crc;
    if (!merged.md5 && part.md5) merged.md5 = part.md5;
    if (!merged.sha1 && part.sha1) merged.sha1 = part.sha1;
  }
  return normalizeRomChecksums(merged);
}
