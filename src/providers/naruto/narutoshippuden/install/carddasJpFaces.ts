/**
 * Visuels officiels 疾風伝 幕 archivés sur carddass.com (`ju-062_d3.gif`…).
 *
 * Graine `curated/sources/carddas-jp-maku-faces.json` : un instantané Wayback
 * par face. Téléchargés dans `staging/carddas-jp-maku/`, installés en face
 * candidate `art.carddas.*` ; `print_assets` cite l'instantané. Le pack
 * Carddass ne les installe plus (familles shi/mju/msa = 疾風伝).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { waybackPublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import { httpGet } from "@/lib/http/httpClient";
import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { waybackRawUrl } from "@/providers/shared/wayback/waybackRawUrl";

import { narutoShippudenCuratedDir } from "../assets";
import { NARUTO_SHIPPUDEN_PACK_ID } from "../indexStore";
import { shippudenPrintKey } from "../pipeline/ledgers";

export type CarddasJpMakuFace = {
  number: string;
  timestamp: string;
  url: string;
};

export function loadCarddasJpMakuFaces(
  curatedRoot: string = narutoShippudenCuratedDir(),
): CarddasJpMakuFace[] {
  const file = path.join(curatedRoot, "sources", "carddas-jp-maku-faces.json");
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    faces?: CarddasJpMakuFace[];
  };
  return raw.faces ?? [];
}

function imageExt(buf: Buffer): string | null {
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return ".gif";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
  if (buf.subarray(1, 4).toString("ascii") === "PNG") return ".png";
  return null;
}

async function fetchWaybackImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    return Buffer.from(res.data as ArrayBuffer);
  } catch {
    return null;
  }
}

export type InstallCarddasJpMakuFacesOptions = {
  curatedRoot?: string;
  stagingDir?: string;
  cardDir?: (diskId: string) => string;
  offline?: boolean;
  force?: boolean;
  fetchImage?: (url: string) => Promise<Buffer | null>;
  writeAsset?: (row: {
    printKey: string;
    art: string;
    sourceUrl: string;
  }) => void;
};

export async function installCarddasJpMakuFaces(
  opts: InstallCarddasJpMakuFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const staging =
    opts.stagingDir ??
    path.join(packStagingDir(NARUTO_SHIPPUDEN_PACK_ID), "carddas-jp-maku");
  const cardDirOf =
    opts.cardDir ??
    ((diskId: string) =>
      packCardDir(NARUTO_SHIPPUDEN_PACK_ID, {
        lang: "ja",
        set: diskId.replace(/\d+$/, ""),
        card: diskId,
      }));
  const fetchImage = opts.fetchImage ?? fetchWaybackImage;
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const face of loadCarddasJpMakuFaces(opts.curatedRoot)) {
    const diskId = face.number.toLowerCase();
    const printKey = shippudenPrintKey(diskId);
    if (!printKey) {
      failed.push(`${diskId}:not-shippuden`);
      continue;
    }
    const cached = path.join(
      staging,
      path.basename(new URL(face.url).pathname),
    );
    let buf: Buffer | null = existsSync(cached) ? readFileSync(cached) : null;
    if (!buf && !opts.offline) {
      buf = await fetchImage(waybackRawUrl(face.timestamp, face.url));
      if (buf && imageExt(buf)) {
        mkdirSync(staging, { recursive: true });
        writeFileSync(cached, buf);
      }
    }
    const ext = buf ? imageExt(buf) : null;
    if (!buf || !ext) {
      failed.push(`${diskId}:missing`);
      continue;
    }
    const cardDir = cardDirOf(diskId);
    const art = `art.carddas${ext}`;
    const dest = path.join(cardDir, art);
    if (!opts.force && existsSync(dest)) {
      skipped.push(diskId);
    } else {
      mkdirSync(cardDir, { recursive: true });
      writeFileSync(dest, buf);
      written.push(diskId);
    }
    opts.writeAsset?.({
      printKey,
      art,
      sourceUrl: waybackPublicCitationUrl(face.timestamp, face.url),
    });
  }
  return { written, skipped, failed };
}
