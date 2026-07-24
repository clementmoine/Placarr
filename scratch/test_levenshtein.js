const Levenshtein = require("fast-levenshtein");

function pickSSTitle(noms) {
  if (!noms || noms.length === 0) return undefined;
  const regionOrder = ["eu", "wor", "us"];
  for (const region of regionOrder) {
    const found = noms.find((n) => n.region === region);
    if (found) return found.text;
  }
  return noms[0].text;
}

const cleanedName = "Amped Freestyle Snowboarding";
const validResults = [
  {
    id: 14877,
    noms: [
      { region: "ss", text: "Amped 2" },
      { region: "us", text: "Amped 2" },
      { region: "jp", text: "Tenku 2" },
      { region: "eu", text: "Amped 2" },
    ],
  },
  {
    id: 14941,
    noms: [
      { region: "ss", text: "Amped - Freestyle Snowboarding" },
      { region: "us", text: "Amped : Freestyle Snowboarding" },
      { region: "jp", text: "Tenku : Freestyle Snowboarding" },
      { region: "eu", text: "Amped : Freestyle Snowboarding" },
    ],
  },
];

let bestId = validResults[0].id;
let minDist = Infinity;
for (const r of validResults) {
  const rTitle = pickSSTitle(r.noms)?.toLowerCase() || "";
  const dist = Levenshtein.get(cleanedName.toLowerCase(), rTitle);
  console.log(
    `Comparing "${cleanedName.toLowerCase()}" with "${rTitle}": dist = ${dist}`,
  );
  if (dist < minDist) {
    minDist = dist;
    bestId = r.id;
  }
}
console.log("Best ID:", bestId);
