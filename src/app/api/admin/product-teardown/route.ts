import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanCode, detectPlatformKey } from "@/lib/barcode/query";
import { resolveBarcode } from "@/services/barcodeResolver";
import {
  cleanSearchQuery,
  explainAttachmentScoreForDisplay,
  readAttachmentImageMetrics,
  type MetadataResult,
} from "@/services/metadata";
import {
  buildTeardownBarcodeProviderTasks,
  buildTeardownMetadataProviderTasks,
} from "@/services/providerTeardown";

type ProviderPhase = "barcode" | "metadata" | "merged";
type ProviderStatus = "hit" | "empty" | "error" | "skipped";

type ProviderField = {
  field: string;
  value: string;
  confidence?: number;
};

type CoverSelectionCandidate = {
  url: string;
  type: string;
  source?: string;
  role?: string;
  score: number;
  selected: boolean;
  signals: string[];
  width?: number;
  height?: number;
  aspectRatio?: number;
  format?: string;
};

type CoverSelectionAudit = {
  selectedUrl: string | null;
  candidates: CoverSelectionCandidate[];
};

type ProviderContribution = {
  provider: string;
  phase: ProviderPhase;
  status: ProviderStatus;
  durationMs: number;
  fields: ProviderField[];
  products: Array<{
    name: string;
    coverUrl?: string | null;
    platformKey?: string | null;
  }>;
  error?: string;
  rawSample?: unknown;
  coverSelection?: CoverSelectionAudit;
};

type NameBlockKind =
  | "title"
  | "platform"
  | "edition"
  | "region"
  | "format"
  | "condition"
  | "year"
  | "noise";

type NameBlock = {
  kind: NameBlockKind;
  text: string;
  reason: string;
};

const ALL_METADATA_TYPES = ["games", "books", "movies", "musics", "boardgames"];

function normalizeProviderToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseProviderSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .filter((entry) => {
      const normalized = normalizeProviderToken(entry);
      return normalized !== "all" && normalized !== "default";
    });
}

function shouldRunSelectedProvider(
  providerLabel: string,
  selectedProviders: string[],
) {
  if (selectedProviders.length === 0) return true;
  const selected = selectedProviders
    .map(normalizeProviderToken)
    .filter(Boolean);
  if (selected.length === 0) return true;
  const full = normalizeProviderToken(providerLabel);
  const base = normalizeProviderToken(
    providerLabel.split(":")[0] || providerLabel,
  );

  return selected.some(
    (token) =>
      token === full ||
      token === base ||
      full.includes(token) ||
      base.includes(token),
  );
}

const BLOCK_PATTERNS: Array<{
  kind: NameBlockKind;
  reason: string;
  pattern: RegExp;
}> = [
  {
    kind: "platform",
    reason: "plateforme detectee",
    pattern:
      /\b(nintendo switch|switch|playstation 5|playstation 4|playstation 3|playstation 2|playstation 1|ps5|ps4|ps3|ps2|ps1|xbox series x|xbox series s|xbox series|xbox one|xbox 360|xbox original|xbox|wii u|wiiu|wii|nintendo 3ds|3ds|nintendo ds|ds|gamecube|dreamcast|pc|windows|snes|nes|n64|game boy advance|game boy color|game boy|gba|gbc)\b/gi,
  },
  {
    kind: "edition",
    reason: "edition commerciale",
    pattern:
      /\b(classics|platinum|essential|essentials|players choice|player's choice|greatest hits|nintendo selects|best of|collector|collectors|limited|limitee|limitee|edition|edition collector|edition limitee|edition limitee)\b/gi,
  },
  {
    kind: "condition",
    reason: "etat ou wording d'annonce",
    pattern:
      /\b(neuf sous blister|sous blister|avec notice|sans notice|avec livret|sans livret|neuf|occasion|scelle|scelle|blister|cib|loose|bon etat|tres bon etat|excellent etat|comme neuf|complet|complete|tested|working|fonctionnel|tbe|hs|brand new|sealed|like new|very good|zustand gut|zustand neu|gebraucht|ovp|nuovo|usato|sigillato)\b/gi,
  },
  {
    kind: "format",
    reason: "format physique",
    pattern:
      /\b(blu-ray|bluray|dvd|vhs|cd|k7|cassette|disc|disque|boite|boite|box|vinyle|vinyl|lp)\b/gi,
  },
  {
    kind: "region",
    reason: "region ou langue",
    pattern:
      /\b(pal fr|pal vf|pal|ntsc|secam|vf|fr|fra|fre|en|eng|de|ger|it|ita|es|spa|eu|eur|us|usa|uk|jp|jpn|region free)\b/gi,
  },
  {
    kind: "year",
    reason: "annee",
    pattern: /\b(19|20)\d{2}\b/g,
  },
  {
    kind: "noise",
    reason: "prefixe generique",
    pattern: /\b(jeu video|jeux video|jeu pour|game for|jeu|game|pour|for)\b/gi,
  },
];

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortValue(value: unknown, max = 160): string {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function sampleRaw(value: unknown): unknown {
  if (!value) return null;
  const json = JSON.stringify(value);
  if (!json || json.length <= 4000) return value;
  return `${json.slice(0, 4000)}...`;
}

function isPresent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && cleanText(value).length > 0;
}

function analyzeName(rawName: string) {
  const raw = cleanText(rawName);
  const cleanName = cleanSearchQuery(raw) || raw;
  const matches: Array<NameBlock & { start: number; end: number }> = [];

  for (const entry of BLOCK_PATTERNS) {
    for (const match of raw.matchAll(entry.pattern)) {
      const text = cleanText(match[0]);
      if (!text) continue;
      matches.push({
        kind: entry.kind,
        text,
        reason: entry.reason,
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
      });
    }
  }

  const selected = matches
    .sort((a, b) => {
      const lengthDiff = b.end - b.start - (a.end - a.start);
      if (lengthDiff !== 0) return lengthDiff;
      return a.start - b.start;
    })
    .reduce<typeof matches>((kept, candidate) => {
      const overlaps = kept.some(
        (item) => candidate.start < item.end && candidate.end > item.start,
      );
      return overlaps ? kept : [...kept, candidate];
    }, [])
    .sort((a, b) => a.start - b.start);

  const blocks: NameBlock[] = [];
  let cursor = 0;
  for (const block of selected) {
    const before = cleanText(raw.slice(cursor, block.start));
    if (before && /[a-z0-9]/i.test(before)) {
      blocks.push({
        kind: "title",
        text: before.replace(/^[-–—|:+/()[\]\s]+|[-–—|:+/()[\]\s]+$/g, ""),
        reason: "nom potentiel",
      });
    }
    blocks.push({
      kind: block.kind,
      text: block.text,
      reason: block.reason,
    });
    cursor = block.end;
  }

  const after = cleanText(raw.slice(cursor));
  if (after && /[a-z0-9]/i.test(after)) {
    blocks.push({
      kind: "title",
      text: after.replace(/^[-–—|:+/()[\]\s]+|[-–—|:+/()[\]\s]+$/g, ""),
      reason: "nom potentiel",
    });
  }

  const nonEmptyBlocks = blocks.filter((block) => block.text);

  return {
    rawName: raw,
    cleanName,
    platformKey: detectPlatformKey(raw),
    blocks:
      nonEmptyBlocks.length > 0
        ? nonEmptyBlocks
        : [
            {
              kind: "title" as const,
              text: cleanName,
              reason: "nom potentiel",
            },
          ],
  };
}

function metadataFields(metadata: MetadataResult | null): ProviderField[] {
  if (!metadata) return [];
  const fields: ProviderField[] = [];
  const push = (field: string, value: unknown, confidence?: number) => {
    if (!isPresent(value)) return;
    fields.push({ field, value: shortValue(value), confidence });
  };

  push("title", metadata.title);
  push("description", metadata.description);
  push("releaseDate", metadata.releaseDate);
  push("imageUrl", metadata.imageUrl);
  push("duration", metadata.duration);
  push("pageCount", metadata.pageCount);
  push("tracksCount", metadata.tracksCount);
  push("authors", metadata.authors?.map((item) => item.name).join(", "));
  push("publishers", metadata.publishers?.map((item) => item.name).join(", "));
  push("aliases", metadata.aliases?.join(", "));

  for (const fact of metadata.facts || []) {
    const label = fact.label ? `${fact.kind}:${fact.label}` : fact.kind;
    push(label, fact.value, fact.confidence);
  }

  const attachmentsByType = new Map<string, number>();
  for (const attachment of metadata.attachments || []) {
    attachmentsByType.set(
      attachment.type,
      (attachmentsByType.get(attachment.type) || 0) + 1,
    );
  }
  for (const [type, count] of attachmentsByType) {
    push(`attachments:${type}`, `${count}`);
  }

  return fields;
}

function metadataProducts(metadata: MetadataResult | null) {
  if (!metadata?.title) return [];
  return [
    {
      name: metadata.title,
      coverUrl: metadata.imageUrl,
      platformKey: metadata.platformKey,
    },
  ];
}

async function metadataCoverSelection(
  metadata: MetadataResult | null,
): Promise<CoverSelectionAudit | undefined> {
  if (!metadata) return undefined;

  const candidates = [
    ...(metadata.imageUrl
      ? [
          {
            type: "cover" as const,
            url: metadata.imageUrl,
            role: "selected-image",
            source: "metadata.imageUrl",
          },
        ]
      : []),
    ...(metadata.attachments || []),
  ].filter((candidate) => Boolean(candidate.url));

  if (candidates.length === 0) return undefined;

  const uniqueCandidates = candidates.filter(
    (candidate, index, list) =>
      index ===
      list.findIndex(
        (entry) =>
          entry.url === candidate.url &&
          entry.type === candidate.type &&
          cleanText(entry.role || "").toLowerCase() ===
            cleanText(candidate.role || "").toLowerCase(),
      ),
  );

  const scored = await Promise.all(
    uniqueCandidates.map(async (candidate, index) => {
      const metrics = await readAttachmentImageMetrics(candidate.url);
      const details = explainAttachmentScoreForDisplay(candidate, metrics);
      return {
        ...candidate,
        ...details,
        index,
      };
    }),
  );

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const selectedUrl = metadata.imageUrl || scored[0]?.url || null;

  return {
    selectedUrl,
    candidates: scored.map((candidate) => ({
      url: candidate.url,
      type: candidate.type,
      source: candidate.source || undefined,
      role: candidate.role || undefined,
      score: candidate.score,
      selected: Boolean(selectedUrl) && candidate.url === selectedUrl,
      signals: candidate.signals,
      width: candidate.width,
      height: candidate.height,
      aspectRatio: candidate.aspectRatio,
      format: candidate.format,
    })),
  };
}

function productFields(
  products: Array<{ name?: string; coverUrl?: string | null }>,
) {
  const fields: ProviderField[] = [];
  if (products.length > 0) {
    fields.push({ field: "names", value: String(products.length) });
  }
  const covers = products.filter((product) => product.coverUrl).length;
  if (covers > 0) {
    fields.push({ field: "covers", value: String(covers) });
  }
  return fields;
}

function centsLabel(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${(value / 100).toFixed(2)} EUR`;
}

function priceFields(raw: unknown): ProviderField[] {
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return [];

  const data = item as Record<string, unknown>;
  const fields: ProviderField[] = [];
  const priceNew = centsLabel(data.priceNew);
  const priceUsed = centsLabel(data.priceUsed);
  const priceUsedCIB = centsLabel(data.priceUsedCIB);

  if (priceNew) fields.push({ field: "priceNew", value: priceNew });
  if (priceUsed) fields.push({ field: "priceUsed", value: priceUsed });
  if (priceUsedCIB) fields.push({ field: "priceUsedCIB", value: priceUsedCIB });
  if (isPresent(data.offerCount)) {
    fields.push({ field: "offerCount", value: shortValue(data.offerCount) });
  }
  if (isPresent(data.merchantName)) {
    fields.push({
      field: "merchantName",
      value: shortValue(data.merchantName),
    });
  }
  if (isPresent(data.sourceUrl)) {
    fields.push({ field: "sourceUrl", value: shortValue(data.sourceUrl, 240) });
  }
  if (isPresent(data.matchedQuery)) {
    fields.push({
      field: "matchedQuery",
      value: shortValue(data.matchedQuery),
    });
  }

  return fields;
}

async function runProvider(
  provider: string,
  phase: ProviderPhase,
  fn: () => Promise<unknown>,
): Promise<ProviderContribution> {
  const start = Date.now();
  try {
    const raw = await fn();
    const durationMs = Date.now() - start;

    if (phase === "metadata" || phase === "merged") {
      const metadata = raw as MetadataResult | null;
      const fields = metadataFields(metadata);
      const coverSelection = await metadataCoverSelection(metadata);
      return {
        provider,
        phase,
        status: fields.length > 0 ? "hit" : "empty",
        durationMs,
        fields,
        products: metadataProducts(metadata),
        rawSample: sampleRaw(raw),
        coverSelection,
      };
    }

    const products = normalizeBarcodeProducts(raw);
    const fields = [...productFields(products), ...priceFields(raw)];
    return {
      provider,
      phase,
      status: products.length > 0 || fields.length > 0 ? "hit" : "empty",
      durationMs,
      fields,
      products,
      rawSample: sampleRaw(raw),
    };
  } catch (error: any) {
    return {
      provider,
      phase,
      status: "error",
      durationMs: Date.now() - start,
      fields: [],
      products: [],
      error: error?.message || "Provider failed",
    };
  }
}

function normalizeBarcodeProducts(
  raw: unknown,
): ProviderContribution["products"] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item: any) => {
        const platformName = cleanText(item?.igdb_metadata?.platform?.name);
        return {
          name: cleanText(
            item?.name ||
              item?.title ||
              item?.cleanName ||
              item?.productName ||
              item?.igdb_metadata?.name,
          ),
          coverUrl: item?.coverUrl || item?.imageUrl || null,
          platformKey:
            item?.platformKey ||
            (platformName ? detectPlatformKey(platformName) : null) ||
            null,
        };
      })
      .filter((item) => item.name);
  }

  const item = raw as any;
  const platformName = cleanText(item?.igdb_metadata?.platform?.name);
  const name = cleanText(
    item.name ||
      item.title ||
      item.cleanName ||
      item.productName ||
      item.igdb_metadata?.name,
  );
  return name
    ? [
        {
          name,
          coverUrl: item.coverUrl || item.imageUrl || null,
          platformKey:
            item.platformKey ||
            (platformName ? detectPlatformKey(platformName) : null) ||
            null,
        },
      ]
    : [];
}

async function runBarcodeProviders(
  barcode: string,
  type: string | null,
  nameCandidates: string[] = [],
  selectedProviders: string[] = [],
) {
  const tasks = buildTeardownBarcodeProviderTasks({
    barcode,
    type,
    nameCandidates,
  });
  return Promise.all(
    tasks
      .filter((task) =>
        shouldRunSelectedProvider(task.providerLabel, selectedProviders),
      )
      .map((task) => runProvider(task.providerLabel, task.phase, task.run)),
  );
}

async function runMetadataProvidersForType(
  name: string,
  type: string,
  barcode: string | null,
  platform: string | null,
  includeTypeInLabel: boolean,
  selectedProviders: string[],
) {
  const tasks = buildTeardownMetadataProviderTasks({
    name,
    type,
    barcode,
    platform,
    includeTypeInLabel,
  });
  return Promise.all(
    tasks
      .filter((task) =>
        shouldRunSelectedProvider(task.providerLabel, selectedProviders),
      )
      .map((task) => runProvider(task.providerLabel, task.phase, task.run)),
  );
}

async function runMetadataProviders(
  name: string,
  type: string | null,
  barcode: string | null,
  platform: string | null,
  selectedProviders: string[] = [],
) {
  if (!name) return [];
  const types = type ? [type] : ALL_METADATA_TYPES;
  const results = await Promise.all(
    types.map((metadataType) =>
      runMetadataProvidersForType(
        name,
        metadataType,
        barcode,
        platform,
        !type,
        selectedProviders,
      ),
    ),
  );
  return results.flat();
}

function buildCoverage(providers: ProviderContribution[]) {
  const coverage = new Map<
    string,
    {
      field: string;
      providers: Set<string>;
      values: Set<string>;
      confidence: number;
    }
  >();

  for (const provider of providers) {
    if (provider.status !== "hit") continue;
    for (const field of provider.fields) {
      const entry =
        coverage.get(field.field) ||
        ({
          field: field.field,
          providers: new Set<string>(),
          values: new Set<string>(),
          confidence: 0,
        } satisfies {
          field: string;
          providers: Set<string>;
          values: Set<string>;
          confidence: number;
        });
      entry.providers.add(provider.provider);
      entry.values.add(field.value);
      entry.confidence = Math.max(entry.confidence, field.confidence || 0);
      coverage.set(field.field, entry);
    }
  }

  return Array.from(coverage.values())
    .map((entry) => ({
      field: entry.field,
      providers: Array.from(entry.providers),
      values: Array.from(entry.values).slice(0, 4),
      confidence: entry.confidence || undefined,
    }))
    .sort((a, b) => a.field.localeCompare(b.field));
}

function buildGaps(
  coverage: ReturnType<typeof buildCoverage>,
  type: string | null,
) {
  const byField = new Map(coverage.map((field) => [field.field, field]));
  const gaps: string[] = [];
  const requireField = (field: string, label = field) => {
    if (!byField.has(field)) gaps.push(`${label}: aucune source`);
    else if ((byField.get(field)?.providers.length || 0) === 1) {
      gaps.push(`${label}: une seule source`);
    }
  };

  requireField("title", "titre");
  requireField("imageUrl", "image principale");
  requireField("description");
  requireField("releaseDate", "date de sortie");

  if (type === "games") {
    const hasRating = coverage.some((field) =>
      field.field.startsWith("rating"),
    );
    const hasAge = coverage.some((field) =>
      field.field.startsWith("age-rating"),
    );
    if (!hasRating) gaps.push("note: aucune source");
    if (!hasAge) gaps.push("PEGI/age: aucune source");
  }

  if (type === "books") {
    requireField("pageCount", "nombre de pages");
  }

  if (type === "musics") {
    requireField("tracksCount", "nombre de pistes");
  }

  return gaps;
}

function computeGlobalConfidence(args: {
  barcodeConfidence: number | null;
  providerHits: number;
  coverageCount: number;
  gapCount: number;
}) {
  const barcodePart = args.barcodeConfidence
    ? args.barcodeConfidence * 0.42
    : 0;
  const providerPart = Math.min(0.28, args.providerHits * 0.045);
  const coveragePart = Math.min(0.22, args.coverageCount * 0.018);
  const gapPenalty = Math.min(0.24, args.gapCount * 0.035);
  return Number(
    Math.max(
      0.05,
      Math.min(
        0.98,
        0.12 + barcodePart + providerPart + coveragePart - gapPenalty,
      ),
    ).toFixed(2),
  );
}

async function loadPersistedEvidence(barcode: string, selectedName: string) {
  const itemWhere = barcode
    ? { barcode }
    : selectedName
      ? { name: { contains: selectedName, mode: "insensitive" as const } }
      : undefined;
  const [barcodeCache, item] = await Promise.all([
    barcode
      ? prisma.barcodeCache.findUnique({
          where: { barcode },
          select: {
            id: true,
            provider: true,
            shelfType: true,
            fieldEvidence: {
              orderBy: { observedAt: "desc" },
              take: 80,
              select: {
                field: true,
                source: true,
                value: true,
                confidence: true,
                priority: true,
                sourceUrl: true,
                observedAt: true,
              },
            },
            priceOffers: {
              orderBy: { observedAt: "desc" },
              take: 80,
              select: {
                source: true,
                productName: true,
                merchantName: true,
                condition: true,
                priceCents: true,
                currency: true,
                shippingCents: true,
                totalCents: true,
                sourceUrl: true,
                offerCount: true,
                observedAt: true,
              },
            },
          },
        })
      : Promise.resolve(null),
    itemWhere
      ? prisma.item.findFirst({
          where: itemWhere,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            metadataId: true,
            metadata: {
              select: {
                id: true,
                title: true,
                fieldEvidence: {
                  orderBy: { observedAt: "desc" },
                  take: 120,
                  select: {
                    field: true,
                    source: true,
                    value: true,
                    confidence: true,
                    priority: true,
                    sourceUrl: true,
                    observedAt: true,
                  },
                },
                priceOffers: {
                  orderBy: { observedAt: "desc" },
                  take: 80,
                  select: {
                    source: true,
                    productName: true,
                    merchantName: true,
                    condition: true,
                    priceCents: true,
                    currency: true,
                    shippingCents: true,
                    totalCents: true,
                    sourceUrl: true,
                    offerCount: true,
                    observedAt: true,
                  },
                },
              },
            },
            fieldEvidence: {
              orderBy: { observedAt: "desc" },
              take: 80,
              select: {
                field: true,
                source: true,
                value: true,
                confidence: true,
                priority: true,
                sourceUrl: true,
                observedAt: true,
              },
            },
            priceOffers: {
              orderBy: { observedAt: "desc" },
              take: 80,
              select: {
                source: true,
                productName: true,
                merchantName: true,
                condition: true,
                priceCents: true,
                currency: true,
                shippingCents: true,
                totalCents: true,
                sourceUrl: true,
                offerCount: true,
                observedAt: true,
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    barcodeCache,
    item,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const barcode = cleanCode(body.barcode);
    const rawName = cleanText(body.name);
    const requestedType = cleanText(body.type);
    const type =
      requestedType && requestedType !== "auto" ? requestedType : null;
    const platform = cleanText(body.platform) || null;
    const selectedProviders = parseProviderSelection(body.providers);

    if (!barcode && !rawName) {
      return NextResponse.json(
        { error: "Barcode or name is required" },
        { status: 400 },
      );
    }

    const barcodeResult = barcode
      ? await resolveBarcode(barcode, type, {
          refresh: body.refresh !== false,
          platformHint: platform,
        })
      : null;
    const inferredType = cleanText(barcodeResult?.shelfType) || null;
    const selectedName =
      rawName ||
      barcodeResult?.cleanName ||
      barcodeResult?.matches?.[0]?.name ||
      barcodeResult?.suggestions?.[0] ||
      "";

    const providerNameCandidates = Array.from(
      new Set(
        [
          selectedName,
          rawName,
          ...(barcodeResult?.rawNames || []),
          ...(barcodeResult?.suggestions || []),
        ].filter(Boolean),
      ),
    ).slice(0, 6);

    const [barcodeProviders, metadataProviders] = await Promise.all([
      runBarcodeProviders(
        barcode,
        type,
        providerNameCandidates,
        selectedProviders,
      ),
      runMetadataProviders(
        selectedName,
        type || inferredType,
        barcode || null,
        platform,
        selectedProviders,
      ),
    ]);

    const allProviders = [...barcodeProviders, ...metadataProviders];
    const coverage = buildCoverage(metadataProviders);
    const gaps = buildGaps(coverage, type || inferredType);
    const parserInputs = Array.from(
      new Set(
        [
          rawName,
          selectedName,
          ...(barcodeResult?.rawNames || []),
          ...(barcodeResult?.suggestions || []),
        ].filter(Boolean),
      ),
    )
      .slice(0, 12)
      .map(analyzeName);

    const barcodeConfidence =
      typeof barcodeResult?.matches?.[0]?.confidence === "number"
        ? barcodeResult.matches[0].confidence
        : null;
    const providerHits = allProviders.filter(
      (provider) => provider.status === "hit",
    ).length;
    const globalConfidence = computeGlobalConfidence({
      barcodeConfidence,
      providerHits,
      coverageCount: coverage.length,
      gapCount: gaps.length,
    });
    const persistedEvidence = await loadPersistedEvidence(
      barcode,
      selectedName,
    );

    return NextResponse.json({
      input: {
        barcode,
        name: rawName,
        type: type || "auto",
        platform,
        providers: selectedProviders,
      },
      inferredType,
      selectedName,
      barcodeResult,
      parser: parserInputs,
      providers: allProviders,
      coverage,
      gaps,
      globalConfidence,
      persistedEvidence,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[ProductTeardown] Failed:", error);
    return NextResponse.json(
      { error: error?.message || "Product teardown failed" },
      { status: 500 },
    );
  }
}
