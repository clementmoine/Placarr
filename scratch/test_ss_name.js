const axios = require("axios");

const baseParams = {
  devid: "clementmoine",
  devpassword: "3gkU4YbqQPE",
  softname: "Placarr",
  output: "json",
  ssid: "clementmoine",
  sspassword: "syvsEzbebtek5qosso",
};

async function testName(name, systemeid) {
  const url = "https://api.screenscraper.fr/api2/jeuRecherche.php";
  console.log(`Searching name "${name}" at ${url}...`);
  try {
    const res = await axios.get(url, {
      params: {
        ...baseParams,
        recherche: name,
        systemeid: String(systemeid),
      },
      timeout: 8000,
    });
    console.log("Response Status:", res.status);
    const jeux = res.data?.response?.jeux;
    if (!jeux) {
      console.log("No jeux field in response");
      return;
    }
    const jeuxList = Array.isArray(jeux) ? jeux : [jeux];
    console.log(`Found ${jeuxList.length} games:`);
    for (const j of jeuxList) {
      if (j && j.id) {
        console.log(`- ID: ${j.id}, Noms: ${JSON.stringify(j.noms)}`);
      } else {
        console.log(`- Empty/invalid entry: ${JSON.stringify(j)}`);
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

async function main() {
  await testName("Amped Freestyle Snowboarding", undefined);
}

main();
