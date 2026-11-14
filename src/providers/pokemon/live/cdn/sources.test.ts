import { describe, expect, it } from "vitest";

import {
  parseVersionFromNotesPayload,
  VERSION_RE,
} from "./sources";

describe("pokemontcglive VERSION_RE / notes parse", () => {
  it("accepts Version with build paren (legacy notes)", () => {
    const m = VERSION_RE.exec("Version 1.40.0 (1208333)");
    expect(m?.[1]).toBe("1.40.0");
    expect(m?.[2]).toBe("1208333");
  });

  it("accepts Version without build paren (1.42+ notes_en.json)", () => {
    const m = VERSION_RE.exec("Version 1.42.0");
    expect(m?.[1]).toBe("1.42.0");
    expect(m?.[2]).toBeUndefined();
  });

  it("parses the current updater JSON shape", () => {
    const [ver, build] = parseVersionFromNotesPayload({
      Version: "Version 1.42.0",
      Date: "09-10-2026",
      SupportInfo: "patch notes",
    });
    expect(ver).toBe("1.42.0");
    expect(build).toBeNull();
  });

  it("parses legacy JSON with build", () => {
    const [ver, build] = parseVersionFromNotesPayload({
      Version: "Version 1.40.0 (1208333)",
    });
    expect(ver).toBe("1.40.0");
    expect(build).toBe("1208333");
  });
});
