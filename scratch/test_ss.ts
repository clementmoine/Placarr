import axios from "axios";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

async function testBarcode(barcode: string) {
  console.log(`Testing PicClick for barcode ${barcode}...`);
  try {
    const url = `https://picclick.fr/?q=${barcode}`;
    const res = await axios.get(url, { headers, timeout: 5000 });
    const html = res.data;
    
    const regex = /<li id="item-\d+">[\s\S]*?<img src="([^"]+)"[^>]*title="([^"]+)"/gi;
    let match;
    let count = 0;
    while ((match = regex.exec(html)) !== null && count < 5) {
      console.log(`- Title: ${match[2]}`);
      console.log(`  Cover: ${match[1]}`);
      count++;
    }
  } catch (err: any) {
    console.error(`Error:`, err.message);
  }
}

async function main() {
  await testBarcode("3459370474527");
  await testBarcode("3459370440300");
}

main().catch(console.error);
