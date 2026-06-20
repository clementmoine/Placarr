import fs from "fs";
import path from "path";
import axios from "axios";

const envPath = path.join(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = Object.fromEntries(
  envContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split("=");
      return [parts[0].trim(), parts.slice(1).join("=").trim()];
    }),
);

const DISCOGS_BASE = "https://api.discogs.com";
const USER_AGENT = "Placarr/0.1.0 +http://localhost:3000";

async function main() {
  const key = envVars["DISCOGS_CONSUMER_KEY"];
  const secret = envVars["DISCOGS_CONSUMER_SECRET"];

  if (!key || !secret) {
    console.error("Missing keys!");
    return;
  }

  const auth = { key, secret };
  const barcode = "4988601467124";

  console.log("=== Querying Discogs Search ===");
  const searchRes = await axios.get(`${DISCOGS_BASE}/database/search`, {
    params: { barcode, per_page: 1, ...auth },
    headers: { "User-Agent": USER_AGENT },
  });

  const best = searchRes.data?.results?.[0];
  console.log("Search Hit:", JSON.stringify(best, null, 2));

  if (best?.id) {
    console.log("\n=== Querying Discogs Release Detail ===");
    const releaseRes = await axios.get(`${DISCOGS_BASE}/releases/${best.id}`, {
      params: auth,
      headers: { "User-Agent": USER_AGENT },
    });
    console.log(
      "Release Images:",
      JSON.stringify(releaseRes.data?.images, null, 2),
    );
  }
}

main().catch(console.error);
