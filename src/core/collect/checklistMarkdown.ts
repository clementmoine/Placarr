/**
 * Export Markdown d'une check-list (cases GFM `[x]` / `[ ]`).
 *
 * Pur texte : collable dans un éditeur / Notion / GitHub. Les prix unitaires
 * sont optionnels (préférence « Afficher les prix ») — pas le plan d'achat.
 */

import {
  ambiguousChecklistPrintKeys,
  checklistShouldShowFinish,
} from "./checklist";

export type ChecklistMarkdownCard = {
  reference: string;
  title: string;
  owned: boolean;
  /** Prix déjà formaté (`3 €`), absent si inconnu / masqué. */
  priceLabel?: string | null;
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

/** Carte telle que renvoyée par l'API checklist (cards + missing). */
export type ChecklistShelfCard = {
  printKey: string;
  reference: string;
  title: string;
  owned?: boolean;
  finish?: string | null;
};

export type ChecklistShelfSetForMarkdown = {
  label: string;
  owned: number;
  total: number;
  completion: number;
  cards?: readonly ChecklistShelfCard[] | null;
  missing: readonly ChecklistShelfCard[];
  /** `printKey` → libellé prix (`3 €`). Absent = pas de prix dans l'export. */
  prices?: Readonly<Record<string, string>> | null;
};

function markdownCardReference(
  card: ChecklistShelfCard,
  showFinish: boolean,
  localizeFinish?: (finish: string) => string,
): string {
  const ref = card.reference.trim();
  const finish = showFinish ? card.finish?.trim() : "";
  if (!finish) return ref;
  const label = localizeFinish?.(finish) ?? finish;
  return `${ref} (${label})`;
}

/**
 * Prépare les sets pour l'export — même pool que l'UI.
 *
 * Sans « afficher les possédées », on part de `missing` (pas d'un filtre sur
 * `card.owned` qui peut manquer côté client). La finition suit
 * {@link checklistShouldShowFinish} (ambiguë seule, ou toutes).
 */
export function checklistSetsForMarkdown(
  sets: readonly ChecklistShelfSetForMarkdown[],
  includeOwned: boolean,
  localizeFinish?: (finish: string) => string,
  finishLabelsOnlyWhenAmbiguous = true,
): ChecklistMarkdownSet[] {
  return sets.map((set) => {
    const all = set.cards ?? set.missing;
    const ambiguous = ambiguousChecklistPrintKeys(all);
    const pool = includeOwned ? all : set.missing;
    return {
      label: set.label,
      owned: set.owned,
      total: set.total,
      completion: set.completion,
      cards: pool.map((card) => {
        const showFinish = checklistShouldShowFinish({
          printKey: card.printKey,
          finish: card.finish,
          ambiguous,
          onlyWhenAmbiguous: finishLabelsOnlyWhenAmbiguous,
        });
        const priceLabel =
          set.prices?.[card.printKey.trim()] ??
          set.prices?.[card.printKey.trim().toLowerCase()] ??
          null;
        return {
          reference: markdownCardReference(card, showFinish, localizeFinish),
          title: card.title,
          owned: includeOwned ? Boolean(card.owned) : false,
          ...(priceLabel ? { priceLabel } : {}),
        };
      }),
    };
  });
}

function escapeMd(text: string): string {
  return text.replace(/([\\`*_[\]{}])/g, "\\$1");
}

const PROGRESS_BAR_WIDTH = 20;

/** Barre ASCII `████░░░░` bornée 0–100 %. */
export function asciiProgressBar(
  completion: number,
  width = PROGRESS_BAR_WIDTH,
): string {
  const pct = Number.isFinite(completion)
    ? Math.max(0, Math.min(100, completion))
    : 0;
  const filled = Math.round((pct / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function progressLine(
  owned: number,
  total: number,
  completion: number,
  prefix?: string,
): string {
  const bar = asciiProgressBar(completion);
  const counts = `${owned} / ${total} · ${completion} %`;
  const label = prefix ? `${prefix} — ${counts}` : counts;
  return `${bar} ${label}`;
}

function cardLine(card: ChecklistMarkdownCard): string {
  const mark = card.owned ? "x" : " ";
  const ref = card.reference.trim();
  const title = card.title.trim();
  const parts: string[] = [];
  if (ref && title && ref !== title) {
    parts.push(escapeMd(ref), escapeMd(title));
  } else {
    parts.push(escapeMd(ref || title || "—"));
  }
  const price = card.priceLabel?.trim();
  if (price) parts.push(escapeMd(price));
  return `- [${mark}] ${parts.join(" · ")}`;
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

  for (const set of input.sets) {
    const cards = includeOwned
      ? set.cards
      : set.cards.filter((card) => !card.owned);
    if (cards.length === 0 && set.total > 0 && includeOwned === false) {
      /* Set complet hors mode « manquantes » : on le mentionne quand même. */
      lines.push(`## ${escapeMd(set.label)}`);
      lines.push("");
      lines.push(
        progressLine(set.owned, set.total, set.completion, "Complet"),
      );
      lines.push("");
      continue;
    }
    if (cards.length === 0) continue;

    lines.push(`## ${escapeMd(set.label)}`);
    lines.push("");
    lines.push(progressLine(set.owned, set.total, set.completion));
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
