/**
 * Export Markdown des items `past` (cession / historique).
 * Complète la check-list booléenne — présence, raison, canal, prix de vente.
 */

import {
  formatAbsencePriceEuros,
  isAbsenceReason,
  isItemPresence,
  type AbsenceReason,
  type ItemPresence,
} from "@/core/collect/itemAbsence";

export type CessionMarkdownItem = {
  name: string;
  reference?: string | null;
  presence?: ItemPresence | string | null;
  absenceReason?: AbsenceReason | string | null;
  absenceSince?: Date | string | null;
  absenceSource?: string | null;
  absenceRecipient?: string | null;
  absenceCarrier?: string | null;
  absencePriceCents?: number | null;
};

function escapeMd(text: string): string {
  return text.replace(/([\\`*_[\]{}])/g, "\\$1");
}

function formatSince(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return trimmed.slice(0, 10);
}

function cessionLine(item: CessionMarkdownItem): string {
  const presence = isItemPresence(item.presence) ? item.presence : "past";
  const reason = isAbsenceReason(item.absenceReason)
    ? item.absenceReason
    : "—";
  const ref = item.reference?.trim();
  const name = item.name.trim() || "—";
  const title =
    ref && ref !== name
      ? `${escapeMd(ref)} · ${escapeMd(name)}`
      : escapeMd(name);
  const canal =
    item.absenceRecipient?.trim() ||
    item.absenceCarrier?.trim() ||
    item.absenceSource?.trim() ||
    "—";
  const parts = [
    title,
    presence,
    reason,
    formatSince(item.absenceSince) ?? "—",
    escapeMd(canal),
    formatAbsencePriceEuros(item.absencePriceCents) ?? "—",
  ];
  return `- ${parts.join(" | ")}`;
}

/** Document Markdown : section « Déjà eus » / historique de cession. */
export function formatCessionMarkdown(input: {
  shelfName?: string | null;
  items: readonly CessionMarkdownItem[];
}): string {
  const past = input.items.filter(
    (item) => (item.presence ?? "owned") === "past",
  );
  const lines: string[] = [];
  const shelf = input.shelfName?.trim();
  lines.push(shelf ? `# Déjà eus — ${escapeMd(shelf)}` : "# Déjà eus");
  lines.push("");
  if (past.length === 0) {
    lines.push("_Aucun item en historique._");
    lines.push("");
    return `${lines.join("\n").trimEnd()}\n`;
  }
  for (const item of past) {
    lines.push(cessionLine(item));
  }
  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}
