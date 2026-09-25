import { describe, expect, it } from "vitest";
import {
  diskIdFromPrintedReference,
  formatShippudenReference,
} from "./search";

// —— searchPrints ——
{
  /**
   * Chercher une carte du 疾風伝 par ce qui est **écrit dessus**.
   *
   * La base range en `shi0043` ; la carte, elle, porte `忍伝-43`. Tant que la
   * recherche ne lisait que l'identifiant disque, chercher son numéro ne rendait
   * rien — le cas le plus banal qui soit, et le seul qui ne marchait pas.
   */

  describe("référence imprimée du 疾風伝", () => {
    it("reads the four printed prefixes", () => {
      expect(diskIdFromPrintedReference("忍伝-43")).toBe("shi0043");
      expect(diskIdFromPrintedReference("術伝-65")).toBe("mju0065");
      expect(diskIdFromPrintedReference("作伝-26")).toBe("msa0026");
      expect(diskIdFromPrintedReference("忍伝-学-1")).toBe("gaku0001");
    });

    it("reads Shippuden promo prefixes (PR忍伝 / PR作伝 / PR学)", () => {
      expect(diskIdFromPrintedReference("PR作伝-5")).toBe("prmsa0005");
      expect(diskIdFromPrintedReference("PR忍伝-6")).toBe("prshi0006");
      expect(diskIdFromPrintedReference("PR学-001")).toBe("prgaku0001");
      expect(diskIdFromPrintedReference("PR学1")).toBe("prgaku0001");
      // Promo must not collapse onto the retail 作伝 / 忍伝 of the same number.
      expect(diskIdFromPrintedReference("PR作伝-5")).not.toBe("msa0005");
      expect(diskIdFromPrintedReference("PR忍伝-6")).not.toBe("shi0006");
    });

    it("formats promo refs as printed on the card", () => {
      expect(formatShippudenReference("prmsa", "prmsa0005")).toBe("PR作伝-5");
      expect(formatShippudenReference("prshi", "prshi0006")).toBe("PR忍伝-6");
      expect(formatShippudenReference("prgaku", "prgaku0001")).toBe("PR学-001");
    });

    it("tolerates the hyphen and the leading zeros, both of which are written", () => {
      expect(diskIdFromPrintedReference("忍伝43")).toBe("shi0043");
      expect(diskIdFromPrintedReference("忍伝-043")).toBe("shi0043");
      expect(diskIdFromPrintedReference("忍伝-学1")).toBe("gaku0001");
      expect(diskIdFromPrintedReference("  術伝-65 ")).toBe("mju0065");
    });

    it("accepts Suruga / carddas20 spellings of 忍者学校", () => {
      expect(diskIdFromPrintedReference("忍伝-学007")).toBe("gaku0007");
      expect(diskIdFromPrintedReference("忍伝学007")).toBe("gaku0007");
      expect(diskIdFromPrintedReference("忍伝学-007")).toBe("gaku0007");
    });

    it("formats 学 as 忍伝-学NNN (Bandai / Suruga title form)", () => {
      expect(formatShippudenReference("gaku", "gaku0007")).toBe("忍伝-学007");
      expect(formatShippudenReference("gaku", "7")).toBe("忍伝-学007");
      expect(formatShippudenReference("shi", "shi0043")).toBe("忍伝-43");
    });

    /*
      忍伝-学 commence par 忍伝. Si le préfixe le plus court gagnait, 忍伝-学-1
      deviendrait un 忍伝 — deux cartes différentes sous une même référence.
    */
    it("does not let 忍伝 swallow 忍伝-学 or 忍伝学", () => {
      expect(diskIdFromPrintedReference("忍伝-学-1")).not.toBe("shi0001");
      expect(diskIdFromPrintedReference("忍伝学007")).not.toBe("shi0007");
    });

    /*
      Le Carddass imprime `忍-43`, sans le 伝, et sa numérotation repart de 1 :
      les deux jeux ont une carte 43, et ce ne sont pas les mêmes.
    */
    it("refuses the Carddass form", () => {
      expect(diskIdFromPrintedReference("忍-43")).toBeNull();
      expect(diskIdFromPrintedReference("術-65")).toBeNull();
      expect(diskIdFromPrintedReference("")).toBeNull();
      expect(diskIdFromPrintedReference("うずまきナルト")).toBeNull();
    });
  });
}
