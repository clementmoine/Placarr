import axios from "axios";

async function main() {
  const barcode = "3459370474527";
  const searchUrl = `https://www.chasse-aux-livres.fr/search?query=${barcode}`;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://www.chasse-aux-livres.fr/",
  };

  const initialRes = await axios.get(searchUrl, { headers });
  console.log("Response URL:", initialRes.request.res.responseUrl);
  console.log("Response Status:", initialRes.status);
}

main().catch(console.error);
