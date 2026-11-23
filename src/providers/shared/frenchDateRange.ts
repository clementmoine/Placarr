/**
 * « du 3 novembre au 20 décembre 2020 » / « du 24 octobre au 9 décembre »
 * → dates ISO. Taxonomie calendaire fermée (mois), pas un vocabulaire produit.
 * Sans année dans le texte, `fallbackYear` (année de publication de
 * l'article) est l'année de début ; une fin dont le mois précède celui du
 * début tombe l'année suivante.
 */
const MONTHS: Readonly<Record<string, number>> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

function fold(raw: string): string {
  return raw.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseFrenchDayMonthRange(
  text: string,
  fallbackYear?: number,
): { start: string; end: string } | null {
  const m = fold(text).match(
    /\bdu (\d{1,2})(?:er)? ([a-z]+)(?: (\d{4}))? au (\d{1,2})(?:er)? ([a-z]+)(?: (\d{4}))?/,
  );
  if (!m) return null;
  const m1 = MONTHS[m[2]!];
  const m2 = MONTHS[m[5]!];
  if (!m1 || !m2) return null;
  const wraps = m2 < m1;
  let startYear: number;
  let endYear: number;
  if (m[6]) {
    endYear = Number(m[6]);
    startYear = m[3] ? Number(m[3]) : wraps ? endYear - 1 : endYear;
  } else if (m[3]) {
    startYear = Number(m[3]);
    endYear = wraps ? startYear + 1 : startYear;
  } else {
    if (!fallbackYear) return null;
    startYear = fallbackYear;
    endYear = wraps ? startYear + 1 : startYear;
  }
  return {
    start: iso(startYear, m1, Number(m[1])),
    end: iso(endYear, m2, Number(m[4])),
  };
}
