/**
 * Étape Sync `ledgers` — (re)produit les ledgers publics d'une op Leclerc
 * sous `data/leclerc/sources/` depuis les pages déclarées ici, chaque fait
 * avec son lien profond :
 *
 * - checklist `leclerc-<set>-checklist.json` : listing Coleka (page vivante,
 *   dumps navigateur en staging, sinon dernière copie Wayback) ;
 * - finitions (`rarity`) : fiche album Paninimania ;
 * - période / seuil / pochette : Paninimania ou article d'annonce ;
 * - scellés `leclerc-<set>-sealed.json` : fiches Coleka des SKU (prix,
 *   date) ;
 * - faces CDN `coleka-cdn-faces.json` → `sets.<set>` quand le listing n'a pas
 *   de « Ref. » (numéros = ordre des fiches, déclaré et sourcé ici).
 *
 * Une lecture partielle n'efface rien : les cartes déjà attestées restent ;
 * une numérotation par ordre n'est écrite que si le compte attendu est
 * atteint (sinon les numéros glisseraient).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";
import { parseColekaItemFacts } from "@/providers/shared/coleka/itemFacts";
import { fetchColekaListingHtml } from "@/providers/shared/coleka/listingFetch";
import {
  colekaListingItems,
  type ColekaListingItem,
} from "@/providers/shared/coleka/listingItems";
import { parseFrenchDayMonthRange } from "@/providers/shared/frenchDateRange";
import {
  fetchPaninimaniaAlbumHtml,
  parsePaninimaniaAlbumFacts,
  type PaninimaniaAlbumFacts,
  type PaninimaniaFinish,
} from "@/providers/shared/paninimania/albumPage";
import { fetchWaybackLatestHtml } from "@/providers/shared/wayback/latestHtml";

import type {
  LeclercChecklist,
  LeclercChecklistCard,
} from "./buildFromLedgers";
import type { ColekaCdnFacesLedger } from "./colekaLeclercFaces";
import { leclercSourcePath, leclercSyncedSourcePath } from "./curatedPaths";
import { leclercFamilyMeta, leclercOpForSetCode } from "./pack";
import {
  COLEKA_LECLERC_LANG,
  COLEKA_LECLERC_ORIGIN,
  COLEKA_LECLERC_SOURCE_ID,
  colekaLeclercFaceUrl,
  colekaLeclercListingForSet,
  colekaLeclercListingRefToNumber,
  colekaLeclercListingUrl,
  parseColekaLeclercListing,
  type ColekaLeclercCard,
} from "./parseColekaLeclerc";
import {
  LECLERC_LEDGER_SOURCES,
  leclercLedgerSourceSpec,
  type LeclercLedgerSourceSpec,
} from "./ledgerSources";
import { leclercSetLabel } from "./printKey";
import { leclercCampaignTitle } from "./sealedSeed";

export { LECLERC_LEDGER_SOURCES, leclercLedgerSourceSpec };

// ── Construction (pure) ──────────────────────────────────────────────────

/** « Images Pailletées » → `pailletee` (libellé Paninimania, singulier). */
export function leclercFinishRarity(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^images?\s+/, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/s$/, "");
}

function absoluteColekaHref(href: string): string {
  return href.startsWith("http") ? href : `${COLEKA_LECLERC_ORIGIN}${href}`;
}

function colekaItemId(href: string): number | null {
  const m = href.match(/_i(\d+)(?:[/?#]|$)/);
  return m ? Number(m[1]) : null;
}

export type LeclercBuiltCard = LeclercChecklistCard & { faceUrl?: string };

/**
 * Fiches sans « Ref. » → n° par ordre d'identifiant Coleka, hors SKU scellés
 * déclarés. `null` si le compte attendu n'est pas atteint.
 */
export function leclercCardsByColekaItemOrder(
  items: readonly ColekaListingItem[],
  opts: { excludeHrefs: readonly string[]; expectedCount: number },
): LeclercBuiltCard[] | null {
  const excluded = new Set(
    opts.excludeHrefs.map((h) => colekaItemId(h)).filter((n) => n != null),
  );
  const byId = new Map<number, ColekaListingItem>();
  for (const item of items) {
    const id = Number(item.id) || colekaItemId(item.href);
    if (!id || excluded.has(id)) continue;
    byId.set(id, item);
  }
  if (byId.size !== opts.expectedCount) return null;
  return [...byId.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, item], i) => ({
      number: String(i + 1).padStart(3, "0"),
      name: item.title,
      kind: "card" as const,
      href: absoluteColekaHref(item.href),
      ...(item.thumbUrl
        ? { faceUrl: colekaLeclercFaceUrl(item.thumbUrl) }
        : {}),
    }));
}

export function leclercCardsFromListingCards(
  cards: readonly ColekaLeclercCard[],
): LeclercBuiltCard[] {
  return cards.map((c) => ({
    number: c.number,
    name: c.name,
    kind: c.kind,
    href: c.pageUrl,
  }));
}

/** `rarity` = finition Paninimania ; les cartes hors liste n'en ont pas. */
export function applyLeclercFinishes(
  cards: readonly LeclercChecklistCard[],
  finishes: readonly PaninimaniaFinish[],
  toNumber: (raw: string) => string | null,
): LeclercChecklistCard[] {
  const rarityByNumber = new Map<string, string>();
  for (const finish of finishes) {
    const rarity = leclercFinishRarity(finish.label);
    for (const raw of finish.numbers) {
      const n = toNumber(raw);
      if (n) rarityByNumber.set(n, rarity);
    }
  }
  return cards.map((card) => {
    const { rarity: _old, ...rest } = card;
    const rarity = rarityByNumber.get(card.number);
    return rarity ? { ...rest, rarity } : rest;
  });
}

/**
 * Lecture produite ∪ ledger existant : les cartes absentes de la lecture
 * restent (lecture partielle), `aka` et `rarity` attestés aussi ; le nom lu
 * remplace un stub (`note`). Les finitions relues s'appliquent après.
 */
export function mergeLeclercChecklistCards(
  existing: readonly LeclercChecklistCard[],
  produced: readonly LeclercChecklistCard[],
): LeclercChecklistCard[] {
  const by = new Map<string, LeclercChecklistCard>();
  for (const card of existing) by.set(card.number, card);
  for (const card of produced) {
    const prev = by.get(card.number);
    by.set(card.number, {
      ...card,
      ...(prev?.aka?.length ? { aka: prev.aka } : {}),
      ...(card.rarity == null && prev?.rarity ? { rarity: prev.rarity } : {}),
    });
  }
  return [...by.values()].sort((a, b) => a.number.localeCompare(b.number));
}

function checklistCoverage(cards: readonly LeclercChecklistCard[]) {
  const fixeez = cards.filter((c) => c.kind === "fixeez");
  return {
    namedCards: cards.filter((c) => !c.note).length,
    placeholderCards: cards.filter((c) => Boolean(c.note)).length,
    fixeez: fixeez.length,
    fixeezNamed: fixeez.filter((c) => !c.note).length,
  };
}

function setBlock(setCode: string): LeclercChecklist["set"] {
  const label = leclercSetLabel(setCode);
  const year = Number(label.match(/^(\d{4})\b/)?.[1]) || undefined;
  const op = leclercOpForSetCode(setCode);
  return {
    code: setCode,
    label,
    ...(year ? { year } : {}),
    ...(op ? { franchise: leclercFamilyMeta(op.family).labelFr } : {}),
  };
}

export type LeclercOperationFacts = {
  start?: string;
  end?: string;
  packSize?: number;
  thresholdEur?: number;
  albumEur?: number;
  albumTitle?: string;
  /** Source de la période (et des champs sans entrée dans `sources`). */
  source: string;
  /** Source par champ quand elle diffère de `source`. */
  sources?: Record<string, string>;
};

export function leclercOperationFromPaninimania(
  facts: PaninimaniaAlbumFacts,
  url: string,
): LeclercOperationFacts | null {
  const op: LeclercOperationFacts = { source: url };
  if (facts.operation) Object.assign(op, facts.operation);
  if (facts.packSize) op.packSize = facts.packSize;
  if (facts.thresholdEur) op.thresholdEur = facts.thresholdEur;
  if (facts.albumEur) op.albumEur = facts.albumEur;
  return Object.keys(op).length > 1 ? op : null;
}

/** Article d'annonce : « du 24 octobre au 9 décembre », « tous les 30 € ». */
export function leclercOperationFromAnnouncement(
  html: string,
  url: string,
): LeclercOperationFacts | null {
  const body = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
  const year = Number(url.match(/\/(20\d{2})\/\d{2}\//)?.[1]) || undefined;
  const range = parseFrenchDayMonthRange(text, year);
  const threshold = text.match(/tous les (\d+)\s*€/i)?.[1];
  const op: LeclercOperationFacts = { source: url };
  if (range) Object.assign(op, range);
  if (threshold) op.thresholdEur = Number(threshold);
  return Object.keys(op).length > 1 ? op : null;
}

export function buildLeclercChecklistLedger(input: {
  setCode: string;
  source: string;
  url: string;
  cards: readonly LeclercChecklistCard[];
  existing?: (LeclercChecklist & Record<string, unknown>) | null;
  operation?: LeclercOperationFacts | null;
  numbering?: { printed: false; note: string; source: string };
  raritySource?: { url: string; fetchedAt: string; note: string } | null;
}): LeclercChecklist & Record<string, unknown> {
  const existing = input.existing ?? null;
  const cards = [...input.cards];
  return {
    ...(existing ?? {}),
    source: input.source,
    url: input.url,
    set: { ...(existing?.set ?? {}), ...setBlock(input.setCode) },
    coverage: {
      ...((existing?.coverage as Record<string, unknown> | undefined) ?? {}),
      ...checklistCoverage(cards),
    },
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.numbering ? { numbering: input.numbering } : {}),
    ...(input.raritySource ? { raritySource: input.raritySource } : {}),
    cards,
  };
}

export type LeclercSealedItemRead = {
  url: string;
  /** Page lue (vivante, ou copie Wayback) — la citation. */
  citationUrl: string;
  retailPriceCents: number | null;
  releaseDate: string | null;
};

export type LeclercSealedLedgerRow = {
  slug: string;
  priceCents?: number | null;
  citations?: Record<string, string>;
};

/**
 * Champs d'opération tirés des scellés : taille de pochette (déclarée et
 * citée), prix du coffret / album (fiche Coleka lue), titre de campagne.
 */
export function enrichLeclercOperation(
  operation: LeclercOperationFacts,
  setCode: string,
  spec: LeclercLedgerSourceSpec,
  items: ReadonlyMap<string, LeclercSealedItemRead>,
): LeclercOperationFacts {
  const out: LeclercOperationFacts = {
    ...operation,
    sources: { ...(operation.sources ?? {}) },
  };
  const pochette = spec.sealed?.products.find((p) => p.kind === "booster");
  if (out.packSize == null && pochette?.cardsPerPack != null) {
    out.packSize = pochette.cardsPerPack;
    const cite = pochette.citations?.cardsPerPack;
    if (cite) out.sources!.packSize = cite;
  }
  const album = spec.sealed?.products.find((p) => p.category === "albums");
  const read = album?.colekaItem ? items.get(album.colekaItem) : undefined;
  if (out.albumEur == null && read?.retailPriceCents != null) {
    out.albumEur = read.retailPriceCents / 100;
    out.sources!.albumEur = read.citationUrl;
  }
  if (out.start == null && read?.releaseDate) {
    out.start = read.releaseDate;
    out.sources!.start = read.citationUrl;
  }
  out.albumTitle ??= leclercCampaignTitle(setCode);
  if (!Object.keys(out.sources!).length) delete out.sources;
  return out;
}

export function buildLeclercSealedLedger(input: {
  setCode: string;
  spec: NonNullable<LeclercLedgerSourceSpec["sealed"]>;
  checklistCount: number;
  items: ReadonlyMap<string, LeclercSealedItemRead>;
  observed: string;
  /** Ledger précédent : un prix attesté reste si la fiche n'a pas été relue. */
  previous?: readonly LeclercSealedLedgerRow[];
  notes?: readonly string[];
}) {
  const products = input.spec.products.map((sku) => {
    const read = sku.colekaItem ? input.items.get(sku.colekaItem) : undefined;
    const prev = input.previous?.find((p) => p.slug === sku.slug);
    const citations: Record<string, string> = { ...(sku.citations ?? {}) };
    if (sku.colekaItem) citations.packshot = sku.colekaItem;
    let priceCents: number | null = null;
    if (sku.priceFromColeka && read?.retailPriceCents != null) {
      priceCents = read.retailPriceCents;
      citations.priceCents = read.citationUrl;
    } else if (sku.priceFromColeka && !read && prev?.priceCents != null) {
      priceCents = prev.priceCents;
      if (prev.citations?.priceCents) {
        citations.priceCents = prev.citations.priceCents;
      }
    }
    return {
      slug: sku.slug,
      kind: sku.kind,
      category: sku.category,
      name: sku.name,
      declaredCardCount:
        sku.declaredCardCount === "checklist"
          ? input.checklistCount || null
          : sku.declaredCardCount,
      ...(sku.cardsPerPack != null ? { cardsPerPack: sku.cardsPerPack } : {}),
      priceCents,
      ...(sku.packComposition !== undefined
        ? { packComposition: sku.packComposition }
        : {}),
      citations,
    };
  });
  return {
    sourceId: input.spec.sourceId,
    lang: COLEKA_LECLERC_LANG,
    setCode: input.setCode,
    observed: input.observed,
    note:
      input.notes?.join(" ") ||
      "Produit par la Sync Leclerc (étape ledgers) ; citations par SKU.",
    products,
  };
}

/** `sets.<set>` du ledger CDN, autres sets inchangés. */
export function withLeclercCdnFacesBlock(
  ledger: ColekaCdnFacesLedger | null,
  setCode: string,
  cards: readonly LeclercBuiltCard[],
): ColekaCdnFacesLedger {
  const block: Record<string, string> = {};
  for (const card of cards) {
    if (card.faceUrl) block[card.number] = card.faceUrl;
  }
  const base: ColekaCdnFacesLedger = ledger ?? {
    source: "thumbs.coleka.com — vignettes des listings Coleka",
    sourceId: COLEKA_LECLERC_SOURCE_ID,
    lang: COLEKA_LECLERC_LANG,
    sets: {},
  };
  return { ...base, sets: { ...base.sets, [setCode]: block } };
}

// ── Lecture réseau + écriture ────────────────────────────────────────────

export type LeclercPageRead = { html: string; citationUrl: string };

export type LeclercLedgerSyncDeps = {
  /** Page Coleka (listing ou fiche) : vivante, sinon dernière copie Wayback. */
  fetchColekaPage: (
    url: string,
    cacheFile: string,
  ) => Promise<LeclercPageRead | null>;
  fetchPaninimania: (url: string) => Promise<string | null>;
  fetchText: (url: string) => Promise<string | null>;
  stagingDir: (setCode: string) => string;
  readJson: <T>(file: string) => T | null;
  writeJson: (file: string, value: unknown) => void;
  readSource: (name: string) => string;
  writeSource: (name: string) => string;
  today: () => string;
};

async function defaultFetchColekaPage(
  url: string,
  cacheFile: string,
): Promise<LeclercPageRead | null> {
  const live = await fetchColekaListingHtml(url, cacheFile, false);
  if (live) return { html: live, citationUrl: url };
  const archived = await fetchWaybackLatestHtml(url);
  return archived
    ? { html: archived.html, citationUrl: archived.citationUrl }
    : null;
}

async function defaultFetchText(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      responseType: "text",
      timeout: 30_000,
      validateStatus: (s) => s === 200,
    });
    return String(res.data);
  } catch {
    return null;
  }
}

const DEFAULT_DEPS: LeclercLedgerSyncDeps = {
  fetchColekaPage: defaultFetchColekaPage,
  fetchPaninimania: fetchPaninimaniaAlbumHtml,
  fetchText: defaultFetchText,
  stagingDir: (setCode) => {
    const op = leclercOpForSetCode(setCode);
    return path.join(
      packStagingDir(op?.packId ?? `leclerc/${setCode}`),
      "coleka-faces",
    );
  },
  readJson: <T>(file: string): T | null => {
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      return null;
    }
  },
  writeJson: (file, value) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  },
  readSource: leclercSourcePath,
  writeSource: leclercSyncedSourcePath,
  today: () => new Date().toISOString().slice(0, 10),
};

/** Dumps navigateur déjà en staging (`listing-N.html`, `listing-nbpp.html`). */
function stagingListingHtml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^listing-(?:\d+|nbpp)\.html$/.test(f))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"));
}

export type LeclercLedgerSyncReport = {
  setCode: string;
  checklist: { file: string; cards: number; rarities: number } | null;
  sealed: { file: string; products: number; prices: number } | null;
  cdnFaces: number | null;
  skipped: string[];
};

export async function syncLeclercLedgers(
  setCode: string,
  overrides: Partial<LeclercLedgerSyncDeps> = {},
): Promise<LeclercLedgerSyncReport | null> {
  const code = setCode.trim().toLowerCase();
  const spec = leclercLedgerSourceSpec(code);
  const listing = colekaLeclercListingForSet(code);
  if (!spec || !listing) return null;
  const deps = { ...DEFAULT_DEPS, ...overrides };
  const report: LeclercLedgerSyncReport = {
    setCode: code,
    checklist: null,
    sealed: null,
    cdnFaces: null,
    skipped: [],
  };
  const staging = deps.stagingDir(code);
  const listingUrl = colekaLeclercListingUrl(listing, 1);
  const page = await deps.fetchColekaPage(
    listingUrl,
    path.join(staging, "listing-0.html"),
  );

  // Cartes lues.
  let built: LeclercBuiltCard[] = [];
  const listingCitation = page?.citationUrl ?? listingUrl;
  if (spec.numbering === "colekaItemOrder") {
    const items = page ? colekaListingItems(page.html) : [];
    const cards = leclercCardsByColekaItemOrder(items, {
      excludeHrefs: (spec.sealed?.products ?? [])
        .map((p) => p.colekaItem)
        .filter((h): h is string => Boolean(h)),
      expectedCount: spec.expectedCount ?? -1,
    });
    if (cards) built = cards;
    else report.skipped.push(`listing incomplet (${items.length} fiches lues)`);
  } else {
    const htmls = [
      ...stagingListingHtml(staging),
      ...(page ? [page.html] : []),
    ];
    const byNumber = new Map<string, ColekaLeclercCard>();
    for (const html of htmls) {
      for (const card of parseColekaLeclercListing(html, code).cards) {
        byNumber.set(card.number, card);
      }
    }
    built = leclercCardsFromListingCards([...byNumber.values()]);
  }

  // Finitions + opération (Paninimania).
  const checklistFile = "leclerc-" + code + "-checklist.json";
  const existing = deps.readJson<LeclercChecklist & Record<string, unknown>>(
    deps.readSource(checklistFile),
  );
  let cards = mergeLeclercChecklistCards(
    existing?.cards ?? [],
    built.map(({ faceUrl: _f, ...c }) => c),
  );
  let raritySource: { url: string; fetchedAt: string; note: string } | null =
    null;
  let operation: LeclercOperationFacts | null = null;
  if (spec.paninimania) {
    const html = await deps.fetchPaninimania(spec.paninimania);
    if (html) {
      const facts = parsePaninimaniaAlbumFacts(html);
      operation = leclercOperationFromPaninimania(facts, spec.paninimania);
      if (facts.finishes.length) {
        cards = applyLeclercFinishes(cards, facts.finishes, (raw) =>
          colekaLeclercListingRefToNumber(raw),
        );
        raritySource = {
          url: spec.paninimania,
          fetchedAt: deps.today(),
          note: `Finitions de la fiche album Paninimania : ${facts.finishes.map((f) => f.label).join(", ")}`,
        };
      }
    } else {
      report.skipped.push("Paninimania injoignable — finitions inchangées");
    }
  }
  if (spec.announcement && !operation) {
    const html = await deps.fetchText(spec.announcement);
    if (html)
      operation = leclercOperationFromAnnouncement(html, spec.announcement);
  }

  // Fiches Coleka des SKU scellés (prix, date).
  const items = new Map<string, LeclercSealedItemRead>();
  for (const sku of spec.sealed?.products ?? []) {
    if (!sku.colekaItem || !sku.priceFromColeka) continue;
    const id = colekaItemId(sku.colekaItem) ?? sku.slug;
    const read = await deps.fetchColekaPage(
      sku.colekaItem,
      path.join(staging, `item-${id}.html`),
    );
    if (!read) {
      report.skipped.push(`fiche ${sku.slug} illisible`);
      continue;
    }
    items.set(sku.colekaItem, {
      url: sku.colekaItem,
      citationUrl: read.citationUrl,
      ...parseColekaItemFacts(read.html),
    });
  }
  if (operation) {
    operation = enrichLeclercOperation(operation, code, spec, items);
  }

  if (built.length || raritySource) {
    const ledger = buildLeclercChecklistLedger({
      setCode: code,
      source:
        page && page.citationUrl !== listingUrl
          ? "coleka.com listing rubrique — copie Wayback"
          : "coleka.com listing rubrique (page vivante + dumps navigateur en staging)",
      url: listingCitation,
      cards,
      existing,
      operation,
      ...(spec.numberingSource
        ? {
            numbering: {
              printed: false as const,
              note: spec.numberingSource.note,
              source: spec.numberingSource.url,
            },
          }
        : {}),
      raritySource,
    });
    const file = deps.writeSource(checklistFile);
    deps.writeJson(file, ledger);
    report.checklist = {
      file,
      cards: ledger.cards.length,
      rarities: ledger.cards.filter((c) => c.rarity).length,
    };
  }

  if (spec.cdnFaces && built.some((c) => c.faceUrl)) {
    const cdnName = "coleka-cdn-faces.json";
    const next = withLeclercCdnFacesBlock(
      deps.readJson<ColekaCdnFacesLedger>(deps.readSource(cdnName)),
      code,
      built,
    );
    deps.writeJson(deps.writeSource(cdnName), next);
    report.cdnFaces = Object.keys(next.sets[code] ?? {}).length;
  }

  if (spec.sealed) {
    const sealedName = `leclerc-${code}-sealed.json`;
    const previous = deps.readJson<{ products?: LeclercSealedLedgerRow[] }>(
      deps.readSource(sealedName),
    );
    const ledger = buildLeclercSealedLedger({
      setCode: code,
      spec: spec.sealed,
      checklistCount: report.checklist?.cards ?? 0,
      items,
      observed: deps.today(),
      previous: previous?.products ?? [],
      notes: [
        ...(operation
          ? [
              `Période ${operation.start ?? "?"} → ${operation.end ?? "?"} : ${operation.source}.`,
            ]
          : []),
        ...[...items.values()].map(
          (r) => `Fiche ${r.url} lue via ${r.citationUrl}.`,
        ),
      ],
    });
    const file = deps.writeSource(sealedName);
    deps.writeJson(file, ledger);
    report.sealed = {
      file,
      products: ledger.products.length,
      prices: ledger.products.filter((p) => p.priceCents != null).length,
    };
  }
  return report;
}
