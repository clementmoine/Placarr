import { describe, expect, it } from "vitest";

import {
  lddbCoverBucket,
  lddbCoverUrls,
  lddbIdFromPath,
  lddbRefFromPath,
  shelfSuggestsLaserDisc,
  shelfSuggestsLddbFormat,
} from "./coverUrl";

describe("lddbCoverBucket", () => {
  it.each([
    [1, { start: 1, end: 100 }],
    [100, { start: 1, end: 100 }],
    [101, { start: 101, end: 200 }],
    [7154, { start: 7101, end: 7200 }],
    [31738, { start: 31701, end: 31800 }],
  ] as const)("maps id %s → bucket %j", (id, bucket) => {
    expect(lddbCoverBucket(id)).toEqual(bucket);
  });
});

describe("lddbCoverUrls", () => {
  it("builds front / back / thumb for LaserDisc", () => {
    expect(lddbCoverUrls(7154)).toEqual({
      front: "https://www.lddb.com/cover/ld/07101-07200/07154.jpg",
      back: "https://www.lddb.com/cover/ld/07101-07200/07154_back.jpg",
      thumb: "https://www.lddb.com/cover/ld/07101-07200/thumb/07154.jpg",
    });
  });

  it.each([
    ["vhd", 129, "https://www.lddb.com/cover/vhd/00101-00200/00129.jpg"],
    ["ced", 7, "https://www.lddb.com/cover/ced/00001-00100/00007.jpg"],
    ["dvhs", 21, "https://www.lddb.com/cover/dvhs/00001-00100/00021.jpg"],
    ["hddvd", 6, "https://www.lddb.com/cover/hddvd/00001-00100/00006.jpg"],
  ] as const)("builds %s cover for id %s", (format, id, front) => {
    expect(lddbCoverUrls(id, format)?.front).toBe(front);
  });

  it("rejects non-positive ids", () => {
    expect(lddbCoverUrls(0)).toBeNull();
    expect(lddbCoverUrls("abc")).toBeNull();
  });
});

describe("lddbRefFromPath", () => {
  it.each([
    [
      "https://www.lddb.com/laserdisc/7154/42785/12-Monkeys",
      { id: "7154", formatId: "ld" },
    ],
    [
      "https://www.lddb.com/vhd/00129/VHP78152/Song-of-the-South",
      { id: "00129", formatId: "vhd" },
    ],
    [
      "https://www.lddb.com/ced/00007/MD100002/2001:-A-Space-Odyssey",
      { id: "00007", formatId: "ced" },
    ],
    [
      "https://www.lddb.com/dvhs/00021/2008407/DareDevil",
      { id: "00021", formatId: "dvhs" },
    ],
    [
      "https://www.lddb.com/hddvd/00006/61101155/40-Year-Old-Virgin-The",
      { id: "00006", formatId: "hddvd" },
    ],
  ] as const)("parses %s", (url, expected) => {
    const ref = lddbRefFromPath(url);
    expect(ref?.id).toBe(expected.id);
    expect(ref?.format.id).toBe(expected.formatId);
    expect(lddbIdFromPath(url)).toBe(expected.id);
  });
});

describe("shelfSuggestsLddbFormat", () => {
  it.each([
    ["Laser Disc", "ld"],
    ["laserdisc", "ld"],
    ["LD", "ld"],
    ["VHD", "vhd"],
    ["CED", "ced"],
    ["D-VHS", "dvhs"],
    ["D-Theater", "dvhs"],
    ["HD-DVD", "hddvd"],
    ["HD DVD collection", "hddvd"],
  ] as const)("maps shelf %j → %s", (shelf, formatId) => {
    expect(shelfSuggestsLddbFormat(shelf)?.id).toBe(formatId);
  });

  it("rejects unrelated shelves (incl. Magazines PDF archive)", () => {
    expect(shelfSuggestsLddbFormat("Bluray")).toBeNull();
    expect(shelfSuggestsLddbFormat("VHS")).toBeNull();
    expect(shelfSuggestsLddbFormat("Magazines")).toBeNull();
    expect(shelfSuggestsLddbFormat(null)).toBeNull();
    expect(shelfSuggestsLaserDisc("VHD")).toBe(false);
    expect(shelfSuggestsLaserDisc("Laser Disc")).toBe(true);
  });
});
