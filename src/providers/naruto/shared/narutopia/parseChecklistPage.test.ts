import { describe, expect, it } from "vitest";

import {
  parseNarutopiaChecklistHtml,
  splitNarutopiaHeading,
} from "./parseChecklistPage";

describe("splitNarutopiaHeading", () => {
  it("splits Kayou CODE-NAME", () => {
    expect(splitNarutopiaHeading("NR-001-NARUTO")).toEqual({
      code: "NR-001",
      name: "NARUTO",
    });
    expect(splitNarutopiaHeading("SSR-102-SASUKE")).toEqual({
      code: "SSR-102",
      name: "SASUKE",
    });
  });

  it("keeps Mythos rarity / parallel labels", () => {
    expect(splitNarutopiaHeading("C-001")).toEqual({
      code: "C-001",
      name: null,
    });
    expect(splitNarutopiaHeading("R-104 A")).toEqual({
      code: "R-104 A",
      name: null,
    });
    expect(splitNarutopiaHeading("Mythos - 113 V")).toEqual({
      code: "Mythos 113 V",
      name: null,
    });
    expect(splitNarutopiaHeading("Mission 006")).toEqual({
      code: "Mission 006",
      name: null,
    });
  });
});

describe("parseNarutopiaChecklistHtml", () => {
  it("pairs heading with preceding full-size face", () => {
    const html = `
      <div>
        <img data-src="https://narutopia.fr/wp-content/uploads/2023/05/NR-001-213x300.webp"
          data-srcset="https://narutopia.fr/wp-content/uploads/2023/05/NR-001-213x300.webp 213w, https://narutopia.fr/wp-content/uploads/2023/05/NR-001.webp 320w" />
        <div id="NR-001-NARUTO" data-widget_type="html.default"></div>
        <h3 class="elementor-heading-title elementor-size-small">NR-001-NARUTO</h3>
      </div>`;
    const rows = parseNarutopiaChecklistHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "NR-001",
      name: "NARUTO",
      faceUrl: "https://narutopia.fr/wp-content/uploads/2023/05/NR-001.webp",
      widgetId: "NR-001-NARUTO",
    });
  });
});
