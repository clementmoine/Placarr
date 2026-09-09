import { describe, expect, it } from "vitest";

import { dbsFwCardDetailUrl, parseDbsFwCardDetail } from "./parseCardDetail";

/* Trimmed from the live pages of 2026-08-19 — the two card shapes. */
const LEADER = `
<html><head><title>ST01-001 | Dragon Ball Super Card Game Fusion World - Official Web Site</title></head>
<body><div class="cardDetail">
<p>ST01-001</p><p>L</p><p>FRONT</p><h1>Son Goten</h1>
<dt>Card type</dt><dd>LEADER</dd>
<dt>Color</dt><dd>Red</dd>
<dt>Cost</dt><dd>-</dd>
<dt>Specified cost</dt><dd>-</dd>
<dt>Power</dt><dd>15000</dd><dd>20000</dd>
<dt>Combo power</dt><dd>-</dd>
<dt>Special Traits</dt><dd>Saiyan/Earthling</dd><dd>Saiyan/Earthling</dd>
<dt>Skills</dt><dd>[Auto] Play up to 1 &lt;Fate Transcending Generations&gt;.</dd><dd>[When Attacking] Draw 1 card.</dd>
<h2>Where to get it</h2><p>STORY BOOSTER 01 [ST01]</p><h2>Q&amp;A</h2><p>Q601</p>
</div></body></html>`;

const BATTLE = `
<html><head><title>ST01-002 | …</title></head><body>
<p>ST01-002</p><p>C</p><p>FRONT</p><h1>Krillin</h1>
<dt>Card type</dt><dd>BATTLE</dd>
<dt>Color</dt><dd>Red</dd>
<dt>Cost</dt><dd>1</dd>
<dt>Specified cost</dt><dd>R</dd>
<dt>Power</dt><dd>5000</dd>
<dt>Combo power</dt><dd>10000</dd>
<dt>Special Traits</dt><dd>Earthling</dd>
<dt>Skills</dt><dd>[On Play] Add up to 1 red card from your Drop to your hand.</dd>
<h2>Where to get it</h2><p>STORY BOOSTER 01 [ST01]</p>
</body></html>`;

describe("parseDbsFwCardDetail", () => {
  it("reads a leader — two faces, two powers, two skill blocks", () => {
    const card = parseDbsFwCardDetail(LEADER);
    expect(card).toMatchObject({
      cardNumber: "ST01-001",
      rarity: "L",
      name: "Son Goten",
      cardType: "LEADER",
      color: "Red",
      cost: null,
      specifiedCost: null,
      comboPower: null,
    });
    expect(card?.power).toEqual(["15000", "20000"]);
    expect(card?.skills).toHaveLength(2);
    // The page repeats the trait line once per face.
    expect(card?.specialTraits).toEqual(["Saiyan/Earthling"]);
  });

  it("reads a battle card — cost, specified cost, combo power", () => {
    const card = parseDbsFwCardDetail(BATTLE);
    expect(card).toMatchObject({
      cardNumber: "ST01-002",
      rarity: "C",
      name: "Krillin",
      cardType: "BATTLE",
      cost: "1",
      specifiedCost: "R",
      comboPower: "10000",
    });
    expect(card?.power).toEqual(["5000"]);
  });

  it("anchors on the number itself, not on the <title> that starts with it", () => {
    // The title reads `ST01-001 | Dragon Ball Super…` — matching it loosely
    // stole the anchor and left rarity and name empty.
    expect(parseDbsFwCardDetail(LEADER)?.cardNumber).toBe("ST01-001");
    expect(parseDbsFwCardDetail(LEADER)?.name).toBe("Son Goten");
  });

  it("stops at the shop and Q&A sections", () => {
    const card = parseDbsFwCardDetail(LEADER);
    expect(card?.skills.join(" ")).not.toContain("Where to get it");
    expect(card?.skills.join(" ")).not.toContain("Q601");
  });

  it("decodes the angle brackets the game uses for card names", () => {
    expect(parseDbsFwCardDetail(LEADER)?.skills[0]).toContain(
      "<Fate Transcending Generations>",
    );
  });

  it("reads a marker card, which prints no rarity at all", () => {
    const MARKER = `<html><head><title>E-01 | …</title></head><body>
<p>E-01</p><h1>Energy Marker</h1>
<dt>Card type</dt><dd>ENERGY MARKER</dd><dt>Color</dt><dd>-</dd>
<dt>Skills</dt><dd>At the start of the game, the player who goes second places 1 Energy Marker.</dd>
</body></html>`;
    const card = parseDbsFwCardDetail(MARKER);
    // `E-01` has no set-and-number shape and no rarity — both used to break it.
    expect(card?.cardNumber).toBe("E-01");
    expect(card?.rarity).toBeNull();
    expect(card?.name).toBe("Energy Marker");
    expect(card?.cardType).toBe("ENERGY MARKER");
    // The page prints `-` where a trait would go: absence, not a trait.
    expect(card?.specialTraits).toEqual([]);
  });

  it("returns null rather than a shell when there is no card number", () => {
    expect(parseDbsFwCardDetail("<html><body>404</body></html>")).toBeNull();
  });
});

describe("dbsFwCardDetailUrl", () => {
  it("builds the locale-aware detail URL", () => {
    expect(dbsFwCardDetailUrl("ST01-001")).toBe(
      "https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=ST01-001",
    );
    expect(dbsFwCardDetailUrl("ST01-001", "jp")).toContain("/fw/jp/");
  });
});
