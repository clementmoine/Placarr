import http from "node:http";
import https from "node:https";
import fs from "node:fs";

async function getFlareSession(): Promise<{ cookies: string; ua: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      cmd: "request.get",
      url: "https://www.suruga-ya.jp/product/detail/G8903747",
      maxTimeout: 40000,
    });
    const req = http.request(
      "http://127.0.0.1:8191/v1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.status === "ok") {
              const cookies = parsed.solution.cookies
                .map((c: any) => `${c.name}=${c.value}`)
                .join("; ");
              resolve({ cookies, ua: parsed.solution.userAgent });
            } else {
              reject(new Error(parsed.message));
            }
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

type ScanResult = {
  id: string;
  status: number;
  h1: string;
  title: string;
  isNaruto: boolean;
  ref: string | null;
  franchise: string;
};

async function fetchOne(
  id: string,
  session: { cookies: string; ua: string },
): Promise<ScanResult> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "www.suruga-ya.jp",
        path: `/product/detail/${id}`,
        method: "GET",
        headers: {
          "User-Agent": session.ua,
          "Cookie": session.cookies,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          Referer: "https://www.suruga-ya.jp/",
        },
        timeout: 15000,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          const h1Match = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const h1 = h1Match
            ? h1Match[1].replace(/<[^>]+>/g, "").trim()
            : "";
          const title = titleMatch ? titleMatch[1].trim() : "";
          const fullText = `${h1} ${title}`;
          const isNaruto =
            /NARUTO|ナルト/i.test(fullText) ||
            /データカードダス.*(DN|NM|DT)/i.test(fullText);

          // Extract printed ref
          const refMatch = fullText.match(
            /\b(DN-[0-9]+[A-Z]*|NM-[0-9]+|DNP-[0-9]+|DMP-[0-9]+|DT-[0-9]+|忍-[0-9]+|術-[0-9]+|作-[0-9]+|依-[0-9]+)\b/,
          );
          const ref = refMatch ? refMatch[1] : null;

          let franchise = "unknown";
          if (isNaruto) franchise = "NARUTO";
          else if (/ガッシュ/i.test(fullText)) franchise = "Gash Bell";
          else if (/ドラゴンボール|DRAGON BALL/i.test(fullText))
            franchise = "Dragon Ball";
          else if (/ワンピース|ONE PIECE/i.test(fullText)) franchise = "One Piece";
          else if (/BLEACH/i.test(fullText)) franchise = "Bleach";
          else if (res.statusCode === 302 || res.statusCode === 404)
            franchise = "empty";
          else if (h1) franchise = h1.slice(0, 30);

          resolve({
            id,
            status: res.statusCode || 0,
            h1,
            title,
            isNaruto,
            ref,
            franchise,
          });
        });
      },
    );
    req.on("error", (e) =>
      resolve({
        id,
        status: 0,
        h1: "",
        title: "",
        isNaruto: false,
        ref: null,
        franchise: `error: ${e.message}`,
      }),
    );
    req.end();
  });
}

async function main() {
  console.log("Obtaining session from FlareSolverr...");
  const session = await getFlareSession();
  console.log("Session obtained! Scanning G8903745 to G8904010 (~265 IDs)...");

  const start = 8903745;
  const end = 8904010;
  const allIds: string[] = [];
  for (let i = start; i <= end; i++) {
    allIds.push(`G${i}`);
  }

  const results: ScanResult[] = [];
  const concurrency = 6;
  for (let i = 0; i < allIds.length; i += concurrency) {
    const chunk = allIds.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((id) => fetchOne(id, session)),
    );
    results.push(...chunkResults);
    for (const r of chunkResults) {
      if (!r.isNaruto) {
        console.log(
          `[NON-NARUTO] ${r.id}: status=${r.status} franchise=${r.franchise} | H1: ${r.h1.slice(0, 50)}`,
        );
      } else {
        process.stdout.write(`.`);
      }
    }
  }
  console.log("\nScan complete!");

  // Analysis
  const narutoItems = results.filter((r) => r.isNaruto);
  const nonNarutoItems = results.filter(
    (r) => !r.isNaruto && r.status === 200,
  );
  const emptyItems = results.filter((r) => r.status === 302 || r.status === 404);

  console.log("\n=== SUMMARY ===");
  console.log(`Total scanned: ${results.length}`);
  console.log(`Naruto cards: ${narutoItems.length}`);
  console.log(`Empty/Deleted IDs (302/404): ${emptyItems.length}`);
  console.log(`Non-Naruto cards (status 200): ${nonNarutoItems.length}`);

  if (nonNarutoItems.length > 0) {
    console.log("\nLIST OF NON-NARUTO CARDS:");
    for (const item of nonNarutoItems) {
      console.log(`- ${item.id}: [${item.franchise}] ${item.h1}`);
    }
  }

  // Save detailed scan to JSON
  fs.writeFileSync(
    "src/providers/narutodatacarddass/curated/sources/suruga-scan-g8903745-g8904010.json",
    JSON.stringify(results, null, 2),
    "utf8",
  );
  console.log("\nSaved full scan to src/providers/narutodatacarddass/curated/sources/suruga-scan-g8903745-g8904010.json");
}

main().catch(console.error);
