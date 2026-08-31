import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  buildAlertehitImageIndex,
  ALERTEHIT_NARUTODEX_JS,
} from "./alertehitNarutodexParse";
import type { AlerteHitImageIndex } from "./alertehitNarutodexParse";
import {
  buildCapsulecorpChecklist,
  CAPSULECORPGEAR_LIST_URL,
  extractCapsulecorpCardsJson,
} from "./capsulecorpgearParse";
import { narutoKayouCuratedDir } from "./pack";
import type { KayouChecklist } from "./kayouLedgerTypes";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export const CAPSULECORPGEAR_CHECKLIST_FILE = "capsulecorpgear-kayou-checklist.json";
export const ALERTEHIT_IMAGE_INDEX_FILE = "alertehit-narutodex-images.json";

export function capsulecorpgearChecklistPath(): string {
  return path.join(
    narutoKayouCuratedDir(),
    "sources",
    CAPSULECORPGEAR_CHECKLIST_FILE,
  );
}

export function alertehitImageIndexPath(): string {
  return path.join(
    narutoKayouCuratedDir(),
    "sources",
    ALERTEHIT_IMAGE_INDEX_FILE,
  );
}

export function readCapsulecorpgearChecklist(): KayouChecklist | null {
  try {
    return JSON.parse(
      readFileSync(capsulecorpgearChecklistPath(), "utf8"),
    ) as KayouChecklist;
  } catch {
    return null;
  }
}

export function readAlertehitImageIndex(): AlerteHitImageIndex | null {
  try {
    return JSON.parse(
      readFileSync(alertehitImageIndexPath(), "utf8"),
    ) as AlerteHitImageIndex;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export type KayouExternalCrawlReport = {
  capsulecorp: { sets: number; cards: number; changed: boolean };
  alertehit: { images: number; changed: boolean };
};

export async function crawlCapsulecorpgearChecklist(): Promise<KayouChecklist> {
  const res = await httpGet<string>(CAPSULECORPGEAR_LIST_URL, {
    headers: { "User-Agent": UA },
    timeout: 60_000,
  });
  const raw = extractCapsulecorpCardsJson(res.data);
  return buildCapsulecorpChecklist(raw);
}

export async function crawlAlertehitImageIndex(): Promise<AlerteHitImageIndex> {
  const res = await httpGet<string>(ALERTEHIT_NARUTODEX_JS, {
    headers: { "User-Agent": UA, Referer: "https://alertehit.fr/narutodex" },
    timeout: 60_000,
  });
  return buildAlertehitImageIndex(res.data);
}

export async function runKayouExternalCatalogCrawl(): Promise<KayouExternalCrawlReport> {
  const capsulePath = capsulecorpgearChecklistPath();
  const alertePath = alertehitImageIndexPath();
  const prevCapsule = readCapsulecorpgearChecklist();
  const prevAlerte = readAlertehitImageIndex();

  const capsule = await crawlCapsulecorpgearChecklist();
  const alerte = await crawlAlertehitImageIndex();

  const capsuleJson = JSON.stringify(capsule);
  const alerteJson = JSON.stringify(alerte);
  const capsuleChanged = JSON.stringify(prevCapsule) !== capsuleJson;
  const alerteChanged = JSON.stringify(prevAlerte) !== alerteJson;

  if (capsuleChanged) writeJson(capsulePath, capsule);
  if (alerteChanged) writeJson(alertePath, alerte);

  return {
    capsulecorp: {
      sets: capsule.sets.length,
      cards: capsule.sets.reduce((n, s) => n + s.cards.length, 0),
      changed: capsuleChanged,
    },
    alertehit: {
      images: alerte.images.length,
      changed: alerteChanged,
    },
  };
}
