import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { planKayouOfficialCardBackInstalls } from "./installOfficialCardBacks";

function sha(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

describe("planKayouOfficialCardBackInstalls", () => {
  const a = Buffer.from("same-motif");
  const b = Buffer.from("unique-b");
  const tierBytes = Buffer.from("tier-ur");
  const defaultBytes = Buffer.from("pack-default");

  it("duplicates card-local backs when several cards share bytes", () => {
    const plans = planKayouOfficialCardBackInstalls(
      [
        { slug: "nrsa02-ur-001l3", bytes: a, idCode: "NRSA02-UR-001L3" },
        { slug: "nrsa02-ur-002l3", bytes: a, idCode: "NRSA02-UR-002L3" },
      ],
      { defaultHash: null, tierByHash: new Map() },
    );
    expect(plans.every((p) => p.placement.kind === "print")).toBe(true);
    expect(plans.map((p) => p.writeRel).sort()).toEqual([
      "nrsa02/en/nrsa02.ur.001l3/back.webp",
      "nrsa02/en/nrsa02.ur.002l3/back.webp",
    ]);
  });

  it("routes a one-off back next to the print folder", () => {
    const plans = planKayouOfficialCardBackInstalls(
      [{ slug: "nrea02-ur-015l3", bytes: b, idCode: "NREA02-UR-015L3" }],
      { defaultHash: null, tierByHash: new Map() },
    );
    expect(plans).toEqual([
      {
        slug: "nrea02-ur-015l3",
        hash: expect.any(String),
        placement: {
          kind: "print",
          set: "nrea02",
          lang: "en",
          card: "nrea02.ur.015l3",
        },
        writeRel: "nrea02/en/nrea02.ur.015l3/back.webp",
      },
    ]);
  });

  it("aliases to existing rarity tier when bytes match", () => {
    const plans = planKayouOfficialCardBackInstalls(
      [{ slug: "nrea02-ur-001l3", bytes: tierBytes }],
      {
        defaultHash: null,
        tierByHash: new Map([[sha(tierBytes), "ur"]]),
      },
    );
    expect(plans[0]!.placement).toEqual({ kind: "tier", slug: "ur" });
    expect(plans[0]!.writeRel).toBeUndefined();
  });

  it("skips install when bytes equal pack default", () => {
    const plans = planKayouOfficialCardBackInstalls(
      [{ slug: "nrea02-r-001l1", bytes: defaultBytes }],
      { defaultHash: sha(defaultBytes), tierByHash: new Map() },
    );
    expect(plans[0]!.placement).toEqual({ kind: "default" });
    expect(plans[0]!.writeRel).toBeUndefined();
  });
});
