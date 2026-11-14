/**
 * Préférences checklist par étagère (localStorage).
 *
 * Master set off + afficher les possédées on au démarrage d'une licence ;
 * l'utilisateur peut basculer, et on mémorise. La suggestion master set peut
 * être écartée sans activer le mode.
 *
 * Toutes les cases d'affichage partagent la polarité « Afficher » (coché =
 * visible / inclus).
 */

export type ChecklistShelfPrefs = {
  showOwned: boolean;
  /** Absents temporaires (commande, prêt…). */
  showAway: boolean;
  /**
   * Cartes « déjà eues » (`past`) avec badge. Défaut on — hors buy missing.
   */
  showPast: boolean;
  /**
   * Cartes virtuelles (dans un scellé fermé). Défaut on — hors buy missing,
   * badge « virtuel » ; comptées dans la barre tant que la case est on.
   */
  showVirtual: boolean;
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
   * Cotes ~ (médiane de rareté). Défaut on — dans le total avec le préfixe ~.
   * Off : hors total, comptées « sans cote ».
   */
  showImputedPrices: boolean;
  /**
   * Conseil scellé : SKU à espérance 0 (déjà couverts / sans impact estimé).
   * Défaut on — on liste tout, trié du plus rentable.
   */
  showZeroSealedExpectation: boolean;
};

export const DEFAULT_CHECKLIST_PREFS: ChecklistShelfPrefs = {
  showOwned: true,
  showAway: true,
  showPast: true,
  showVirtual: true,
  masterSet: false,
  masterSetSuggestDismissed: false,
  alwaysShowFinishLabels: false,
  showPrices: true,
  showImputedPrices: true,
  showZeroSealedExpectation: true,
};

const STORAGE_PREFIX = "placarr.checklistPrefs.v1:";

function storageKey(shelfId: string): string {
  return `${STORAGE_PREFIX}${shelfId.trim()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseShowFlag(
  raw: Record<string, unknown>,
  key: keyof ChecklistShelfPrefs,
  fallback: boolean,
): boolean {
  const value = raw[key];
  if (typeof value === "boolean") return value;
  return fallback;
}

/** Ancien `hideX: true` → `showX: false` ; clé absente → fallback. */
function parseShowFromLegacyHide(
  raw: Record<string, unknown>,
  showKey: "showImputedPrices" | "showZeroSealedExpectation",
  hideKey: "hideImputedPrices" | "hideZeroSealedExpectation",
  fallback: boolean,
): boolean {
  if (typeof raw[showKey] === "boolean") return raw[showKey] as boolean;
  if (typeof raw[hideKey] === "boolean") return !(raw[hideKey] as boolean);
  return fallback;
}

export function parseChecklistPrefs(raw: unknown): ChecklistShelfPrefs {
  if (!isRecord(raw)) return { ...DEFAULT_CHECKLIST_PREFS };
  return {
    showOwned: parseShowFlag(
      raw,
      "showOwned",
      DEFAULT_CHECKLIST_PREFS.showOwned,
    ),
    showAway: parseShowFlag(raw, "showAway", DEFAULT_CHECKLIST_PREFS.showAway),
    showPast: parseShowFlag(raw, "showPast", DEFAULT_CHECKLIST_PREFS.showPast),
    showVirtual: parseShowFlag(
      raw,
      "showVirtual",
      DEFAULT_CHECKLIST_PREFS.showVirtual,
    ),
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
    showImputedPrices: parseShowFromLegacyHide(
      raw,
      "showImputedPrices",
      "hideImputedPrices",
      DEFAULT_CHECKLIST_PREFS.showImputedPrices,
    ),
    showZeroSealedExpectation: parseShowFromLegacyHide(
      raw,
      "showZeroSealedExpectation",
      "hideZeroSealedExpectation",
      DEFAULT_CHECKLIST_PREFS.showZeroSealedExpectation,
    ),
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
