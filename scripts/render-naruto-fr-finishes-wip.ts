/**
 * Régénère fr-finishes-wip.md avec titres + vignettes.
 * Usage: pnpm exec tsx scripts/render-naruto-fr-finishes-wip.ts
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import s3Finishes from "@/providers/naruto/narutocarddass/curated/sources/s3-fr-physical-finishes.json";
import { packCardsDir } from "@/lib/packPaths";
import { listNarutoSetPrints } from "@/providers/naruto/narutocarddass/search";

const OUT = path.join(
  process.cwd(),
  "src/providers/naruto/narutocarddass/curated/sources/fr-finishes-wip.md",
);
/** Relatif depuis curated/sources/ → data/… */
const ART_REL = "../../../../../../data/naruto/carddass/cards";

function padId(id: string): string {
  const m = /^([a-z]+)(\d+)$/i.exec(id.trim());
  if (!m) return id.toLowerCase();
  return m[1]!.toLowerCase() + String(Number(m[2])).padStart(4, "0");
}

function displayId(id: string): string {
  const m = /^([a-z]+)(\d+)$/i.exec(id.trim());
  if (!m) return id.toUpperCase();
  const p = m[1]!.toUpperCase();
  return `${p}-${Number(m[2])}`;
}

function findArtRel(set: string, diskId: string): string | null {
  const dir = path.join(packCardsDir("naruto/carddass"), "fr", set, diskId);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir);
  const pref = [
    "art.carddass.jpg",
    "art.carddass.webp",
    "art.coleka.webp",
    "art.corrected.png",
    "art.reconstructed.png",
    "art.reconstructed.webp",
  ];
  for (const f of pref) {
    if (files.includes(f)) return `${ART_REL}/fr/${set}/${diskId}/${f}`;
  }
  const art = files.find((f) => f.startsWith("art."));
  return art ? `${ART_REL}/fr/${set}/${diskId}/${art}` : null;
}

function shortFromPrintKey(pk: string): string {
  const m = /(?:s\d+-)?([a-z]+\d+)/i.exec(pk.split(":").pop() || "");
  return (m?.[1] || "").toLowerCase();
}

function titleMap(set: string): Map<string, string> {
  const rows = listNarutoSetPrints({
    setId: set,
    language: "fr",
    includeUnprinted: false,
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(shortFromPrintKey(r.printKey), r.title?.trim() || "?");
  }
  return map;
}

function cardRow(
  set: string,
  id: string,
  titles: Map<string, string>,
  note?: string,
): string {
  const disk = padId(id);
  const title = titles.get(disk) ?? titles.get(id.toLowerCase()) ?? "?";
  const art = findArtRel(set, disk);
  const img = art
    ? `<img src="${art}" alt="${displayId(id)}" width="72" />`
    : "—";
  const notes = note ?? "";
  return `| ${img} | ${displayId(id)} | ${title.replace(/\|/g, "\\|")} | ${notes} |`;
}

function table(
  set: string,
  ids: string[],
  titles: Map<string, string>,
  notes?: Record<string, string>,
): string {
  const lines = [
    "| | Id | Nom | Notes |",
    "|:---:|:---|:---|:---|",
    ...ids.map((id) => cardRow(set, id, titles, notes?.[padId(id)])),
  ];
  return lines.join("\n");
}

function idList(ids: string[]): string {
  return ids.map(displayId).join(", ");
}

const s2 = [
  "ni061",
  "ni064",
  "ni068",
  "ni082",
  "ni083",
  "ni084",
  "ni094",
  "ni100",
  "ni109",
  "te062",
  "te073",
  "te076",
  "te085",
  "te087",
  "te091",
  "te092",
  "te100",
  "ta067",
  "ta069",
  "ta070",
  "ta073",
  "ta080",
];
const s2NotFoil = [
  "ni062",
  "ni065",
  "ni069",
  "ni095",
  "ni103",
  "ta068",
  "ta071",
  "ta074",
  "ta081",
  "te074",
  "te086",
  "te088",
  "te093",
  "te101",
];
const s3 = [...s3Finishes.holoOnly];
const s4 = [
  "ni145",
  "ni163",
  "ni164",
  "ni166",
  "ni167",
  "ni168",
  "ni172",
  "ni176",
  "ni177",
  "ni192",
  "ni201",
  "ni202",
  "ni203",
  "ni204",
  "ta157",
  "ta158",
  "ta178",
  "ta182",
  "ta190",
  "te149",
  "te151",
  "te153",
  "te159",
  "te175",
  "te177",
];
const s5 = [
  "ni216",
  "ni217",
  "ni218",
  "ni219",
  "ni220",
  "ni221",
  "ni222",
  "ni223",
  "ni229",
  "ni247",
  "ni250",
  "ni251",
  "ni254",
  "ni313",
  "te202",
  "te223",
  "te225",
  "te230",
  "ta193",
  "ta200",
  "ta204",
  "ta222",
  "ta229",
  "ta233",
];
const s5NotFoil = [
  "ni252",
  "ta194",
  "ta205",
  "ta223",
  "ta225",
  "ta230",
  "ta234",
  "te196",
  "te203",
  "te216",
  "te224",
  "te226",
  "te231",
];

const s2notes: Record<string, string> = {
  ni0064: "dig premium",
  ni0068: "dig premium",
  te0073: "dig premium",
};
const s4notes: Record<string, string> = {
  ni0145: "deck starter",
  ni0167: "dig premium",
  ni0168: "dig premium",
  ni0172: "dig premium",
  ni0176: "deck starter",
  ni0177: "deck starter",
  ni0203: "dig premium",
  ni0204: "deck starter",
};
const s5notes: Record<string, string> = {
  ni0218: "deck starter",
  ni0219: "deck starter",
  ni0221: "dig premium",
  ni0223: "confirmé foil 2026-10-19",
  ni0229: "deck starter",
  ni0247: "dig premium",
  ni0254: "dig premium",
  ni0313: "deck starter",
};

/** Foils tagués `holo` sur l’étagère Placarr (vérifiés en base). */
const s24ShelfHolo = [
  "n1367",
  "n1368",
  "n1379",
  "n1392",
  "n1404",
  "n1418",
  "n1419",
  "j0899",
  "j0902",
  "j0920",
  "m0863",
  "m0864",
  "m0866",
  "m0871",
  "m0881",
];
/** Photos physiques (pas sur l’étagère) — confirmés 2026-10-19. */
const s24PhotoFoil = [
  // lot SR
  "j0898",
  "j0907",
  "j0919",
  "n1383",
  "n1405",
  "n1421",
  "n1422",
  // lot Rare / wishlist + extras
  "j0895",
  "j0904",
  "j0906",
  "j0914",
  "m0857",
  "m0859",
  "m0865",
  "m0872",
  "m0877",
  "m0878",
  "n1363",
  "n1369",
  "n1376",
  "n1381",
  "n1382",
  "n1393",
  "n1394",
  "n1395",
  "n1396",
  "n1408",
  "n1409",
  "n1420",
  // EN Rare restants — confirmés foil 2026-10-19
  "m0855",
  "m0861",
  "m0873",
  "m0874",
  "n1370",
];
const s24 = [...s24ShelfHolo, ...s24PhotoFoil];
const s24Notes: Record<string, string> = {
  ...Object.fromEntries(
    s24ShelfHolo.map((id) => [padId(id), "étagère `holo`"]),
  ),
  ...Object.fromEntries(
    s24PhotoFoil.map((id) => [padId(id), "photo 2026-10-19 (pas sur étagère)"]),
  ),
  j0906: "photo 2026-10-19 — hors wishlist FR initiale",
  n1395: "photo 2026-10-19 — hors wishlist FR initiale (EN SR)",
};

const s28 = [
  "n1630",
  "n1634",
  "n1635",
  "n1636",
  "n1638",
  "n1643",
  "n1645",
  "n1646",
  "n1647",
  "n1648",
  "n1652",
  "n1653",
  "n1655",
  "n1657",
  "n1658",
  "n1660",
  "n1667",
  "n1668",
  "n1669",
  "n1670",
  "n1677",
  "n1678",
  "n1679",
  "n1680",
  "n1681",
  "n1683",
  "n1685",
  "j1006",
  "j1007",
  "j1008",
  "j1009",
  "j1011",
  "j1013",
  "j1014",
  "j1021",
  "j1026",
  "j1027",
  "j1031",
  "m0978",
  "m0979",
  "m0980",
  "m0982",
  "m0985",
  "m0986",
  "m0990",
  "m0992",
  "m0994",
  "m0995",
  "m0998",
];

const s28Notes: Record<string, string> = {
  j1031: "confirmé foil 2026-10-19 (était sans tag étagère)",
  n1647: "confirmé foil 2026-10-19 (était sans tag étagère)",
  n1658: "confirmé foil 2026-10-19 (était sans tag étagère)",
};

const t2 = titleMap("s2");
const t3 = titleMap("s3");
const t4 = titleMap("s4");
const t5 = titleMap("s5");
const t11 = titleMap("s11");
const t24 = titleMap("s24");
const t28 = titleMap("s28");

const md = `# FR Carddass — finitions physiques (WIP)

Ledgers physiques mintés dans \`*-fr-physical-finishes.json\` +
\`attestedNarutoCarddassFinishes\` (S1 Bandai détailée ; S2–S6 / S11 / S24 /
S28 physiques).

Règle produit : **soit foil, soit normale** — pas de dual inventé. Exception
connue : **NI-127 Jiraya** (normale + foil).

Sources : decks (\`guaranteedPrints\` finish \`holo\`), étagère Placarr, dig
Collection Naruto (7r7), listes carddass.fr (souvent off-by-one — étagère /
user prioritaire).

Vignettes = faces locales \`data/naruto/carddass/cards/fr/…\` (aperçu Markdown
Cursor). Si une image ne s’affiche pas, ouvrir le chemin relatif depuis ce
fichier.

---

## Déjà livré

### S3 — \`s3-fr-physical-finishes.json\` — ${s3.length} holo-only + NI-127 dual

**Dual** : NI-127 Jiraya

${table("s3", s3, t3)}

Reste checklist / reprints starter → Normale.

### Promos

Toutes foil-only (\`holo\`) — plus de Normale inventée.

### S1 manga prerelease (alts non-holo de holos)

Retail foil-only (33 holos Bandai) ; ouverte = \`*-prerelease\` (\`normal\` +
\`sealed\` pour les 4 alts : ni019 / ta005 / te007 / te036). TA-005 titres :
retail « Démon Renard… » vs prerelease « Kyubi ».

---

## Minté 2026-10-19

### S2 — \`s2-fr-physical-finishes.json\` — ${s2.length} holo-only (pas de dual)

${table("s2", s2, t2, s2notes)}

**Confirmé non-foil** (site liste = holo, physique = Normale) :

${table("s2", s2NotFoil, t2)}

### S4 — \`s4-fr-physical-finishes.json\` — ${s4.length} holo-only + NI-127 dual

**Dual** : NI-127 Jiraya (normale et foil) — aussi dual S3.

${table("s4", s4, t4, s4notes)}

Cohérence : dig binder « 25 holos » = ces ${s4.length} ; NI-127 en plus en dual.

### S5 — \`s5-fr-physical-finishes.json\` — ${s5.length} holo-only (pas de dual)

${table("s5", s5, t5, s5notes)}

**Confirmé non-foil** (site liste = holo, physique = Normale) :

${table("s5", s5NotFoil, t5)}

Dig « ~35 holos » mélangeait classeur S5 + inserts S6 DVD — ignoré (S6 = 0 foil).

### S6 — \`s6-fr-physical-finishes.json\` — aucun foil

Tous Normale (inserts Kana / DVD / reprints MIJ du chapitre FR).

### S11 — \`s11-fr-physical-finishes.json\` — 1 holo-only

${table("s11", ["n0406"], t11, { n0406: "Naruto Uzumaki & Clone (étagère)" })}

Reste Tempête / Rampage Tornado → Normale.

### S24 — \`s24-fr-physical-finishes.json\` — ${s24.length} holo-only (${s24ShelfHolo.length} étagère + ${s24PhotoFoil.length} photo)

Alignement EN Sage's Legacy : les ${s24.length} foils FR = **tous** les EN
Super Rare (12) + Rare (37). Aucun Common/Uncommon foil FR. Différence vs EN :
pas de parallel foil C/U, et une seule finition par carte (foil-only pour
SR+Rare, Normale pour le reste) — EN vend Regular+Foil pour beaucoup de Rare.

**Étagère** (\`variant=holo\` en base) :

${table("s24", s24ShelfHolo, t24, s24Notes)}

**Photos** (pas sur l’étagère — confirmés 2026-10-19) :

${table("s24", s24PhotoFoil, t24, s24Notes)}

**Confirmé non-foil** (tag étagère \`holo\` erroné — corrigé en Normale) :

${table("s24", ["j0913"], t24)}

### S28 — \`s28-fr-physical-finishes.json\` — ${s28.length} holo-only (collection + net)

${table("s28", s28, t28, s28Notes)}

---

## Notes

- Master set : blank → plain / sole finish déjà branché
  (\`resolveMasterSetOwned\` + \`finishesOwnedByBlankVariant\`).
- Régénérer ce fichier (titres + vignettes) :
  \`pnpm exec tsx scripts/render-naruto-fr-finishes-wip.ts\`
`;

writeFileSync(OUT, md, "utf8");
console.log("wrote", OUT);
