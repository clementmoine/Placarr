import { describe, expect, it } from "vitest";

import { isAllowedAdbEndpoint } from "@/lib/webadb/adbEndpoint";

describe("isAllowedAdbEndpoint", () => {
  it.each([
    "127.0.0.1:7555",
    "127.0.0.1:26624",
    "localhost:5555",
    "192.168.1.20:5555",
    "10.0.0.2:5555",
    "172.16.0.5:5555",
    "emulator-5554",
  ])("autorise %s", (serial) => {
    expect(isAllowedAdbEndpoint(serial)).toBe(true);
  });

  it.each(["8.8.8.8:5555", "example.com:5555", "", "host:abc"])(
    "refuse %s",
    (serial) => {
      expect(isAllowedAdbEndpoint(serial)).toBe(false);
    },
  );
});
