const axios = require("axios");

const baseParams = {
  devid: "clementmoine",
  devpassword: "3gkU4YbqQPE",
  softname: "Placarr",
  output: "json",
  ssid: "clementmoine",
  sspassword: "syvsEzbebtek5qosso",
};

async function testBarcode(barcode, systemeid) {
  const url = "https://api.screenscraper.fr/api2/jeuInfos.php";
  console.log(`Querying ScreenScraper at ${url}...`);
  try {
    const res = await axios.get(url, {
      params: {
        ...baseParams,
        crc: "",
        md5: "",
        sha1: "",
        systemeid: String(systemeid),
        romtype: "rom",
        romnom: barcode,
        romtaille: "",
      },
      timeout: 8000,
    });
    console.log("Response Status:", res.status);
    console.log("Response Data:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
    if (err.response) {
      console.error("Response data error:", JSON.stringify(err.response.data, null, 2));
    }
  }
}

testBarcode("0659556980511", 32);
