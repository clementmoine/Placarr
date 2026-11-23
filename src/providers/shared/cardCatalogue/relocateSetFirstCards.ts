/**
 * Ramène les faces rangées `cards/{set}/{lang}/{card}/` sous l'ordre du
 * contrat, `cards/{lang}/{set}/{card}/` (`packCardDir`, docs/data-layout.md).
 *
 * Plusieurs writers ont posé l'ancien ordre jusqu'au 2026-11-23 (Kayou,
 * Ninja Ranks, Ultra, JCC). La route `/assets` le relisait en repli, mais
 * dès que les deux arbres coexistaient l'app servait la copie lang-first —
 * souvent la plus vieille — et les sondes (grille lenticulaire Kayou)
 * lisaient la mauvaise image. Étape idempotente de la Sync : sur doublon, le
 * fichier le plus récent gagne ; rien d'autre n'est supprimé que les dossiers
 * set-first vidés.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

import { isFaceLang } from "@/core/identify/cardVisualIndex";

export type SetFirstRelocateReport = {
  /** Fichiers déplacés vers un emplacement libre. */
  moved: number;
  /** Copie lang-first plus ancienne remplacée par la set-first. */
  replaced: number;
  /** Copie set-first plus ancienne écartée, la lang-first reste. */
  keptCanonical: number;
};

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function mergeInto(
  src: string,
  dest: string,
  report: SetFirstRelocateReport,
): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const from = path.join(src, entry);
    const to = path.join(dest, entry);
    if (isDir(from)) {
      mergeInto(from, to, report);
      continue;
    }
    if (!existsSync(to)) {
      renameSync(from, to);
      report.moved += 1;
    } else if (statSync(from).mtimeMs > statSync(to).mtimeMs) {
      renameSync(from, to);
      report.replaced += 1;
    } else {
      unlinkSync(from);
      report.keptCanonical += 1;
    }
  }
  if (readdirSync(src).length === 0) rmdirSync(src);
}

export function relocateSetFirstCardDirs(
  cardsDir: string,
): SetFirstRelocateReport {
  const report: SetFirstRelocateReport = {
    moved: 0,
    replaced: 0,
    keptCanonical: 0,
  };
  if (!isDir(cardsDir)) return report;
  for (const setCode of readdirSync(cardsDir)) {
    // Un dossier de langue est déjà lang-first ; les fichiers (dos) restent.
    if (isFaceLang(setCode)) continue;
    const setDir = path.join(cardsDir, setCode);
    if (!isDir(setDir)) continue;
    for (const lang of readdirSync(setDir)) {
      if (!isFaceLang(lang)) continue;
      const src = path.join(setDir, lang);
      if (!isDir(src)) continue;
      mergeInto(src, path.join(cardsDir, lang, setCode), report);
    }
    if (readdirSync(setDir).length === 0) rmdirSync(setDir);
  }
  return report;
}
