import { describe, expect, it } from "vitest";

import { parsePmPathOutput } from "./pullPackageApks";

describe("parsePmPathOutput", () => {
  it("lit les lignes package:", () => {
    expect(
      parsePmPathOutput(
        "package:/data/app/~~x/base.apk\npackage:/data/app/~~x/split_config.arm64_v8a.apk\n",
      ),
    ).toEqual([
      "/data/app/~~x/base.apk",
      "/data/app/~~x/split_config.arm64_v8a.apk",
    ]);
  });

  it("ignore le vide", () => {
    expect(parsePmPathOutput("")).toEqual([]);
  });
});
