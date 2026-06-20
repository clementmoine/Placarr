import { describe, expect, it } from "vitest";
import { fetchFromAllGameSources } from "@/services/metadataGameFetch";

const ADMIN_REFRESH_CASES = [
  {
    name: "Zapper : Le Criquet Ravageur !",
    barcode: "3546430103593",
    platform: "Xbox Original",
  },
  {
    name: "Le Seigneur Des Anneaux : Le Tiers Age",
    barcode: "5030931039553",
    platform: "Xbox Original",
  },
  {
    name: "La Légende Du Dragon",
    barcode: "5743211850679",
    platform: "PlayStation 2",
  },
  {
    name: "GoldenEye : Au Service du Mal",
    barcode: "5030931039720",
    platform: "PlayStation 2",
  },
] as const;

describe.runIf(process.env.RECORD === "1")("admin refresh repro (live)", () => {
  it.each(ADMIN_REFRESH_CASES)(
    "returns metadata for $name",
    async ({ name, barcode, platform }) => {
      const result = await fetchFromAllGameSources(name, barcode, platform);
      expect(result).not.toBeNull();
      expect(result?.title?.trim()).toBeTruthy();
    },
    90000,
  );
});
