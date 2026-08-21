/**
 * nikita.jp `/cardlist/nrt` — the JP game data behind the faces.
 *
 * We already pull `?mode=img` for `art.nikita`. The text view of the same site
 * carries what the catalogue has never held for JA: symbol, cost, the four
 * combat values, traits, battle attribute, target/effect text and the flavour
 * line. One `<tr>` per card, four shapes:
 *
 *   忍 / 騎士  symbol, cost, 戦闘力·支援力·負傷戦闘力·負傷支援力, 特徴, 戦闘属性
 *   術 / 作戦  symbol, cost, 【目標】, 【効果】
 *   依頼人     symbol (can be two: 水／土), cost, 特徴, 【効果】
 *
 * Nothing here mints a print: the ids are joined onto what the catalogue
 * already holds, exactly like the face pass.
 */
import { narutoDiskCardId } from "./collectorIdentity";
import { nikitaNrtVolumeSetCode } from "./parseNikitaNrt";

/**
 * The text view writes 忍/術/作/依 in kanji but the knight in Latin (`K-7`).
 * Same keys as the image view, so the same fold applies.
 */
const LATIN_PREFIX: Readonly<Record<string, string>> = {
  N: "忍",
  J: "術",
  S: "作",
  I: "依",
  K: "騎",
};

function foldPrintedRef(raw: string): string {
  const m = /^([NJSIK])-(\d+)$/i.exec(raw);
  if (!m) return raw;
  const kanji = LATIN_PREFIX[m[1]!.toUpperCase()];
  return kanji ? `${kanji}-${Number(m[2])}` : raw;
}

export const NIKITA_CARDLIST_PATH = "/cardlist/nrt";

export type NikitaCardFacts = {
  /** `nrt` (巻ノ) or `nrts` (疾風伝) — the letter keys mean different lines. */
  game: string | null;
  /** Site key from the image filename — `N-001`, `K-007`. */
  nikitaKey: string | null;
  /** Disk id (`ni0001`), null when the ref is not one we mint. */
  number: string | null;
  printedRef: string;
  name: string;
  cardType: string;
  setLabel: string | null;
  setCode: string | null;
  symbols: string[];
  cost: number | null;
  power: number | null;
  support: number | null;
  woundedPower: number | null;
  woundedSupport: number | null;
  traits: string[];
  battleAttribute: string | null;
  target: string | null;
  effect: string | null;
  quote: string | null;
};

const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
/**
 * `nrt` is the 巻ノ game, `nrts` the 疾風伝 one. Both name their files N/J/S —
 * under `nrts` the same `N-037.jpg` is 忍伝-037, not 忍-37. The game segment is
 * captured so nothing can be joined on the letter alone.
 */
const IMG_RE = /\/img\/card\/(nrts?)\/([A-Z]+-\d+)(?:_\d+)?\.jpg/i;
const HEAD_RE =
  /font-size:120%;'>\s*([^\s<]+)\s*<a href='\?name=[^']*'>([^<]+)<\/a>/;
const CTYPE_RE = /\?ctype=([^']+)'>([^<]+)<\/a>/;
const EXP_RE = /\?exp=([^']+)'>([^<]+)<\/a>/;
const COST_RE = /コスト：(\d+)/;
const COMBAT_RE =
  /戦闘力：(\d+)\s*　?支援力：(\d+)\s*　?負傷戦闘力：(\d+)\s*　?負傷支援力：(\d+)/;
const BTYPE_RE = /\?btype=([^']+)'>([^<]+)<\/a>/;
const QUOTE_RE = /font-style:italic;[^>]*>(?:<br \/>)?\s*「([^」]*)」/;

/** Full-width space and tag soup out; the text of one row, line by line. */
function textLines(row: string): string[] {
  return row
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.replace(/[　\s]+/g, " ").trim())
    .filter(Boolean);
}

function symbolsOf(row: string): string[] {
  const line = textLines(row).find((l) => l.startsWith("シンボル："));
  if (!line) return [];
  const head = line.slice("シンボル：".length).split("コスト")[0] ?? "";
  return head
    .split("／")
    .map((s) => s.trim())
    .filter(Boolean);
}

function traitsOf(row: string): string[] {
  const line = textLines(row).find((l) => l.startsWith("特徴："));
  if (!line) return [];
  const head = line.slice("特徴：".length).split("戦闘属性")[0] ?? "";
  return head
    .split("／")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Rules text: whatever sits between the stat block and the flavour line.
 * `【目標】` is kept apart from `【効果】` because the game separates them;
 * a ninja's `《title》` + effect has neither marker and lands in `effect`.
 */
function rulesOf(
  row: string,
  cardType: string,
): { target: string | null; effect: string | null } {
  const lines = textLines(row);
  // The type and the set share one line (`忍 巻ノ壱`) — it is not rules text.
  const skip = new RegExp(
    `^(シンボル：|戦闘力：|特徴：|巻ノ|プロモーション|※${
      cardType ? `|${cardType}(\\s|$)` : ""
    })`,
  );
  const body: string[] = [];
  let seenHead = false;
  for (const line of lines) {
    if (!seenHead) {
      if (/^[忍術作依騎]-\d/.test(line)) seenHead = true;
      continue;
    }
    if (skip.test(line)) continue;
    if (/^「.*」$/.test(line)) continue; // flavour
    body.push(line);
  }
  const target =
    body.find((l) => l.startsWith("【目標】"))?.slice("【目標】".length) ??
    null;
  const effectLines = body.filter((l) => !l.startsWith("【目標】"));
  const effect = effectLines.length
    ? effectLines
        .join(" ")
        .replace(/^【効果】/, "")
        .trim()
    : null;
  return { target: target?.trim() || null, effect: effect || null };
}

export function parseNikitaCardlist(html: string): NikitaCardFacts[] {
  const out: NikitaCardFacts[] = [];
  ROW_RE.lastIndex = 0;
  for (const match of html.matchAll(ROW_RE)) {
    const row = match[1] ?? "";
    const head = HEAD_RE.exec(row);
    if (!head) continue;
    const printedRef = head[1]!.replace(/[　\s]/g, "");
    const name = head[2]!.trim();
    const combat = COMBAT_RE.exec(row);
    const exp = EXP_RE.exec(row);
    const setLabel = exp?.[2]?.trim() ?? null;
    const cardType = CTYPE_RE.exec(row)?.[2]?.trim() ?? "";
    const rules = rulesOf(row, cardType);
    const folded = foldPrintedRef(printedRef);
    const img = IMG_RE.exec(row);
    out.push({
      game: img?.[1]?.toLowerCase() ?? null,
      nikitaKey: img?.[2]?.toUpperCase() ?? null,
      number: narutoDiskCardId(folded),
      printedRef: folded,
      name,
      cardType,
      setLabel,
      setCode: setLabel ? nikitaNrtVolumeSetCode(setLabel) : null,
      symbols: symbolsOf(row),
      cost: COST_RE.exec(row) ? Number(COST_RE.exec(row)![1]) : null,
      power: combat ? Number(combat[1]) : null,
      support: combat ? Number(combat[2]) : null,
      woundedPower: combat ? Number(combat[3]) : null,
      woundedSupport: combat ? Number(combat[4]) : null,
      traits: traitsOf(row),
      battleAttribute: BTYPE_RE.exec(row)?.[2]?.trim() ?? null,
      target: rules.target,
      effect: rules.effect,
      quote: QUOTE_RE.exec(row)?.[1]?.trim() ?? null,
    });
  }
  return out;
}
