/**
 * Fusion World card detail — everything the listing page does not say.
 *
 * The cardlist we already walk gives a number, a name and an image. The detail
 * page behind `detail.php?card_no=ST01-001` gives the rest, and the catalogue
 * holds none of it: **3 962 cartes FW, zéro rareté** aujourd'hui.
 *
 *   ST01-001 | L | Son Goten | LEADER | Red | Cost - | Power 15000 / 20000
 *            | Special Traits Saiyan/Earthling | Skills […]
 *
 * A leader card has two faces, so power and skills come in pairs — front then
 * back. They are kept as lists rather than flattened: a leader's back is a
 * different game state, not a duplicate.
 */
export type DbsFwCardDetail = {
  cardNumber: string;
  /** `L`, `C`, `UC`, `R`, `SR`… as printed on the page. */
  rarity: string | null;
  name: string | null;
  cardType: string | null;
  color: string | null;
  cost: string | null;
  specifiedCost: string | null;
  /** Front then back for a leader; one entry otherwise. */
  power: string[];
  comboPower: string | null;
  specialTraits: string[];
  skills: string[];
};

/** Tags out, entities decoded, one flat string per text node. */
function textNodes(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .split(/<[^>]+>/)
    .map((chunk) =>
      chunk
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

const LABELS = new Set([
  "Card type",
  "Color",
  "Cost",
  "Specified cost",
  "Power",
  "Combo power",
  "Special Traits",
  "Skills",
  "FRONT",
  "BACK",
  "Show the BACK",
  "Show the FRONT",
  // Everything past here is shop and Q&A, not the card.
  "Where to get it",
  "Products",
  "CARDS",
  "DETAILS",
  "Q&A",
]);

/**
 * `ST01-001`, `FB01-045_p1`, and the marker cards numbered plainly: `E-01`.
 * The node must be the number and nothing else — the page title starts with it.
 */
const CARD_NO_RE = /^[A-Z]{1,4}(?:\d{2})?-\d{2,3}[A-Za-z0-9_]*$/;

/** Values following a label, until the next label. */
function valuesAfter(nodes: readonly string[], label: string): string[] {
  const at = nodes.indexOf(label);
  if (at < 0) return [];
  const out: string[] = [];
  for (let i = at + 1; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    if (LABELS.has(node)) break;
    out.push(node);
  }
  return out;
}

function first(values: readonly string[]): string | null {
  const value = values[0]?.trim();
  return value && value !== "-" ? value : null;
}

export function parseDbsFwCardDetail(html: string): DbsFwCardDetail | null {
  const nodes = textNodes(html);
  // The <title> starts with the number too — anchor on the node that *is* it.
  const cardNumber = nodes.find((n) => CARD_NO_RE.test(n));
  if (!cardNumber) return null;

  const at = nodes.indexOf(cardNumber);
  // `ST01-001 | L | FRONT | Son Goten` — rarity sits right after the number.
  const rarityCandidate = nodes[at + 1];
  // Markers (`E-01`) print no rarity at all: the next node is already the name.
  const rarity =
    rarityCandidate && /^[A-Z]{1,3}$/.test(rarityCandidate)
      ? rarityCandidate
      : null;
  const name = nodes.slice(at + 1).find((n) => !LABELS.has(n) && n !== rarity);

  const traits = valuesAfter(nodes, "Special Traits");
  return {
    cardNumber,
    rarity,
    name: name ?? null,
    cardType: first(valuesAfter(nodes, "Card type")),
    color: first(valuesAfter(nodes, "Color")),
    cost: first(valuesAfter(nodes, "Cost")),
    specifiedCost: first(valuesAfter(nodes, "Specified cost")),
    power: valuesAfter(nodes, "Power").filter((v) => v !== "-"),
    comboPower: first(valuesAfter(nodes, "Combo power")),
    // The page repeats the trait line once per face — keep it once, and a
    // lone `-` means *no trait*, not a trait named `-` (les cartes marqueur).
    specialTraits: [...new Set(traits)].filter((v) => v !== "-"),
    skills: valuesAfter(nodes, "Skills"),
  };
}

export function dbsFwCardDetailUrl(cardNumber: string, locale = "en"): string {
  return `https://www.dbs-cardgame.com/fw/${locale}/cardlist/detail.php?card_no=${encodeURIComponent(cardNumber)}`;
}
