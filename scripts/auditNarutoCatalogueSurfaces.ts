/**
 * Audit Naruto Carddass catalogue surfaces for promo bleed / wrong labels.
 *
 *   pnpm exec tsx scripts/auditNarutoCatalogueSurfaces.ts
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { dataRoot } from "@/lib/runtimeData";
import { listCatalogueCards } from "@/lib/admin/catalogueCards";
import {
  formatNarutoReference,
  narutoSetLabel,
  parseNarutoCollector,
} from "@/providers/naruto/narutocarddass/identity";
import { parsePrintKey } from "@/core/identify/printKey";
import {
  listNarutoSetPrints,
  lookupNarutoPrint,
  searchNarutoPrints,
} from "@/providers/naruto/narutocarddass/search";
import { belongsOnNarutoPromoChecklist } from "@/providers/naruto/narutocarddass/sources/promos";

type Finding = {
  kind: string;
  printKey: string;
  detail: string;
  surfaces: string[];
};

function collectorFromPrintKey(printKey: string): string {
  const parsed = parsePrintKey(printKey);
  if (!parsed) return printKey.replace(/^naruto:/i, "");
  if (parsed.grouping) return `${parsed.number}-${parsed.grouping}`;
  if (parsed.set === "promo" && !parsed.number.endsWith("-promo")) {
    const id = parseNarutoCollector(parsed.number);
    if (id?.family === "promo") return parsed.number;
    return `${parsed.number}-promo`;
  }
  if (
    parsed.set === "prerelease" &&
    !parsed.number.endsWith("-prerelease")
  ) {
    return `${parsed.number}-prerelease`;
  }
  return parsed.number;
}

function isPromoSurface(row: {
  printKey?: string | null;
  setCode?: string | null;
  reference?: string | null;
}): boolean {
  const pk = row.printKey ?? "";
  if (pk.includes(":promo-")) return true;
  if ((row.setCode ?? "").toLowerCase() === "promo") return true;
  if ((row.reference ?? "").includes("· promo")) return true;
  return false;
}

function enSeriesLabel(label: string | null | undefined): boolean {
  const s = (label ?? "").trim();
  if (!s) return false;
  if (/^Series\s+\d+/i.test(s)) return true;
  return /\b(Curse of the Leaf|Destroy Konoha|Seal the Curse|Hidden Powers|Learning)\b/i.test(
    s,
  );
}

async function main(): Promise<void> {
  const findings: Finding[] = [];
  const dbPath = path.join(dataRoot(), "naruto/carddass/catalog.sqlite");
  const db = new DatabaseSync(dbPath, { readOnly: true });

  // ── Index: EU titles on unattested promo channel ────────────────────────
  const promoEu = db
    .prepare(
      `SELECT p.print_key AS printKey, p.number AS number,
              t.lang AS lang, t.full_name AS name, t.rarity AS rarity
         FROM prints p
         JOIN print_titles t ON t.print_key = p.print_key
        WHERE p.set_code = 'promo' AND t.lang IN ('fr', 'it')
        ORDER BY p.number, t.lang`,
    )
    .all() as {
    printKey: string;
    number: string;
    lang: string;
    name: string;
    rarity: string | null;
  }[];

  for (const row of promoEu) {
    if (belongsOnNarutoPromoChecklist(row.number)) continue;
    findings.push({
      kind: "index-unattested-promo-eu-title",
      printKey: row.printKey,
      detail: `${row.lang} «${row.name}» rarity=${row.rarity ?? "∅"} number=${row.number}`,
      surfaces: ["index", "lookup", "item"],
    });
  }

  // Retail FR with rarity=promo
  const retailPromoRarity = db
    .prepare(
      `SELECT p.print_key AS printKey, p.set_code AS setCode, p.number AS number,
              t.full_name AS name
         FROM prints p
         JOIN print_titles t ON t.print_key = p.print_key AND t.lang = 'fr'
        WHERE p.set_code GLOB 's[1-6]'
          AND lower(coalesce(t.rarity, '')) = 'promo'`,
    )
    .all() as {
    printKey: string;
    setCode: string;
    number: string;
    name: string;
  }[];
  for (const row of retailPromoRarity) {
    findings.push({
      kind: "index-retail-rarity-promo",
      printKey: row.printKey,
      detail: `${row.setCode}/${row.number} «${row.name}»`,
      surfaces: ["checklist", "picker", "item"],
    });
  }

  // ── Picker / search FR (union of set checklists + targeted queries) ─────
  const pickerByKey = new Map<
    string,
    ReturnType<typeof listNarutoSetPrints>[number]
  >();
  for (const setId of [
    "s1",
    "s2",
    "s3",
    "s4",
    "s5",
    "s6",
    "promo",
    "prerelease",
  ]) {
    for (const row of listNarutoSetPrints({ setId, language: "fr" })) {
      pickerByKey.set(row.printKey, row);
    }
  }
  // Catch unfiltered search hits that checklist gating might still miss.
  for (const q of [
    "TE-107",
    "TE-108",
    "TA-074",
    "NI-023",
    "NI-309",
    "promo",
  ]) {
    for (const row of searchNarutoPrints(q, { language: "fr", limit: 100 })) {
      pickerByKey.set(row.printKey, row);
    }
  }
  const picker = [...pickerByKey.values()];
  for (const row of picker) {
    const pk = row.printKey ?? "";
    if (isPromoSurface(row)) {
      const number = collectorFromPrintKey(pk);
      if (!belongsOnNarutoPromoChecklist(number)) {
        findings.push({
          kind: "picker-unattested-promo",
          printKey: pk,
          detail: `ref=${row.reference} label=${row.setLabel} title=${row.title}`,
          surfaces: ["modale-ajout", "search"],
        });
      }
    }
    if (/^naruto:s[1-6]-/.test(pk)) {
      if (
        (row.reference ?? "").includes("promo") ||
        (row.setLabel ?? "").toLowerCase().includes("promo")
      ) {
        findings.push({
          kind: "picker-retail-promo-label",
          printKey: pk,
          detail: `ref=${row.reference} label=${row.setLabel}`,
          surfaces: ["modale-ajout"],
        });
      }
      if (enSeriesLabel(row.setLabel)) {
        findings.push({
          kind: "picker-en-set-label",
          printKey: pk,
          detail: `label=${row.setLabel}`,
          surfaces: ["modale-ajout"],
        });
      }
    }
  }

  // ── Checklists ──────────────────────────────────────────────────────────
  for (const setId of [
    "s1",
    "s2",
    "s3",
    "s4",
    "s5",
    "s6",
    "promo",
    "prerelease",
  ]) {
    const rows = listNarutoSetPrints({ setId, language: "fr" });
    for (const row of rows) {
      const pk = row.printKey ?? "";
      if (setId === "promo") {
        const number = collectorFromPrintKey(pk);
        if (!belongsOnNarutoPromoChecklist(number)) {
          findings.push({
            kind: "checklist-promo-unattested",
            printKey: pk,
            detail: `ref=${row.reference} title=${row.title}`,
            surfaces: ["checklist"],
          });
        }
        continue;
      }
      if ((row.setCode ?? "").toLowerCase() !== setId) {
        findings.push({
          kind: "checklist-setcode-mismatch",
          printKey: pk,
          detail: `filtered=${setId} stamped=${row.setCode} label=${row.setLabel}`,
          surfaces: ["checklist"],
        });
      }
      if ((row.reference ?? "").includes("· promo")) {
        findings.push({
          kind: "checklist-retail-promo-ref",
          printKey: pk,
          detail: `set=${setId} ref=${row.reference}`,
          surfaces: ["checklist"],
        });
      }
      if ((row.setLabel ?? "").toLowerCase().includes("promo")) {
        findings.push({
          kind: "checklist-retail-promo-label",
          printKey: pk,
          detail: `set=${setId} label=${row.setLabel}`,
          surfaces: ["checklist"],
        });
      }
      if (enSeriesLabel(row.setLabel)) {
        findings.push({
          kind: "checklist-en-set-label",
          printKey: pk,
          detail: `set=${setId} label=${row.setLabel}`,
          surfaces: ["checklist"],
        });
      }
      // Expected FR label for sN
      const expected = narutoSetLabel(setId, collectorFromPrintKey(pk), "fr");
      if (row.setLabel && row.setLabel !== expected && setId !== "prerelease") {
        // Only flag when clearly wrong family (EN / promo already covered)
      }
    }
  }

  // ── Admin FR tiles ──────────────────────────────────────────────────────
  const adminRows: Awaited<
    ReturnType<typeof listCatalogueCards>
  >["cards"] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await listCatalogueCards({
      pack: "naruto/carddass",
      preferLang: "fr",
      locales: "preferred",
      offset,
      limit: 1000,
    });
    adminRows.push(...page.cards);
    if (page.cards.length < 1000 || adminRows.length >= page.total) break;
  }
  for (const row of adminRows) {
    const pk = row.printKey ?? "";
    const card = row.card ?? "";
    const isPromo =
      (row.set ?? "").toLowerCase() === "promo" ||
      card.includes("-promo") ||
      card.includes("-cdf") ||
      pk.includes(":promo-");
    if (isPromo && !belongsOnNarutoPromoChecklist(card)) {
      findings.push({
        kind: "admin-unattested-promo-tile",
        printKey: pk,
        detail: `card=${card} set=${row.set} label=${row.label} name=${row.name}`,
        surfaces: ["admin"],
      });
    }
    if (
      /^naruto:s[1-6]-/.test(pk) &&
      ((row.label ?? "").includes("promo") ||
        (row.rarity ?? "").toLowerCase() === "promo")
    ) {
      findings.push({
        kind: "admin-retail-promo-label",
        printKey: pk,
        detail: `label=${row.label} rarity=${row.rarity}`,
        surfaces: ["admin"],
      });
    }
    if (enSeriesLabel(row.label)) {
      findings.push({
        kind: "admin-en-set-label",
        printKey: pk,
        detail: `label=${row.label}`,
        surfaces: ["admin"],
      });
    }
  }

  // ── Lookup/item: unattested promo still resolvable (OK) but FR label wrong
  const unattestedPromoKeys = [
    ...new Set(
      findings
        .filter((f) => f.kind === "index-unattested-promo-eu-title")
        .map((f) => f.printKey),
    ),
  ];
  for (const printKey of unattestedPromoKeys) {
    const looked = lookupNarutoPrint(printKey, { language: "fr" });
    if (!looked) continue;
    if (
      (looked.setLabel ?? "").includes("Promo") ||
      (looked.reference ?? "").includes("· promo")
    ) {
      findings.push({
        kind: "item-unattested-promo-still-labeled",
        printKey,
        detail: `lookup FR ref=${looked.reference} label=${looked.setLabel} title=${looked.title}`,
        surfaces: ["item", "lookup"],
      });
    }
  }

  // ── Cross-check: reference formatting vs set ────────────────────────────
  for (const row of picker.filter((r) => /^naruto:s[1-6]-/.test(r.printKey))) {
    const number = collectorFromPrintKey(row.printKey);
    const expected = formatNarutoReference(row.setCode ?? "s1", number, "fr");
    if (row.reference !== expected && row.reference?.includes("promo")) {
      findings.push({
        kind: "picker-ref-mismatch",
        printKey: row.printKey,
        detail: `got=${row.reference} expected=${expected}`,
        surfaces: ["modale-ajout"],
      });
    }
  }

  // Summarize
  const byKind = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
  }

  console.log("=== Naruto Carddass catalogue surface audit (FR) ===");
  console.log(`picker rows: ${picker.length}`);
  console.log(`admin FR tiles: ${adminRows.length}`);
  console.log(`findings: ${findings.length}`);
  console.log("");
  for (const [kind, list] of [...byKind.entries()].sort()) {
    console.log(`## ${kind} (${list.length})`);
    for (const f of list.slice(0, 40)) {
      console.log(`  - ${f.printKey}: ${f.detail}  [${f.surfaces.join(",")}]`);
    }
    if (list.length > 40) console.log(`  … +${list.length - 40} more`);
    console.log("");
  }

  if (findings.length === 0) {
    console.log("OK — no surface inconsistencies found.");
  } else {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
