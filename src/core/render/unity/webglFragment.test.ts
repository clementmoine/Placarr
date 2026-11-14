import { describe, expect, it } from "vitest";

import { toWebgl2Fragment } from "@/core/render/unity/webglFragment";

const guarded = [
  "#ifdef FRAGMENT",
  "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 1",
  "#define UNITY_SUPPORTS_UNIFORM_LOCATION 1",
  "void main() {}",
  "#endif",
].join("\n");

describe("toWebgl2Fragment", () => {
  it("strips the fragment guard and disables Unity location defines", () => {
    expect(toWebgl2Fragment(guarded)).toBe(
      [
        "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0",
        "#define UNITY_SUPPORTS_UNIFORM_LOCATION 0",
        "void main() {}",
        "",
      ].join("\n"),
    );
  });

  it("drops control bytes by default and keeps them when asked", () => {
    const src = `#ifdef FRAGMENT\nvoid main() { /* \u0001 */ }\n#endif`;
    expect(toWebgl2Fragment(src)).not.toContain("\u0001");
    expect(toWebgl2Fragment(src, { stripControlChars: false })).toContain(
      "\u0001",
    );
  });
});
