import { describe, expect, it } from "vitest";

import {
  extractWikidataEntityIds,
  extractWikidataPeople,
} from "./resolver";

describe("extractWikidataEntityIds", () => {
  it("extrait les QID d'une propriété", () => {
    expect(
      extractWikidataEntityIds(
        {
          claims: {
            P123: [{ mainsnak: { datavalue: { value: { id: "Q123" } } } }],
          },
        },
        "P123",
      ),
    ).toEqual(["Q123"]);
  });
});

describe("extractWikidataPeople", () => {
  it("résout auteurs et éditeurs depuis les claims Wikidata", async () => {
    const entity = {
      claims: {
        P178: [{ mainsnak: { datavalue: { value: { id: "Q61088" } } } }],
        P123: [{ mainsnak: { datavalue: { value: { id: "Q881194" } } } }],
      },
    };

    const people = await extractWikidataPeople(entity);

    expect(people.authors.some((person) => /teuber/i.test(person.name))).toBe(
      true,
    );
    expect(people.publishers.some((person) => /kosmos/i.test(person.name))).toBe(
      true,
    );
  });
});
