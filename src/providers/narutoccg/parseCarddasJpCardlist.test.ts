import { describe, expect, it } from "vitest";

import {
  carddasJpCardlistCards,
  carddasJpVolumeSetCode,
  mergeCarddasJpNamesIntoIndex,
  parseCarddasJpCardlistHtml,
} from "./parseCarddasJpCardlist";

const FIXTURE = `
<td rowspan="2" align="center" nowrap bgcolor="#FFEEFF" class="s_font">忍-1</td>
<td align="left" bgcolor="#FFFFFF" class="m_font_b" nowrap><a href="#"><font color="#990000">うずまきナルト</font></a></td>
<td align="center" bgcolor="#FFFFFF" class="s_font" nowrap>巻ノ壱</td>
<td rowspan="2" align="center" nowrap bgcolor="#EEFFFF" class="s_font">術-9</td>
<td align="left" bgcolor="#FFFFFF" class="m_font_b" nowrap><a href="#"><font color="#000066">千年殺し</font></a></td>
<td align="center" bgcolor="#FFFFFF" class="s_font" nowrap>巻ノ壱</td>
<td rowspan="2" align="center" nowrap bgcolor="#EEFFEE" class="s_font">作-1</td>
<td align="left" bgcolor="#FFFFFF" class="m_font_b" nowrap><a href="#"><font color="#006600">任務開始</font></a></td>
<td align="center" bgcolor="#FFFFFF" class="s_font" nowrap>巻の四</td>
`;

describe("parseCarddasJpCardlistHtml", () => {
  it("reads 忍/術/作 and maps 巻の四 to maki4", () => {
    const rows = parseCarddasJpCardlistHtml(FIXTURE, "maki1");
    expect(rows).toEqual([
      {
        printed: "忍-1",
        number: "ni0001",
        name: "うずまきナルト",
        setCode: "maki1",
        volume: "巻ノ壱",
      },
      {
        printed: "術-9",
        number: "te0009",
        name: "千年殺し",
        setCode: "maki1",
        volume: "巻ノ壱",
      },
      {
        printed: "作-1",
        number: "ta0001",
        name: "任務開始",
        setCode: "maki4",
        volume: "巻の四",
      },
    ]);
    expect(carddasJpVolumeSetCode("巻ノ十七")).toBe("maki17");
  });
});

describe("carddasJpCardlistCards", () => {
  it("ships the official 巻ノ壱…十七 titles, not Data Carddass", () => {
    const cards = carddasJpCardlistCards();
    expect(cards.length).toBe(998);
    expect(cards[0]).toMatchObject({
      printed: "忍-1",
      number: "ni0001",
      name: "うずまきナルト",
      setCode: "maki1",
    });
    expect(cards.some((row) => row.number.startsWith("nm"))).toBe(false);
  });
});

describe("mergeCarddasJpNamesIntoIndex", () => {
  it("adds a JA title on an existing NI print and mints later volumes", () => {
    const merged = mergeCarddasJpNamesIntoIndex({
      prints: [
        {
          printKey: "naruto:ni-0001",
          setCode: "s1",
          number: "ni0001",
          cardType: "ni",
          family: "ninja",
        },
      ],
      titles: [
        { printKey: "naruto:ni-0001", lang: "fr", fullName: "Naruto Uzumaki" },
      ],
    });
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:ni-0001" && t.lang === "ja",
      )?.fullName,
    ).toBe("うずまきナルト");
    expect(
      merged.prints.find((p) => p.printKey === "naruto:ni-0001")?.setCode,
    ).toBe("s1");
    expect(merged.addedPrints.length).toBeGreaterThan(900);
  });
});
