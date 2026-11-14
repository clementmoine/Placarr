/**
 * Ownership keys for the print picker — finish-exact vs same-print other finish.
 *
 * Set-scoped : une copie rangée en S5 ne marque pas la même carte en S1.
 * Sans `setCode` (legacy) la clé laisse le set vide — elle matche toute
 * ligne du même printKey (comportement d'avant).
 *
 * La langue en fait partie : posséder l'Inari française ne marque pas l'イナリ.
 */
export function ownedRowKey(
  printKey: string,
  variant: string | null,
  language: string | null,
  setCode: string | null,
): string {
  return [
    (setCode ?? "").trim().toLowerCase(),
    printKey.trim().toLowerCase(),
    (language ?? "").trim().toLowerCase(),
    (variant ?? "").trim().toLowerCase(),
  ].join("|");
}

/** Finition exacte déjà sur l'étagère (pas une autre variante du même print). */
export function isExactOwnedRow(
  row: {
    printKey: string;
    finish: string | null;
    language?: string | null;
    setCode?: string | null;
  },
  exact: ReadonlySet<string>,
): boolean {
  const printKey = row.printKey.trim().toLowerCase();
  const lang = row.language ?? null;
  const rowSet = row.setCode?.trim().toLowerCase() || null;
  return (
    exact.has(ownedRowKey(printKey, row.finish, lang, rowSet)) ||
    // Legacy : item sans setCode → encore « déjà là » sur tout set.
    exact.has(ownedRowKey(printKey, row.finish, lang, null))
  );
}
