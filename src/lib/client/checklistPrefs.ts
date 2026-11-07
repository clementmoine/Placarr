/**
 * Préférences checklist par étagère (localStorage).
 *
 * Master set off + afficher les possédées on au démarrage d'une licence ;
 * l'utilisateur peut basculer, et on mémorise. La suggestion master set peut
 * être écartée sans activer le mode.
 */

/** Compteur / % : en main seul, ou tout possédé (scellé compris). */
export type ChecklistPossessionView = "inHand" | "covered";

export type ChecklistShelfPrefs = {
  showOwned: boolean;
  /**
   * Afficher les cartes « déjà eues » (`past`) avec badge. Défaut off — elles
   * restent hors buy missing mais hors liste (cas typique : vendu / jeté).
   */
  showPast: boolean;
  /**
   * Afficher les cartes virtuelles (dans un scellé fermé). Défaut on — hors
   * buy missing, badge « virtuel ».
   */
  showVirtual: boolean;
  /** Ne lister que les virtuels. */
  onlyVirtual: boolean;
  /** Bascule compteur / barre de progression. */
  possessionView: ChecklistPossessionView;
  masterSet: boolean;
  /** L'utilisateur a écarté la suggestion d'activer le master set. */
  masterSetSuggestDismissed: boolean;
  /**
   * Master set : afficher Holofoil / Normale / … sur **chaque** ligne.
   * Sinon (défaut) : seulement quand ça distingue deux versions
   * (dual, prerelease…).
   */
  alwaysShowFinishLabels: boolean;
  /** Cotes par carte + panneau conseil d'achat. */
  showPrices: boolean;
  /**
   * Masquer les cotes ~ (médiane de rareté) : hors total, comptées « sans
   * cote ». Défaut off — elles restent dans le total avec le préfixe ~.
   */
  hideImputedPrices: boolean;
  /**
   * Conseil scellé : masquer les SKU à espérance 0 (déjà couverts / sans
   * impact estimé). Défaut off — on liste tout, trié du plus rentable.
   */
  hideZeroSealedExpectation: boolean;
};

export const DEFAULT_CHECKLIST_PREFS: ChecklistShelfPrefs = {
  showOwned: true,
  showPast: false,
  showVirtual: true,
  onlyVirtual: false,
  possessionView: "inHand",
  masterSet: false,
  masterSetSuggestDismissed: false,
  alwaysShowFinishLabels: false,
  showPrices: true,
  hideImputedPrices: false,
  hideZeroSealedExpectation: false,
};

const STORAGE_PREFIX = "placarr.checklistPrefs.v1:";

function storageKey(shelfId: string): string {
  return `${STORAGE_PREFIX}${shelfId.trim()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePossessionView(raw: unknown): ChecklistPossessionView {
  return raw === "covered" ? "covered" : "inHand";
}

export function parseChecklistPrefs(raw: unknown): ChecklistShelfPrefs {
  if (!isRecord(raw)) return { ...DEFAULT_CHECKLIST_PREFS };
  return {
    showOwned:
      typeof raw.showOwned === "boolean"
        ? raw.showOwned
        : DEFAULT_CHECKLIST_PREFS.showOwned,
    showPast:
      typeof raw.showPast === "boolean"
        ? raw.showPast
        : DEFAULT_CHECKLIST_PREFS.showPast,
    showVirtual:
      typeof raw.showVirtual === "boolean"
        ? raw.showVirtual
        : DEFAULT_CHECKLIST_PREFS.showVirtual,
    onlyVirtual:
      typeof raw.onlyVirtual === "boolean"
        ? raw.onlyVirtual
        : DEFAULT_CHECKLIST_PREFS.onlyVirtual,
    possessionView: parsePossessionView(raw.possessionView),
    masterSet:
      typeof raw.masterSet === "boolean"
        ? raw.masterSet
        : DEFAULT_CHECKLIST_PREFS.masterSet,
    masterSetSuggestDismissed:
      typeof raw.masterSetSuggestDismissed === "boolean"
        ? raw.masterSetSuggestDismissed
        : DEFAULT_CHECKLIST_PREFS.masterSetSuggestDismissed,
    alwaysShowFinishLabels:
      typeof raw.alwaysShowFinishLabels === "boolean"
        ? raw.alwaysShowFinishLabels
        : // Ancien nom (session précédente) — inverser le sens.
          typeof raw.finishLabelsOnlyWhenAmbiguous === "boolean"
          ? !raw.finishLabelsOnlyWhenAmbiguous
          : DEFAULT_CHECKLIST_PREFS.alwaysShowFinishLabels,
    showPrices:
      typeof raw.showPrices === "boolean"
        ? raw.showPrices
        : DEFAULT_CHECKLIST_PREFS.showPrices,
    hideImputedPrices:
      typeof raw.hideImputedPrices === "boolean"
        ? raw.hideImputedPrices
        : DEFAULT_CHECKLIST_PREFS.hideImputedPrices,
    hideZeroSealedExpectation:
      typeof raw.hideZeroSealedExpectation === "boolean"
        ? raw.hideZeroSealedExpectation
        : DEFAULT_CHECKLIST_PREFS.hideZeroSealedExpectation,
  };
}

export function readChecklistPrefs(shelfId: string): ChecklistShelfPrefs {
  if (typeof window === "undefined" || !shelfId.trim()) {
    return { ...DEFAULT_CHECKLIST_PREFS };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(shelfId));
    if (!raw) return { ...DEFAULT_CHECKLIST_PREFS };
    return parseChecklistPrefs(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_CHECKLIST_PREFS };
  }
}

export function writeChecklistPrefs(
  shelfId: string,
  prefs: ChecklistShelfPrefs,
): void {
  if (typeof window === "undefined" || !shelfId.trim()) return;
  try {
    window.localStorage.setItem(
      storageKey(shelfId),
      JSON.stringify(parseChecklistPrefs(prefs)),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}
