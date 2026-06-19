const axios = require("axios");

const devId = "clementmoine";
const devPass = "3gkU4YbqQPE";
const ssUser = "clementmoine";
const ssPass = "syvsEzbebtek5qosso";

const baseParams = {
  devid: devId,
  devpassword: devPass,
  softname: "Placarr",
  output: "json",
  ...(ssUser && ssPass ? { ssid: ssUser, sspassword: ssPass } : {}),
};

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

async function runEmulatedSearch(name, systemeid) {
  console.log(
    `\n--- Emulating search for "${name}" (systemeid: ${systemeid}) ---`,
  );
  const cleanedName = name; // simplified for test

  // 1. Search by name
  let searchRes;
  try {
    searchRes = await axios.get(
      "https://api.screenscraper.fr/api2/jeuRecherche.php",
      {
        params: {
          ...baseParams,
          recherche: cleanedName,
          systemeid: String(systemeid),
        },
        timeout: 8000,
      },
    );
  } catch (err) {
    console.error("Name search request failed:", err.message);
    return;
  }

  let results = searchRes.data?.response?.jeux;
  if (results && !Array.isArray(results)) {
    results = [results];
  }
  let validResults = (results || []).filter((r) => r && r.id);
  console.log(`Initial search returned ${validResults.length} valid results.`);

  // 2. Fallback if empty
  if (!validResults || validResults.length === 0) {
    const firstWord = cleanedName.split(/\s+/)[0];
    console.log(
      `Initial search returned no results. Trying first word fallback search: "${firstWord}"`,
    );
    if (firstWord && firstWord.length >= 3) {
      try {
        const fallbackRes = await axios.get(
          "https://api.screenscraper.fr/api2/jeuRecherche.php",
          {
            params: {
              ...baseParams,
              recherche: firstWord,
              systemeid: String(systemeid),
            },
            timeout: 8000,
          },
        );
        let fallbackResults = fallbackRes.data?.response?.jeux;
        if (fallbackResults) {
          if (!Array.isArray(fallbackResults)) {
            fallbackResults = [fallbackResults];
          }
          validResults = (fallbackResults || []).filter((r) => r && r.id);
        }
        console.log(
          `Fallback search returned ${validResults.length} valid results.`,
        );
      } catch (err) {
        console.error("Fallback search request failed:", err.message);
      }
    }
  }

  if (!validResults || validResults.length === 0) {
    console.log("No results found at all.");
    return;
  }

  // 3. Levenshtein picking
  let bestId = validResults[0].id;
  let minDist = Infinity;
  for (const r of validResults) {
    const rTitle = pickSSTitle(r.noms)?.toLowerCase() || "";
    const dist = Levenshtein.get(cleanedName.toLowerCase(), rTitle);
    console.log(`- Candidate ID: ${r.id}, Title: "${rTitle}", Dist: ${dist}`);
    if (dist < minDist) {
      minDist = dist;
      bestId = r.id;
    }
  }
  console.log(`Selected Best ID: ${bestId} (minDist: ${minDist})`);

  // 4. Fetch full game info
  try {
    const infoRes = await axios.get(
      "https://api.screenscraper.fr/api2/jeuInfos.php",
      {
        params: {
          ...baseParams,
          crc: "",
          md5: "",
          sha1: "",
          systemeid: "0",
          romtype: "rom",
          romnom: "",
          romtaille: "",
          gameid: String(bestId),
        },
        timeout: 8000,
      },
    );
    const jeu = infoRes.data?.response?.jeu;
    if (jeu && jeu.id) {
      console.log(`Successfully fetched full info for ID: ${jeu.id}`);
      const title = pickSSTitle(jeu.noms);
      const mediaCount = jeu.medias ? jeu.medias.length : 0;
      console.log(`Title: "${title}", Medias count: ${mediaCount}`);
    } else {
      console.log("Failed to fetch full game info from jeuInfos.php.");
    }
  } catch (err) {
    console.error("Full game info request failed:", err.message);
  }
}

async function test() {
  await runEmulatedSearch("Amped Freestyle Snowboarding", 32);
}

test().catch(console.error);
