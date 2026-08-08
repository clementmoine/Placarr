import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/runtimeData", () => ({
  dataRoot: () => "/tmp/placarr-data",
}));

import {
  foilExtractLabel,
  isFoilExtractTarget,
  normalizeFoilExtractTarget,
  resolveFoilExtractCommand,
} from "./foilExtractRunner";

describe("foilExtractRunner targets", () => {
  it("exposes one target per pack", () => {
    expect(isFoilExtractTarget("lorcana")).toBe(true);
    expect(isFoilExtractTarget("pokemon")).toBe(true);
    expect(isFoilExtractTarget("lorcana-web")).toBe(true); // legacy alias
    expect(normalizeFoilExtractTarget("lorcana-cards")).toBe("lorcana");
    expect(normalizeFoilExtractTarget("lorcana-mobile")).toBe("lorcana");
    expect(foilExtractLabel("lorcana")).toBe("Lorcana");
  });

  it("builds a full Lorcana command (web + cards; Unity when APK exists)", async () => {
    const cmd = await resolveFoilExtractCommand("lorcana");
    expect(cmd.command).toContain("scripts/lorcana/run.sh");
    expect(cmd.args[0]).toBe("--providers");
    expect(cmd.args).toEqual(
      expect.arrayContaining(["lorcanaweb", "lorcanacards"]),
    );
  });

  it("pokemon extract unions APK/Malie inventory then CDN (all Live langs)", async () => {
    const cmd = await resolveFoilExtractCommand("pokemon");
    expect(cmd.command).toContain("scripts/pokemon/run.sh");
    expect(cmd.args).toEqual(["--langs", "fr,en,de,it,es,ptbr", "--no-job"]);
    expect(cmd.prelude.some((l) => /inventory/i.test(l))).toBe(true);
    expect(cmd.prelude.some((l) => /Malie/i.test(l))).toBe(true);
  });

  it("lorcana extract passes --no-job so child does not cancel worker job", async () => {
    const cmd = await resolveFoilExtractCommand("lorcana");
    expect(cmd.args).toContain("--no-job");
  });
});
