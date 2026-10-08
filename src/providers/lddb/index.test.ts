import { describe, expect, it } from "vitest";

import { mapLddbMetadata } from "./index";
import type { LddbTitle } from "./parse";

describe("mapLddbMetadata", () => {
  it("emits front + back attachments for a complete sleeve", () => {
    const title: LddbTitle = {
      id: "24721",
      format: "ld",
      formatLabel: "LaserDisc",
      title: "Toy Story",
      sourceUrl: "https://www.lddb.com/laserdisc/24721/12436-AS/Toy-Story",
      year: 1995,
      reference: "12436 AS",
      country: "USA",
      frontUrl: "https://www.lddb.com/cover/ld/24701-24800/24721.jpg",
      backUrl: "https://www.lddb.com/cover/ld/24701-24800/24721_back.jpg",
      video: "NTSC",
      specs: "LBX/SRD",
    };
    const meta = mapLddbMetadata(title);
    expect(meta?.title).toBe("Toy Story");
    expect(meta?.imageUrl).toContain("24721.jpg");
    expect(meta?.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "us", source: "lddb" }),
        expect.objectContaining({ role: "back-us", source: "lddb" }),
      ]),
    );
    expect(meta?.externalIds?.lddb).toBe("24721");
    expect(
      meta?.facts?.some(
        (f) => f.kind === "media-format" && /LaserDisc|NTSC/.test(f.value),
      ),
    ).toBe(true);
  });

  it("tags French release covers with fr for gallery ranking", () => {
    const meta = mapLddbMetadata({
      id: "33828",
      format: "ld",
      formatLabel: "LaserDisc",
      title: "Toy Story",
      sourceUrl: "https://www.lddb.com/laserdisc/33828/22/7610/Toy-Story",
      country: "France",
      frontUrl: "https://www.lddb.com/cover/ld/33801-33900/33828.jpg",
      backUrl: "https://www.lddb.com/cover/ld/33801-33900/33828_back.jpg",
    });
    expect(meta?.attachments).toEqual([
      expect.objectContaining({ type: "cover", role: "fr" }),
      expect.objectContaining({ type: "image", role: "back-fr" }),
    ]);
  });

  it("forwards sibling localized titles as aliases", () => {
    const meta = mapLddbMetadata({
      id: "27958",
      format: "ld",
      formatLabel: "LaserDisc",
      title: "Nightmare Before Christmas, The",
      sourceUrl:
        "https://www.lddb.com/laserdisc/27958/22/4193/Nightmare-Before-Christmas-The",
      country: "France",
      aliases: ["Etrange Noël de Monsieur Jack, L'"],
      frontUrl: "https://www.lddb.com/cover/ld/27901-28000/27958.jpg",
    });
    expect(meta?.aliases).toEqual(["Etrange Noël de Monsieur Jack, L'"]);
  });

  it("falls back to PAL → eu when Country is missing, never role front", () => {
    const meta = mapLddbMetadata({
      id: "33828",
      format: "ld",
      formatLabel: "LaserDisc",
      title: "Toy Story",
      sourceUrl: "https://www.lddb.com/laserdisc/33828/22/7610/Toy-Story",
      video: "PAL",
      frontUrl: "https://www.lddb.com/cover/ld/33801-33900/33828.jpg",
    });
    expect(meta?.attachments).toEqual([
      expect.objectContaining({ type: "cover", role: "eu" }),
    ]);
    expect(meta?.attachments?.[0]?.role).not.toBe("front");
  });

  it("omits cover role when no country/region signal exists", () => {
    const meta = mapLddbMetadata({
      id: "33828",
      format: "ld",
      formatLabel: "LaserDisc",
      title: "Toy Story",
      sourceUrl: "https://www.lddb.com/laserdisc/33828/22/7610/Toy-Story",
      frontUrl: "https://www.lddb.com/cover/ld/33801-33900/33828.jpg",
    });
    expect(meta?.attachments?.[0]?.role).toBeUndefined();
  });

  it("labels non-LaserDisc formats in the media-format fact", () => {
    const title: LddbTitle = {
      id: "00006",
      format: "hddvd",
      formatLabel: "HD-DVD",
      title: "40 Year Old Virgin, The",
      sourceUrl:
        "https://www.lddb.com/hddvd/00006/61101155/40-Year-Old-Virgin-The",
      frontUrl: "https://www.lddb.com/cover/hddvd/00001-00100/00006.jpg",
    };
    const meta = mapLddbMetadata(title);
    expect(
      meta?.facts?.some(
        (f) => f.kind === "media-format" && f.value === "HD-DVD",
      ),
    ).toBe(true);
  });

  it("returns null without a title", () => {
    expect(mapLddbMetadata(null)).toBeNull();
  });
});
