import { describe, expect, it } from "vitest";

import { withConsoleTee } from "./catalogueExtractRunner";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("withConsoleTee", () => {
  it("deux Sync simultanées gardent chacune leurs lignes (pas de mélange)", async () => {
    const a: string[] = [];
    const b: string[] = [];
    await Promise.all([
      withConsoleTee(
        (line) => a.push(line),
        async () => {
          console.log("A1");
          await tick();
          console.log("A2");
        },
      ),
      withConsoleTee(
        (line) => b.push(line),
        async () => {
          await tick();
          console.log("B1");
          await tick();
          console.warn("B2");
        },
      ),
    ]);
    expect(a).toEqual(["A1", "A2"]);
    expect(b).toEqual(["B1", "B2"]);
  });

  it("hors de toute Sync, rien n'est capturé", async () => {
    const seen: string[] = [];
    await withConsoleTee(
      (line) => seen.push(line),
      async () => {
        console.log("dedans");
      },
    );
    console.log("dehors");
    expect(seen).toEqual(["dedans"]);
  });
});
