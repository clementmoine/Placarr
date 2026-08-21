/**
 * Chercher une carte du 疾風伝 par ce qui est **écrit dessus**.
 *
 * La base range en `shi0043` ; la carte, elle, porte `忍伝-43`. Tant que la
 * recherche ne lisait que l'identifiant disque, chercher son numéro ne rendait
 * rien — le cas le plus banal qui soit, et le seul qui ne marchait pas.
 */
import { describe, expect, it } from "vitest";

import { diskIdFromPrintedReference } from "./searchPrints";

describe("référence imprimée du 疾風伝", () => {
  it("reads the four printed prefixes", () => {
    expect(diskIdFromPrintedReference("忍伝-43")).toBe("shi0043");
    expect(diskIdFromPrintedReference("術伝-65")).toBe("mju0065");
    expect(diskIdFromPrintedReference("作伝-26")).toBe("msa0026");
    expect(diskIdFromPrintedReference("忍伝-学-1")).toBe("gaku0001");
  });

  it("tolerates the hyphen and the leading zeros, both of which are written", () => {
    expect(diskIdFromPrintedReference("忍伝43")).toBe("shi0043");
    expect(diskIdFromPrintedReference("忍伝-043")).toBe("shi0043");
    expect(diskIdFromPrintedReference("忍伝-学1")).toBe("gaku0001");
    expect(diskIdFromPrintedReference("  術伝-65 ")).toBe("mju0065");
  });

  /*
    忍伝-学 commence par 忍伝. Si le préfixe le plus court gagnait, 忍伝-学-1
    deviendrait un 忍伝 — deux cartes différentes sous une même référence.
  */
  it("does not let 忍伝 swallow 忍伝-学", () => {
    expect(diskIdFromPrintedReference("忍伝-学-1")).not.toBe("shi0001");
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
