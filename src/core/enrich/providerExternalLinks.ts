import {
  formatProviderSourceLabel,
  getProviderModule,
  providerIdForSourceToken,
} from "@/core/catalog/catalog";
import {
  retailerBarcodeContradictsItem,
  retailerProductBarcodeConfirmed,
} from "@/core/commerce/retailer/productUrl";
import { retailerCatalogTitleContradictsItem } from "@/core/commerce/retailer/catalogTitleAlignment";
import type { FieldEvidenceInput } from "@/core/enrich/evidence";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type { MetadataObservation } from "@/types/metadataObservation";

const PRODUCT_PAGE_PATH_DENY = [
  /book_cover/i,
  /\/image\/upload\//i,
  /mediajeu\.php/i,
  /googleusercontent\.com/i,
  /favicon/i,
];

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i;

export function normalizeProviderSourceKey(source: string): string {
  return providerIdForSourceToken(source);
}

function normalizeProviderLinkOwnerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function providerLinkOwnerKeyFromFact(fact: MetadataFact): string {
  const label = fact.label?.trim();
  if (label) return normalizeProviderLinkOwnerKey(label);
  const token = fact.source ?? "";
  return token ? normalizeProviderSourceKey(token) : "";
}

/** True when a URL likely points at a provider product/listing page (not a CDN asset). */
export function looksLikeProviderProductPageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url.trim())) return false;
  try {
    const parsed = new URL(url.trim());
    if (IMAGE_EXTENSION_RE.test(parsed.pathname)) return false;
    if (PRODUCT_PAGE_PATH_DENY.some((pattern) => pattern.test(url))) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

type UrlCandidate = { url: string; priority: number };

function pushCandidate(
  candidates: UrlCandidate[],
  url: string | null | undefined,
  priority: number,
) {
  const trimmed = url?.trim();
  if (!trimmed || !looksLikeProviderProductPageUrl(trimmed)) return;
  candidates.push({ url: trimmed, priority });
}

function collectUrlCandidates(metadata: MetadataResult): UrlCandidate[] {
  const candidates: UrlCandidate[] = [];

  for (const fact of metadata.facts ?? []) {
    if (!fact.url?.trim()) continue;
    if (fact.kind === "external-link") {
      pushCandidate(candidates, fact.url, 100);
    } else if (fact.kind === "source-url") {
      pushCandidate(candidates, fact.url, 90);
    } else {
      pushCandidate(candidates, fact.url, 40);
    }
  }

  for (const observation of metadata.observations ?? []) {
    collectObservationUrlCandidates(candidates, observation);
  }

  for (const evidence of metadata.fieldEvidence ?? []) {
    if (evidence.field === "imageUrl" || evidence.field === "cover") continue;
    pushCandidate(candidates, evidence.sourceUrl, 60);
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}

function collectObservationUrlCandidates(
  candidates: UrlCandidate[],
  observation: MetadataObservation,
) {
  const url = observation.provenance.sourceUrl;
  if (observation.kind === "offer") {
    const offerUrl =
      "url" in observation && typeof observation.url === "string"
        ? observation.url
        : null;
    pushCandidate(candidates, offerUrl, 75);
  }
  if (!url?.trim()) return;

  if (observation.provenance.sourceDocumentRole === "catalog_product") {
    pushCandidate(candidates, url, 95);
    return;
  }
  if (observation.provenance.sourceDocumentRole === "marketplace_listing") {
    pushCandidate(candidates, url, 80);
    return;
  }
  if (observation.provenance.sourceDocumentRole === "offer") {
    pushCandidate(candidates, url, 70);
    return;
  }
  pushCandidate(candidates, url, 50);
}

export function pickBestProviderDocumentUrl(
  metadata: MetadataResult,
): string | null {
  return collectUrlCandidates(metadata)[0]?.url ?? null;
}

export function makeProviderExternalLinkFact(input: {
  source: string;
  url: string;
  label?: string;
  priority?: number;
}): MetadataFact {
  const label = input.label ?? formatProviderSourceLabel(input.source);
  return {
    kind: "external-link",
    label,
    value: "Voir la fiche",
    url: input.url.trim(),
    source: input.source,
    confidence: 0.66,
    priority: input.priority ?? 38,
  };
}

function providerHasExternalLink(
  facts: MetadataFact[],
  sourceKey: string,
): boolean {
  return facts.some(
    (fact) =>
      fact.kind === "external-link" &&
      fact.url?.trim() &&
      providerLinkOwnerKeyFromFact(fact) === sourceKey,
  );
}

function findProviderExternalLink(
  facts: MetadataFact[],
  sourceKey: string,
): MetadataFact | undefined {
  return facts.find(
    (fact) =>
      fact.kind === "external-link" &&
      fact.url?.trim() &&
      providerLinkOwnerKeyFromFact(fact) === sourceKey,
  );
}

export type ProviderPriceOfferLinkInput = {
  source: string;
  sourceUrl?: string | null;
  productBarcode?: string | null;
  rawValue?: unknown;
};

function productBarcodeFromPriceOffer(
  offer: ProviderPriceOfferLinkInput,
): string | null | undefined {
  if (offer.productBarcode) return offer.productBarcode;
  const raw = offer.rawValue;
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const gtin = record.productGtin ?? record.barcode ?? record.gtin;
  return typeof gtin === "string" ? gtin : undefined;
}

function productTitleFromPriceOffer(
  offer: ProviderPriceOfferLinkInput,
): string | null {
  const raw = offer.rawValue;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const title = record.productName ?? record.title ?? record.name;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function productPageUrlFromPriceOffer(
  offer: ProviderPriceOfferLinkInput,
): string | null {
  const direct = offer.sourceUrl?.trim();
  if (direct && looksLikeProviderProductPageUrl(direct)) return direct;

  const raw = offer.rawValue;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  for (const key of ["sourceUrl", "productUrl"] as const) {
    const candidate = record[key];
    if (
      typeof candidate === "string" &&
      looksLikeProviderProductPageUrl(candidate)
    ) {
      return candidate.trim();
    }
  }
  return null;
}

function externalLinkFromTrustedCatalogProvider(
  fact: MetadataFact,
): boolean {
  const providerId = providerIdForSourceToken(fact.source ?? fact.label ?? "");
  if (!providerId) return false;
  const info = getProviderModule(providerId)?.info;
  if (!info) return false;
  return Boolean(info.nameDatabase);
}

/** Drops retailer external-links contradicted by GTIN or catalog title. */
export function purgeContradictedProviderExternalLinks(
  facts: MetadataFact[],
  itemBarcode?: string | null,
  itemTitle?: string | null,
): MetadataFact[] {
  if (!itemBarcode?.trim() && !itemTitle?.trim()) return facts;

  return facts.filter((fact) => {
    if (fact.kind !== "external-link" || !fact.url?.trim()) return true;
    if (externalLinkFromTrustedCatalogProvider(fact)) return true;
    if (
      retailerBarcodeContradictsItem({
        productUrl: fact.url,
        itemBarcode,
      })
    ) {
      return false;
    }
    if (
      retailerCatalogTitleContradictsItem({
        productUrl: fact.url,
        itemTitle,
      })
    ) {
      return false;
    }
    return true;
  });
}

function shouldReplaceProviderExternalLink(input: {
  existingUrl: string;
  nextUrl: string;
  productBarcode?: string | null;
  itemBarcode?: string | null;
}): boolean {
  const { existingUrl, nextUrl, productBarcode, itemBarcode } = input;
  if (existingUrl.trim() === nextUrl.trim()) return false;
  if (
    retailerBarcodeContradictsItem({
      productUrl: nextUrl,
      productBarcode,
      itemBarcode,
    })
  ) {
    return false;
  }
  if (
    retailerBarcodeContradictsItem({
      productUrl: existingUrl,
      itemBarcode,
    })
  ) {
    return true;
  }
  if (
    itemBarcode?.trim() &&
    retailerProductBarcodeConfirmed(nextUrl, productBarcode, itemBarcode)
  ) {
    return true;
  }
  return false;
}

/** Merges price-offer URLs into external-link facts (purge, replace, append). */
export function reconcileExternalLinksFromPriceOffers(
  facts: MetadataFact[],
  offers: ReadonlyArray<ProviderPriceOfferLinkInput>,
  itemBarcode?: string | null,
  itemTitle?: string | null,
): MetadataFact[] {
  let next = [
    ...purgeContradictedProviderExternalLinks(facts, itemBarcode, itemTitle),
  ];

  for (const offer of offers) {
    const url = productPageUrlFromPriceOffer(offer);
    if (!url) continue;

    const productBarcode = productBarcodeFromPriceOffer(offer);
    if (
      retailerBarcodeContradictsItem({
        productUrl: url,
        productBarcode,
        itemBarcode,
      })
    ) {
      continue;
    }
    if (
      retailerCatalogTitleContradictsItem({
        productUrl: url,
        productTitle: productTitleFromPriceOffer(offer),
        itemTitle,
      })
    ) {
      continue;
    }

    const sourceKey = normalizeProviderSourceKey(offer.source);
    if (!sourceKey) continue;

    const existing = findProviderExternalLink(next, sourceKey);
    if (existing?.url?.trim() === url) continue;

    if (
      existing?.url &&
      !shouldReplaceProviderExternalLink({
        existingUrl: existing.url,
        nextUrl: url,
        productBarcode,
        itemBarcode,
      })
    ) {
      continue;
    }

    if (existing) {
      next = next.filter((fact) => fact !== existing);
    }

    next.push(
      makeProviderExternalLinkFact({
        source: offer.source,
        url,
        priority: 34,
      }),
    );
  }

  return next;
}

export function mirrorSourceUrlFactsAsExternalLinks(
  facts: MetadataFact[],
): MetadataFact[] {
  const additions: MetadataFact[] = [];

  for (const fact of facts) {
    if (fact.kind !== "source-url" || !fact.url?.trim()) continue;
    const sourceKey = normalizeProviderSourceKey(
      fact.source ?? fact.label ?? "",
    );
    if (
      !sourceKey ||
      providerHasExternalLink([...facts, ...additions], sourceKey)
    ) {
      continue;
    }
    additions.push(
      makeProviderExternalLinkFact({
        source: fact.source ?? fact.label,
        url: fact.url,
        priority: fact.priority ?? 36,
      }),
    );
  }

  return additions;
}

export type ProviderMetadataLinkInput = {
  providerId: string;
  metadata: MetadataResult;
};

/** Adds one external-link per provider that contributed a document URL but has none yet. */
export function appendMissingProviderExternalLinkFacts(
  facts: MetadataFact[],
  inputs: readonly ProviderMetadataLinkInput[],
): MetadataFact[] {
  const merged = [...facts, ...mirrorSourceUrlFactsAsExternalLinks(facts)];
  const additions: MetadataFact[] = [];

  for (const input of inputs) {
    const sourceKey = normalizeProviderSourceKey(input.providerId);
    if (
      !sourceKey ||
      providerHasExternalLink([...merged, ...additions], sourceKey)
    ) {
      continue;
    }

    const url = pickBestProviderDocumentUrl(input.metadata);
    if (!url) continue;

    additions.push(
      makeProviderExternalLinkFact({
        source: input.providerId,
        url,
      }),
    );
  }

  return dedupeProviderExternalLinkFacts(
    additions.length > 0 ? [...merged, ...additions] : merged,
  );
}

export function externalLinkFactsFromPriceOffers(
  offers: ReadonlyArray<ProviderPriceOfferLinkInput>,
  existingFacts: MetadataFact[] = [],
  options?: { itemBarcode?: string | null; itemTitle?: string | null },
): MetadataFact[] {
  const reconciled = reconcileExternalLinksFromPriceOffers(
    existingFacts,
    offers,
    options?.itemBarcode,
    options?.itemTitle,
  );
  const existingKeys = new Set(
    existingFacts
      .filter((fact) => fact.kind === "external-link" && fact.url?.trim())
      .map(
        (fact) =>
          `${normalizeProviderSourceKey(fact.source ?? fact.label ?? "")}\0${fact.url!.trim()}`,
      ),
  );
  return reconciled.filter((fact) => {
    if (fact.kind !== "external-link" || !fact.url?.trim()) return false;
    const key = `${normalizeProviderSourceKey(fact.source ?? fact.label ?? "")}\0${fact.url.trim()}`;
    return !existingKeys.has(key);
  });
}

export function externalLinkFactsFromFieldEvidence(
  evidence: ReadonlyArray<FieldEvidenceInput>,
  existingFacts: MetadataFact[] = [],
): MetadataFact[] {
  const additions: MetadataFact[] = [];

  for (const entry of evidence) {
    const url = entry.sourceUrl?.trim();
    if (!url || !looksLikeProviderProductPageUrl(url)) continue;

    const field = entry.field?.trim() ?? "";
    if (field.startsWith("external-link:")) {
      const label =
        field.slice("external-link:".length).trim() ||
        formatProviderSourceLabel(entry.source);
      const ownerKey = normalizeProviderLinkOwnerKey(label);
      if (
        !ownerKey ||
        providerHasExternalLink([...existingFacts, ...additions], ownerKey)
      ) {
        continue;
      }
      additions.push(
        makeProviderExternalLinkFact({
          source: entry.source,
          url,
          label,
          priority: entry.priority ?? 36,
        }),
      );
      continue;
    }

    const sourceKey = normalizeProviderSourceKey(entry.source);
    if (
      !sourceKey ||
      providerHasExternalLink([...existingFacts, ...additions], sourceKey)
    ) {
      continue;
    }

    additions.push(
      makeProviderExternalLinkFact({
        source: entry.source,
        url,
        priority: entry.priority ?? 34,
      }),
    );
  }

  return additions;
}

/** One external-link per provider module (aliases like bgg/boardgamegeek collapse). */
export function dedupeProviderExternalLinkFacts(
  facts: MetadataFact[],
): MetadataFact[] {
  const nonLinks = facts.filter(
    (fact) => fact.kind !== "external-link" || !fact.url?.trim(),
  );
  const bestByProvider = new Map<string, MetadataFact>();

  for (const fact of facts) {
    if (fact.kind !== "external-link" || !fact.url?.trim()) continue;

    const ownerKey = providerLinkOwnerKeyFromFact(fact);
    if (!ownerKey) continue;

    const existing = bestByProvider.get(ownerKey);
    if (!existing || (fact.priority ?? 0) > (existing.priority ?? 0)) {
      bestByProvider.set(ownerKey, fact);
    }
  }

  return [...nonLinks, ...Array.from(bestByProvider.values())];
}

const INTERNAL_PROFILE_CONTRIBUTOR_KEYS = new Set(["consensus", "mergedengine"]);

function collectProfileContributorProviderIds(input: {
  facts?: MetadataFact[];
  fieldEvidence?: ReadonlyArray<{ source?: string | null }>;
  attachments?: ReadonlyArray<{ source?: string | null }>;
}): string[] {
  const keys = new Set<string>();
  const add = (source?: string | null) => {
    const id = providerIdForSourceToken(source ?? "");
    if (!id || INTERNAL_PROFILE_CONTRIBUTOR_KEYS.has(id)) return;
    keys.add(id);
  };

  for (const fact of input.facts ?? []) {
    if (fact.kind === "external-link") continue;
    add(fact.source);
  }
  for (const attachment of input.attachments ?? []) add(attachment.source);
  for (const entry of input.fieldEvidence ?? []) add(entry.source);

  return [...keys];
}

/** Every provider that contributed to the profile, with the best URL we have. */
export function buildProfileProviderLinkFacts(input: {
  facts?: MetadataFact[];
  fieldEvidence?: readonly FieldEvidenceInput[];
  attachments?: readonly { source?: string | null }[];
  priceOffers?: readonly ProviderPriceOfferLinkInput[];
  itemBarcode?: string | null;
  itemTitle?: string | null;
  catalogLink?: { url: string; providerLabel?: string } | null;
}): MetadataFact[] {
  let links = (input.facts ?? []).filter(
    (fact) => fact.kind === "external-link" && fact.url?.trim(),
  );

  const fromEvidence = externalLinkFactsFromFieldEvidence(
    input.fieldEvidence ?? [],
    links,
  );
  if (fromEvidence.length > 0) {
    links = dedupeProviderExternalLinkFacts([...links, ...fromEvidence]).filter(
      (fact) => fact.kind === "external-link" && fact.url?.trim(),
    );
  }

  links = reconcileExternalLinksFromPriceOffers(
    links,
    input.priceOffers ?? [],
    input.itemBarcode,
    input.itemTitle,
  ).filter((fact) => fact.kind === "external-link" && fact.url?.trim());

  if (input.catalogLink?.url?.trim()) {
    const providerLabel = input.catalogLink.providerLabel ?? "Catalog";
    const ownerKey = normalizeProviderLinkOwnerKey(providerLabel);
    if (!providerHasExternalLink(links, ownerKey)) {
      links.push(
        makeProviderExternalLinkFact({
          source: providerIdForSourceToken(providerLabel) || providerLabel,
          url: input.catalogLink.url.trim(),
          label: providerLabel,
          priority: 40,
        }),
      );
    }
  }

  for (const providerId of collectProfileContributorProviderIds(input)) {
    const ownerKey = normalizeProviderSourceKey(providerId);
    if (!ownerKey || providerHasExternalLink(links, ownerKey)) continue;

    const websiteUrl = getProviderModule(providerId)?.info.websiteUrl?.trim();
    if (!websiteUrl || !looksLikeProviderProductPageUrl(websiteUrl)) continue;

    links.push(
      makeProviderExternalLinkFact({
        source: providerId,
        url: websiteUrl,
        priority: 18,
      }),
    );
  }

  return dedupeProviderExternalLinkFacts(links).filter(
    (fact) => fact.kind === "external-link" && fact.url?.trim(),
  );
}
