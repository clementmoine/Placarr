import { describe, expect, it } from "vitest";

import { tvTokyoFaceSourceFromFile } from "./tvTokyoFaces";
import { planTvTokyoFaceSources } from "../install/installTvTokyoFaces";

describe("tvTokyoFaceSourceFromFile", () => {
  it("maps a/b suffixes to parallel dumps", () => {
    expect(tvTokyoFaceSourceFromFile("s193a.jpg")).toBe("tvtokyo-a");
    expect(tvTokyoFaceSourceFromFile("s193b.jpg")).toBe("tvtokyo-b");
    expect(tvTokyoFaceSourceFromFile("s178.jpg")).toBe("tvtokyo");
    expect(tvTokyoFaceSourceFromFile("s178b.jpg")).toBe("tvtokyo-b");
    expect(tvTokyoFaceSourceFromFile("n01.jpg")).toBe("tvtokyo");
  });
});

describe("planTvTokyoFaceSources", () => {
  it("keeps both sides of every double diskId", () => {
    const { planned, failed } = planTvTokyoFaceSources();
    expect(failed).toEqual([]);
    expect(planned.length).toBe(829);

    const byDisk = new Map<string, string[]>();
    for (const row of planned) {
      const list = byDisk.get(row.diskId) ?? [];
      list.push(row.source);
      byDisk.set(row.diskId, list);
    }
    expect(byDisk.get("ta0193")?.sort()).toEqual(["tvtokyo-a", "tvtokyo-b"]);
    expect(byDisk.get("ta0178")?.sort()).toEqual(["tvtokyo", "tvtokyo-b"]);
    expect(byDisk.get("ta0034")?.sort()).toEqual(["tvtokyo", "tvtokyo-b"]);
    expect(byDisk.size).toBe(790);
  });
});
