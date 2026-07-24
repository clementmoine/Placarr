import {
  formatProviderSourceLabel,
  getProviderModule,
  providerIdForSourceToken,
} from "@/core/catalog/catalog";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";
import {
  retailerBarcodeContradictsItem,
  retailerProductBarcodeConfirmed,
} from "@/core/commerce/retailer/productUrl";
import {
  catalogTitleFromProductUrl,
  retailerCatalogTitleContradictsItem,
} from "@/core/commerce/retailer/catalogTitleAlignment";
import { priceListingSharesItemIdentity } from "@/core/commerce/retailer/titleMatch";
import { residualIdentityMatch } from "@/core/enrich/titles/residualIdentity";
import type { FieldEvidenceInput } from "@/core/enrich/evidence";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
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
  platformKey?: string | null;
}): MetadataFact {
  const label = input.label ?? formatProviderSourceLabel(input.source);
  const sourceKey = normalizeProviderSourceKey(input.source);
  const module = sourceKey ? getProviderModule(sourceKey) : undefined;
  const normalizedUrl =
    module
      ?.normalizeCatalogProductUrl?.(input.url.trim(), {
        platformKey: input.platformKey,
      })
      ?.trim() || input.url.trim();
  return {
    kind: "external-link",
    label,
    value: "Voir la fiche",
    url: normalizedUrl,
    source: input.source,
    confidence: 0.66,
    priority: input.priority ?? 38,
  };
}

function normalizeStoredExternalLinkFact(
  fact: MetadataFact,
  platformKey?: string | null,
): MetadataFact {
  if (fact.kind !== "external-link" || !fact.url?.trim()) return fact;
  const sourceKey = normalizeProviderSourceKey(
    fact.source ?? fact.label ?? fact.providerLabel ?? "",
  );
  const module = sourceKey ? getProviderModule(sourceKey) : undefined;
  const normalizedUrl = module?.normalizeCatalogProductUrl?.(fact.url.trim(), {
    platformKey,
  });
  if (!normalizedUrl || normalizedUrl === fact.url.trim()) return fact;
  return { ...fact, url: normalizedUrl };
}

function providerHasExternalLink(
  facts: MetadataFact[],
  sourceKey: string,
): boolean {
  return facts.some((fact) => {
    if (fact.kind !== "external-link" || !fact.url?.trim()) return false;
    if (providerLinkOwnerKeyFromFact(fact) === sourceKey) return true;
    // Region-qualified chips ("PriceCharting (EUR)") still cover the provider
    // so we do not append a third generic homepage/search link.
    const fromSource = normalizeProviderSourceKey(
      fact.source ?? fact.providerLabel ?? "",
    );
    return Boolean(fromSource && fromSource === sourceKey);
  });
}

function findProviderExternalLink(
  facts: MetadataFact[],
  sourceKey: string,
): MetadataFact | undefined {
  return facts.find((fact) => {
    if (fact.kind !== "external-link" || !fact.url?.trim()) return false;
    if (providerLinkOwnerKeyFromFact(fact) === sourceKey) return true;
    const fromSource = normalizeProviderSourceKey(
      fact.source ?? fact.providerLabel ?? "",
    );
    return Boolean(fromSource && fromSource === sourceKey);
  });
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

function coverUrlFromPriceOffer(
  offer: ProviderPriceOfferLinkInput,
): string | null {
  const raw = offer.rawValue;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const direct = record.coverUrl;
  if (typeof direct === "string" && /^https?:\/\//i.test(direct.trim())) {
    return direct.trim();
  }
  const imageUrls = record.imageUrls;
  if (Array.isArray(imageUrls)) {
    for (const entry of imageUrls) {
      if (typeof entry === "string" && /^https?:\/\//i.test(entry.trim())) {
        return entry.trim();
      }
    }
  }
  return null;
}

function providerAlreadyHasCoverAttachment(
  attachments: ReadonlyArray<{ source?: string | null; type?: string | null }>,
  providerId: string,
): boolean {
  return attachments.some((attachment) => {
    const type = attachment.type ?? "cover";
    if (!["cover", "artwork", "image"].includes(type)) return false;
    return providerIdForSourceToken(attachment.source ?? "") === providerId;
  });
}

/**
 * Marketplace price refresh often lands a listing coverUrl + fiche before the
 * slower metadata scrape writes gallery rows. Surface those covers on present
 * when the provider declares `coverUrlHost` and the listing title still aligns.
 */
export function coverAttachmentsFromPriceOffers(
  offers: ReadonlyArray<ProviderPriceOfferLinkInput>,
  options: {
    itemTitle?: string | null;
    shelfType?: string | null;
    existingAttachments?: ReadonlyArray<{
      url?: string | null;
      source?: string | null;
      type?: string | null;
    }>;
  } = {},
): MetadataAttachment[] {
  const existing = options.existingAttachments ?? [];
  const existingUrls = new Set(
    existing
      .map((attachment) => attachment.url?.trim())
      .filter((url): url is string => Boolean(url)),
  );
  const out: MetadataAttachment[] = [];
  const seenProviders = new Set<string>();

  for (const offer of offers) {
    const providerId = providerIdForSourceToken(offer.source);
    if (!providerId || seenProviders.has(providerId)) continue;
    if (providerAlreadyHasCoverAttachment(existing, providerId)) continue;

    const provider = getProviderModule(providerId);
    const coverHost = provider?.info.coverUrlHost?.trim();
    if (!coverHost) continue;
    if (
      !provider.info.marketplaceSearchPriceSource &&
      !provider.info.retailCatalogImageTitles
    ) {
      continue;
    }

    const coverUrl = coverUrlFromPriceOffer(offer);
    if (!coverUrl || !coverUrl.includes(coverHost)) continue;
    if (existingUrls.has(coverUrl)) continue;

    const listingTitle = productTitleFromPriceOffer(offer);
    const itemTitle = options.itemTitle?.trim();
    if (
      itemTitle &&
      listingTitle &&
      !priceListingSharesItemIdentity(itemTitle, listingTitle, {
        shelfType: options.shelfType,
      })
    ) {
      continue;
    }

    seenProviders.add(providerId);
    existingUrls.add(coverUrl);
    out.push(
      withProviderAttachmentTraits({
        type: "cover",
        url: coverUrl,
        title: listingTitle ?? undefined,
        source: providerId,
      }),
    );
  }

  return out;
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
  itemTitle?: string | null,
  shelfType?: string | null,
): boolean {
  const providerId = providerIdForSourceToken(fact.source ?? fact.label ?? "");
  if (!providerId) return false;
  const providerModule = getProviderModule(providerId);
  if (!providerModule) return false;
  // nameDatabase fiches (Booknode, Bédéthèque, …) are identity sources — never
  // subject to retailer slug heuristics.
  if (providerModule.info.nameDatabase) return true;
  // Verified catalog product URLs (PriceCharting /game/…, …) were already
  // accepted as fiche links; residual hardware title mismatch must not wipe
  // them on present/refresh (e.g. “Zelda” shelf title vs Tears of the Kingdom
  // edition slug). Finish conflicts after a rename (Metallic Blue ≠ Pink) are
  // hard SKU mismatches — those may be purged so the next seek can re-pin.
  // Marketplace UUID fiches (Back Market, …) can pin the wrong generation
  // (PS5 → PS One) — any hard residual reject drops the trusted bypass.
  const url = fact.url?.trim();
  if (
    url &&
    providerModule.isVerifiedCatalogProductUrl?.(url)
  ) {
    if (shelfType === "hardware" && itemTitle?.trim()) {
      const catalogTitle = catalogTitleFromProductUrl(url);
      if (catalogTitle) {
        const residual = residualIdentityMatch({
          requestTitles: [itemTitle.trim()],
          candidateTitles: [catalogTitle],
          shelfType: "hardware",
        });
        if (residual.decision === "reject") {
          const marketplace = Boolean(
            providerModule.info.marketplaceSearchPriceSource,
          );
          if (
            marketplace ||
            residual.reasons.includes("finish_conflict")
          ) {
            return false;
          }
        }
      }
    }
    return true;
  }
  return false;
}

/** True when item finish/color clearly conflicts with a catalog product URL. */
function hardwareFinishConflictsCatalogLink(
  itemTitle: string | null | undefined,
  productUrl: string,
): boolean {
  const title = itemTitle?.trim();
  if (!title) return false;
  const catalogTitle = catalogTitleFromProductUrl(productUrl);
  if (!catalogTitle) return false;
  const residual = residualIdentityMatch({
    requestTitles: [title],
    candidateTitles: [catalogTitle],
    shelfType: "hardware",
  });
  return (
    residual.decision === "reject" &&
    residual.reasons.includes("finish_conflict")
  );
}

/** Drops retailer external-links contradicted by GTIN or catalog title. */
export function purgeContradictedProviderExternalLinks(
  facts: MetadataFact[],
  itemBarcode?: string | null,
  itemTitle?: string | null,
  shelfType?: string | null,
): MetadataFact[] {
  if (!itemBarcode?.trim() && !itemTitle?.trim()) return facts;

  return facts.filter((fact) => {
    if (fact.kind !== "external-link" || !fact.url?.trim()) return true;
    if (externalLinkFromTrustedCatalogProvider(fact, itemTitle, shelfType)) {
      return true;
    }
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
        shelfType,
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
  itemTitle?: string | null;
  shelfType?: string | null;
  productTitle?: string | null;
}): boolean {
  const {
    existingUrl,
    nextUrl,
    productBarcode,
    itemBarcode,
    itemTitle,
    shelfType,
    productTitle,
  } = input;
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
  // After a rename, replace a finish-mismatched catalog pin when the new offer
  // aligns (or at least does not finish-conflict).
  if (
    shelfType === "hardware" &&
    hardwareFinishConflictsCatalogLink(itemTitle, existingUrl) &&
    !hardwareFinishConflictsCatalogLink(itemTitle, nextUrl) &&
    !retailerCatalogTitleContradictsItem({
      productUrl: nextUrl,
      productTitle,
      itemTitle,
      shelfType,
    })
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
  shelfType?: string | null,
): MetadataFact[] {
  let next = [
    ...purgeContradictedProviderExternalLinks(
      facts,
      itemBarcode,
      itemTitle,
      shelfType,
    ),
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
        shelfType,
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
        itemTitle,
        shelfType,
        productTitle: productTitleFromPriceOffer(offer),
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
  options?: {
    itemBarcode?: string | null;
    itemTitle?: string | null;
    shelfType?: string | null;
  },
): MetadataFact[] {
  const reconciled = reconcileExternalLinksFromPriceOffers(
    existingFacts,
    offers,
    options?.itemBarcode,
    options?.itemTitle,
    options?.shelfType,
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
  shelfType?: string | null;
  platformKey?: string | null;
  catalogLink?: { url: string; providerLabel?: string } | null;
}): MetadataFact[] {
  let links = (input.facts ?? [])
    .filter((fact) => fact.kind === "external-link" && fact.url?.trim())
    .map((fact) => normalizeStoredExternalLinkFact(fact, input.platformKey));

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
    input.shelfType,
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

    const providerModule = getProviderModule(providerId);
    // Marketplace homes are not product fiches — only keep a link when we still
    // have a listing URL (already in `links`). Do not re-pin the site root after
    // a wrong SKU (PS One on PS5) was purged.
    if (providerModule?.info.marketplaceSearchPriceSource) continue;

    const websiteUrl = providerModule?.info.websiteUrl?.trim();
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
