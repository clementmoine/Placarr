import { describe, expect, it } from "vitest";

import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoCollectorsMatch,
  narutoDiskCardId,
} from "./collectorIdentity";
import {
  narutoAssetsCardUrl,
  narutoCardPathFromCollector,
  narutoCardRelPath,
  normalizeNarutoLang,
} from "./narutoCardPath";

describe("narutoDiskCardId", () => {
  it("keeps NI and N on distinct disk ids", () => {
    expect(narutoDiskCardId("ni001")).toBe("ni0001");
    expect(narutoDiskCardId("n001")).toBe("n0001");
    expect(narutoDiskCardId("忍-1")).toBe("ni0001");
    expect(narutoDiskCardId("n1650")).toBe("n1650");
    expect(narutoDiskCardId("te030-cdf")).toBe("te0030-cdf");
    expect(narutoDiskCardId("ST-226")).toBe("ta0226");
    expect(narutoDiskCardId("N-US097")).toBe("nus0097");
    expect(narutoDiskCardId("n0097-us")).toBe("nus0097");
  });
});

describe("narutoCardPath", () => {
  it("nests languages under the printed id, not the series", () => {
    expect(narutoCardRelPath(narutoCardPathFromCollector("ni001", "fr")!)).toBe(
      "ninja/ni0001/fr",
    );
    expect(narutoCardRelPath(narutoCardPathFromCollector("n001", "en")!)).toBe(
      "ninja/n0001/en",
    );
    expect(narutoCardRelPath(narutoCardPathFromCollector("n1650", "fr")!)).toBe(
      "ninja/n1650/fr",
    );
    expect(
      narutoCardRelPath(narutoCardPathFromCollector("N-US097", "en")!),
    ).toBe("ninja/nus0097/en");
    expect(normalizeNarutoLang("jap")).toBe("ja");
  });

  it("builds /assets URLs on the new tree", () => {
    expect(
      narutoAssetsCardUrl(
        "naruto/carddass",
        narutoCardPathFromCollector("ni001", "fr")!,
        "art.jpg",
      ),
    ).toBe("/assets/naruto/carddass/cards/ninja/ni0001/fr/art.jpg");
  });

  it("files 幕 / 忍者学校 under their own prefix folders", () => {
    expect(
      narutoCardRelPath(narutoCardPathFromCollector("gaku0001", "ja")!),
    ).toBe("gaku/gaku0001/ja");
    expect(
      narutoCardRelPath(narutoCardPathFromCollector("shi0001", "ja")!),
    ).toBe("shi/shi0001/ja");
    expect(
      narutoCardRelPath(narutoCardPathFromCollector("mju0062", "ja")!),
    ).toBe("mju/mju0062/ja");
    expect(
      narutoCardRelPath(narutoCardPathFromCollector("msa0044", "ja")!),
    ).toBe("msa/msa0044/ja");
  });
});

describe("print keys", () => {
  it("mints prefix keys and keeps NI distinct from N", () => {
    expect(mintNarutoPrintKey("ni001")).toBe("naruto:ni-0001");
    expect(mintNarutoPrintKey("n001")).toBe("naruto:n-0001");
    expect(mintNarutoPrintKey("ta081")).toBe("naruto:ta-0081");
    expect(mintNarutoPrintKey("m081")).toBe("naruto:m-0081");
    expect(mintNarutoPrintKey("te030-cdf")).toBe("naruto:te-0030-cdf");
    expect(mintNarutoPrintKey("ni023", "promo")).toBe("naruto:ni-0023-promo");
    expect(mintNarutoPrintKey("pr011", "promo")).toBe("naruto:pr-0011");
    expect(mintNarutoPrintKey("PR-忍-1", "promo")).toBe("naruto:prni-0001");
    expect(
      narutoCardRelPath(narutoCardPathFromCollector("PR-忍-1", "ja")!),
    ).toBe("promo/prni0001/ja");
    expect(mintNarutoPrintKey("N-US097")).toBe("naruto:nus-0097");
    expect(canonicalizeNarutoPrintKey("naruto:n-0097-us")).toBe(
      "naruto:nus-0097",
    );
  });

  it("rewrites series-baked keys without collapsing NI onto N", () => {
    expect(canonicalizeNarutoPrintKey("naruto:s1-ni001")).toBe(
      "naruto:ni-0001",
    );
    expect(canonicalizeNarutoPrintKey("naruto:s1-n001")).toBe("naruto:n-0001");
    expect(canonicalizeNarutoPrintKey("naruto:s28-n1650")).toBe(
      "naruto:n-1650",
    );
    expect(canonicalizeNarutoPrintKey("naruto:ni-0001")).toBe("naruto:ni-0001");
    expect(canonicalizeNarutoPrintKey("naruto:ni-001")).toBe("naruto:ni-0001");
    expect(canonicalizeNarutoPrintKey("naruto:ni-086")).toBe("naruto:ni-0086");
    expect(canonicalizeNarutoPrintKey("naruto:promo-ni023")).toBe(
      "naruto:ni-0023-promo",
    );
    expect(canonicalizeNarutoPrintKey("naruto:promo-te030-cdf")).toBe(
      "naruto:te-0030-cdf",
    );
  });
});

describe("voisinage ≠ identité", () => {
  it("does not treat NI-001 as N-001", () => {
    expect(narutoCollectorsMatch("ni001", "n001")).toBe(false);
    expect(narutoCollectorsMatch("NI-001", "忍-1")).toBe(true);
    expect(narutoCollectorsMatch("ta081", "M-081")).toBe(false);
    expect(narutoCollectorsMatch("ST-226", "ta226")).toBe(true);
    expect(narutoCollectorsMatch("JU-1002", "j1002")).toBe(true);
  });
});

/*
  188 tirages du catalogue n'ont **aucun** titre — donc aucune langue. Le
  paramètre était typé `string` et recevait `null` : le `.trim()` jetait, et
  comme la recherche de tirages enveloppe chaque provider dans un `allSettled`,
  une seule de ces cartes vidait **tout** le résultat.

  Concrètement : la modale d'ajout ne trouvait rien pour « cl04 », parce que la
  requête croisait `cl-0043`, qui n'a pas de titre — alors que `cl-0004` existe
  et que le catalogue admin l'affichait très bien.
*/
describe("une carte sans langue ne fait pas tomber la recherche", () => {
  it("normalise une langue absente en chaîne vide, sans jeter", () => {
    expect(normalizeNarutoLang(null as unknown as string)).toBe("");
    expect(normalizeNarutoLang(undefined as unknown as string)).toBe("");
    expect(normalizeNarutoLang("  ")).toBe("");
  });

  it("garde la normalisation des langues réelles", () => {
    expect(normalizeNarutoLang("JAP")).toBe("ja");
    expect(normalizeNarutoLang("jp")).toBe("ja");
    expect(normalizeNarutoLang(" FR ")).toBe("fr");
  });

  /*
    Sans langue il n'y a pas de chemin : elle en est un segment
    (`client/cl0043/fr`). On rend `null` — l'appelant n'attache alors ni art ni
    vignette, et la carte reste sélectionnable par sa seule référence.
  */
  it("rend null plutôt qu'un chemin sans dossier de langue", () => {
    expect(
      narutoCardPathFromCollector("cl0043", null as unknown as string),
    ).toBeNull();
    expect(narutoCardPathFromCollector("cl0043", "")).toBeNull();
  });

  it("rend toujours le chemin quand la langue est là", () => {
    expect(narutoCardPathFromCollector("cl0043", "fr")).toMatchObject({
      diskId: "cl0043",
      lang: "fr",
    });
  });
});
