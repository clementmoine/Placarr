/**
 * One attested JP promo scan: PR忍-1-R from narutozabuza.centerblog.net.
 * Do not crawl the rest of the blog.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import zabuza from "./curated/sources/narutozabuza.json";
import { narutoDiskCardId } from "./collectorIdentity";
import { NARUTO_PACK_ID } from "./packs";
import { narutoCardAbsDir } from "./narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MIN_BYTES = 3_000;
const LANG = "ja";

export type ScrapeNarutoZabuzaOptions = {
  force?: boolean;
  root?: string;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

async function downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/jpeg,image/*,*/*;q=0.8",
        Referer: zabuza.url,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export async function scrapeNarutoZabuzaPromo(
  opts: ScrapeNarutoZabuzaOptions = {},
): Promise<{ downloaded: number; skipped: number; failed: number }> {
  const diskId = narutoDiskCardId(zabuza.print.printedRef);
  if (!diskId) {
    console.warn("── JA zabuza : PR忍-1-R ne parse pas");
    return { downloaded: 0, skipped: 0, failed: 1 };
  }
  const cardsDir = path.join(packRoot(opts.root), "cards");
  const cardDir =
    narutoCardAbsDir(cardsDir, diskId, LANG) ??
    path.join(cardsDir, "promo", diskId, LANG);
  if (!opts.force && existingNarutoArtForSource(cardDir, "zabuza")) {
    console.log(`── JA zabuza ${diskId} déjà là (zabuza)`);
    return { downloaded: 0, skipped: 1, failed: 0 };
  }
  console.log(`── JA zabuza PR忍-1-R → ${diskId}/ja/art.zabuza.*`);
  const buf = await downloadBytes(zabuza.image.url);
  if (!buf) {
    console.log(`JA zabuza ${diskId} FAIL`);
    return { downloaded: 0, skipped: 0, failed: 1 };
  }
  const saved = await saveNarutoFace({
    cardDir,
    buf,
    source: "zabuza",
    lang: LANG,
    force: opts.force,
  });
  return saved === "skip"
    ? { downloaded: 0, skipped: 1, failed: 0 }
    : { downloaded: 1, skipped: 0, failed: 0 };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeNarutoZabuzaPromo().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
