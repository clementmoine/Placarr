import { describe, expect, it } from "vitest";
import { shippudenOfficialFilesByJan } from "./packshots";

// —— packshots ——
{
  describe("shippudenOfficialFilesByJan", () => {
    it("mappe les JAN école vers les fichiers staging gaku", () => {
      const map = shippudenOfficialFilesByJan();
      expect(map.get("4543112503947000")).toBe("starter-shippuden-gaku-jp.jpg");
      expect(map.get("4543112504135000")).toBe("booster-shippuden-gaku-jp.jpg");
    });
  });
}
