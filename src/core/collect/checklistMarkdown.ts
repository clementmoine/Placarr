/**
 * Export Markdown d'une check-list (cases GFM `[x]` / `[ ]`).
 *
 * Pur texte : collable dans un éditeur / Notion / GitHub. Pas de prix ni de
 * conseil d'achat — la chasse papier / markdown, pas le plan boutique.
 */

export type ChecklistMarkdownCard = {
  reference: string;
  title: string;
  owned: boolean;
};

export type ChecklistMarkdownSet = {
  label: string;
  owned: number;
  total: number;
  completion: number;
  cards: readonly ChecklistMarkdownCard[];
};

export type ChecklistMarkdownInput = {
  shelfName?: string | null;
  language?: string | null;
  languageLabel?: string | null;
  totals: { owned: number; total: number; completion: number };
  sets: readonly ChecklistMarkdownSet[];
  setsWithoutCatalogue?: readonly { label: string }[];
  /**
   * `true` (défaut) : toutes les cartes avec cases cochées / vides.
   * `false` : seulement les manquantes (`[ ]`).
   */
  includeOwned?: boolean;
};

function escapeMd(text: string): string {
  return text.replace(/([\\`*_[\]{}])/g, "\\$1");
}

function cardLine(card: ChecklistMarkdownCard): string {
  const mark = card.owned ? "x" : " ";
  const ref = card.reference.trim();
  const title = card.title.trim();
  const body =
    ref && title && ref !== title
      ? `${escapeMd(ref)} · ${escapeMd(title)}`
      : escapeMd(ref || title || "—");
  return `- [${mark}] ${body}`;
}

/** Document Markdown prêt à télécharger ou coller. */
export function formatChecklistMarkdown(
  input: ChecklistMarkdownInput,
): string {
  const includeOwned = input.includeOwned !== false;
  const lines: string[] = [];

  const shelf = input.shelfName?.trim();
  lines.push(shelf ? `# Check-list — ${escapeMd(shelf)}` : "# Check-list");
  lines.push("");

  const meta: string[] = [];
  const lang =
    input.languageLabel?.trim() || input.language?.trim().toUpperCase() || "";
  if (lang) meta.push(lang);
  meta.push(
    `${input.totals.owned} / ${input.totals.total} (${input.totals.completion} %)`,
  );
  lines.push(meta.join(" · "));
  lines.push("");

  for (const set of input.sets) {
    const cards = includeOwned
      ? set.cards
      : set.cards.filter((card) => !card.owned);
    if (cards.length === 0 && set.total > 0 && includeOwned === false) {
      /* Set complet hors mode « manquantes » : on le mentionne quand même. */
      lines.push(`## ${escapeMd(set.label)}`);
      lines.push("");
      lines.push(
        `_Complet — ${set.owned} / ${set.total} (${set.completion} %)_`,
      );
      lines.push("");
      continue;
    }
    if (cards.length === 0) continue;

    lines.push(`## ${escapeMd(set.label)}`);
    lines.push("");
    lines.push(`_${set.owned} / ${set.total} (${set.completion} %)_`);
    lines.push("");
    for (const card of cards) {
      lines.push(cardLine(card));
    }
    lines.push("");
  }

  const without = input.setsWithoutCatalogue ?? [];
  if (without.length > 0) {
    lines.push("## Sans catalogue");
    lines.push("");
    for (const set of without) {
      lines.push(`- ${escapeMd(set.label)}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
