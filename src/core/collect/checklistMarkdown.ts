/**
 * Export Markdown d'une check-list (cases GFM `[x]` / `[-]` / `[ ]`).
 *
 * Pur texte : collable dans un éditeur / Notion / GitHub. Les prix unitaires
 * sont optionnels (préférence « Afficher les prix ») — pas le plan d'achat.
 * Le pool suit les mêmes cases « Afficher » que l'UI.
 */

import {
  ambiguousChecklistPrintKeys,
  checklistShouldShowFinish,
} from "./checklist";

/** Case Markdown : pleine / intermédiaire / vide. */
export type ChecklistMarkdownMark = "checked" | "mixed" | "unchecked";

export type ChecklistMarkdownCard = {
  reference: string;
  title: string;
  owned: boolean;
  /**
   * Présence checklist. Sans elle : `owned` → checked, sinon unchecked.
   * `away` / `past` / `virtual` → case intermédiaire `[-]`.
   */
  presence?: string | null;
  /** Libellé localisé pour une case intermédiaire (`Déjà eu`, …). */
  presenceLabel?: string | null;
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

/** Visibilité — même polarité Afficher que la check-list écran. */
export type ChecklistMarkdownVisibility = {
  showOwned: boolean;
  showAway: boolean;
  showPast: boolean;
  showVirtual: boolean;
};

export type ChecklistMarkdownInput = {
  shelfName?: string | null;
  language?: string | null;
  languageLabel?: string | null;
  totals: { owned: number; total: number; completion: number };
  sets: readonly ChecklistMarkdownSet[];
  setsWithoutCatalogue?: readonly { label: string }[];
};

/** Carte telle que renvoyée par l'API checklist (cards + missing). */
export type ChecklistShelfCard = {
  printKey: string;
  reference: string;
  title: string;
  owned?: boolean;
  /** owned | away | virtual | past | missing */
  presence?: string | null;
  finish?: string | null;
};

export type ChecklistShelfSetForMarkdown = {
  label: string;
  owned: number;
  /** Absents temporaires — comptés en main avec `owned`. */
  away?: number;
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

const MIXED_PRESENCES = new Set(["away", "past", "virtual"]);

export function checklistMarkdownMark(
  card: Pick<ChecklistMarkdownCard, "owned" | "presence">,
): ChecklistMarkdownMark {
  const presence =
    card.presence?.trim() || (card.owned ? "owned" : "missing");
  if (presence === "owned") return "checked";
  if (MIXED_PRESENCES.has(presence)) return "mixed";
  return "unchecked";
}

export function checklistMarkdownPresenceVisible(
  presence: string,
  visibility: ChecklistMarkdownVisibility,
): boolean {
  if (presence === "missing") return true;
  if (presence === "owned") return visibility.showOwned;
  if (presence === "away") return visibility.showAway;
  if (presence === "past") return visibility.showPast;
  if (presence === "virtual") return visibility.showVirtual;
  return true;
}

export function normalizeChecklistQuery(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** `query` est déjà normalisé (`normalizeChecklistQuery`). Vide = tout passe. */
export function checklistTextMatches(
  query: string,
  ...parts: Array<string | null | undefined>
): boolean {
  if (!query) return true;
  const haystack = normalizeChecklistQuery(parts.filter(Boolean).join(" "));
  return haystack.includes(query);
}

/**
 * Le set a au moins une ligne à déplier.
 *
 * Les cases « Afficher » sont globales ; un set complet n'a souvent que des
 * possédées. Si elles sont masquées et qu'il n'y a ni manquante, ni away,
 * ni past, ni virtuelle visible, le chevron ne doit pas s'afficher : il
 * s'ouvrirait sur une liste vide.
 */
export function checklistSetHasVisibleCards(
  set: {
    label?: string | null;
    group?: string | null;
    id?: string | null;
    cards?: readonly ChecklistShelfCard[] | null;
    missing?: readonly ChecklistShelfCard[] | null;
  },
  visibility: ChecklistMarkdownVisibility,
  searchQuery = "",
): boolean {
  const cards = set.cards ?? set.missing ?? [];
  if (cards.length === 0) return false;
  const query = normalizeChecklistQuery(searchQuery);
  const setMatches = query
    ? checklistTextMatches(query, set.label, set.group, set.id)
    : false;
  for (const card of cards) {
    const presence =
      card.presence?.trim() || (card.owned ? "owned" : "missing");
    if (!checklistMarkdownPresenceVisible(presence, visibility)) continue;
    if (!query || setMatches) return true;
    if (
      checklistTextMatches(
        query,
        card.reference,
        card.title,
        card.printKey,
        card.finish,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Prépare les sets pour l'export — même pool que l'UI (cases Afficher).
 *
 * La finition suit {@link checklistShouldShowFinish} (ambiguë seule, ou toutes).
 */
export function checklistSetsForMarkdown(
  sets: readonly ChecklistShelfSetForMarkdown[],
  visibility: ChecklistMarkdownVisibility,
  localizeFinish?: (finish: string) => string,
  finishLabelsOnlyWhenAmbiguous = true,
  localizePresence?: (presence: string) => string | null | undefined,
): ChecklistMarkdownSet[] {
  return sets.map((set) => {
    const all = set.cards?.length ? set.cards : set.missing;
    const ambiguous = ambiguousChecklistPrintKeys(all);
    const inHand = set.owned + (set.away ?? 0);
    const cards: ChecklistMarkdownCard[] = [];
    for (const card of all) {
      const presence =
        card.presence?.trim() || (card.owned ? "owned" : "missing");
      if (!checklistMarkdownPresenceVisible(presence, visibility)) continue;
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
      const presenceLabel =
        MIXED_PRESENCES.has(presence) && localizePresence
          ? localizePresence(presence)?.trim() || null
          : null;
      cards.push({
        reference: markdownCardReference(card, showFinish, localizeFinish),
        title: card.title,
        owned: presence === "owned" || presence === "away",
        presence,
        ...(presenceLabel ? { presenceLabel } : {}),
        ...(priceLabel ? { priceLabel } : {}),
      });
    }
    return {
      label: set.label,
      owned: inHand,
      total: set.total,
      completion: set.completion,
      cards,
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
  const kind = checklistMarkdownMark(card);
  const mark = kind === "checked" ? "x" : kind === "mixed" ? "-" : " ";
  const ref = card.reference.trim();
  const title = card.title.trim();
  const parts: string[] = [];
  if (ref && title && ref !== title) {
    parts.push(escapeMd(ref), escapeMd(title));
  } else {
    parts.push(escapeMd(ref || title || "—"));
  }
  const presenceLabel = card.presenceLabel?.trim();
  if (presenceLabel) parts.push(escapeMd(presenceLabel));
  const price = card.priceLabel?.trim();
  if (price) parts.push(escapeMd(price));
  return `- [${mark}] ${parts.join(" · ")}`;
}

/** Document Markdown prêt à télécharger ou coller. */
export function formatChecklistMarkdown(
  input: ChecklistMarkdownInput,
): string {
  const lines: string[] = [];

  const shelf = input.shelfName?.trim();
  lines.push(shelf ? `# Check-list — ${escapeMd(shelf)}` : "# Check-list");
  lines.push("");

  for (const set of input.sets) {
    const cards = set.cards;
    if (cards.length === 0 && set.total > 0 && set.completion >= 100) {
      /* Set complet hors lignes visibles (ex. possédées masquées). */
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
