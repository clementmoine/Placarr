export type MappingProbeStatus =
  | "ok"
  | "partial"
  | "empty"
  | "blocked"
  | "error";

export interface MappingProbeResult {
  rawKeys: string[];
  mappedKeys: string[];
  coverageKeys?: string[];
  unusedKeys: string[];
  attachmentsCount: number;
  factsCount: number;
  example: string | null;
  reason?: string;
  statusHint?: MappingProbeStatus;
}

const RAW_KEY_ALIASES: Record<string, string[]> = {
  airdate: ["releaseDate"],
  aboutthegame: ["description"],
  artistcredit: ["authors", "people", "facts"],
  artistcreditid: ["authors", "people", "facts"],
  backdroppath: ["attachments", "background"],
  boxoffice: ["boxOffice", "box-office", "facts"],
  certification: ["ageRating"],
  contentdescriptors: ["contentWarning", "facts"],
  cover: ["imageUrl", "attachments"],
  covers: ["imageUrl", "attachments"],
  country: ["releaseRegion", "release-region", "facts"],
  director: ["authors", "people"],
  firstairdate: ["releaseDate"],
  genre: ["genre", "facts"],
  genres: ["genre", "facts"],
  homepage: ["sourceUrl", "facts"],
  imdbrating: ["rating", "facts"],
  imdbvotes: ["popularity", "facts"],
  isfree: ["availability", "facts"],
  key: ["source-url", "facts"],
  language: ["language", "facts"],
  metascore: ["rating", "facts"],
  name: ["title"],
  numberofpages: ["pageCount"],
  isbn10: ["barcode", "identifier", "facts"],
  isbn13: ["barcode", "identifier", "facts"],
  ocaid: ["identifier", "facts"],
  origincountry: ["releaseRegion", "release-region", "facts"],
  originallanguage: ["language", "facts"],
  overview: ["description"],
  packagingid: ["packaging", "facts"],
  playtime: ["duration"],
  plot: ["description"],
  poster: ["imageUrl", "attachments"],
  productioncompanies: ["publishers", "facts"],
  production: ["publishers", "facts"],
  productioncountries: ["releaseRegion", "release-region", "facts"],
  publishedate: ["releaseDate"],
  publishers: ["publishers"],
  rated: ["ageRating", "classification", "facts"],
  ratings: ["rating", "facts"],
  release: ["releaseDate"],
  releasegroup: ["releaseType", "facts"],
  released: ["releaseDate"],
  requiredage: ["ageRating", "facts"],
  runtime: ["duration"],
  score: ["rating", "facts"],
  statusid: ["releaseStatus", "facts"],
  type: ["content-type", "facts"],
  steamappid: ["identifier", "facts"],
  textrepresentation: ["language", "facts"],
  platforms: ["platform", "facts"],
  dlc: ["dlc", "facts"],
  contributors: ["writing", "people", "facts"],
  contributions: ["writing", "people", "facts"],
  sourcerecords: ["source-record", "facts"],
  localid: ["identifier", "facts"],
  identifiers: ["identifier", "facts"],
  firstsentence: ["description"],
  publishdate: ["releaseDate"],
  controllersupport: ["controllers", "facts"],
  detaileddescription: ["description"],
  stores: ["facts", "sourceUrl"],
  style: ["style", "facts"],
  styles: ["style", "facts"],
  trackcount: ["tracksCount"],
  trackscount: ["tracksCount"],
  voteaverage: ["rating", "facts"],
  votedcount: ["rating", "facts"],
  writer: ["writing", "authors", "people", "facts"],
  actors: ["cast", "people", "facts"],
  website: ["sourceUrl", "source-url", "facts"],
  year: ["releaseDate"],
  title: ["title"],
  belongstocollection: ["facts"],
  budget: ["facts"],
  revenue: ["facts"],
  popularity: ["popularity", "facts"],
  votecount: ["rating", "facts"],
  originaltitle: ["aliases", "title", "facts"],
  tagline: ["description", "facts"],
  spokenlanguages: ["language", "facts"],
  genreids: ["genre", "facts"],
  shortdescription: ["description"],
  headerimage: ["imageUrl", "attachments", "cover"],
  capsuleimage: ["attachments", "cover"],
  capsuleimagev5: ["attachments", "cover"],
  supportedlanguages: ["language", "facts"],
  categories: ["genre", "facts"],
  metacritic: ["rating", "facts"],
  coversmall: ["attachments", "imageUrl", "cover"],
  covermedium: ["attachments", "imageUrl", "cover"],
  coverbig: ["attachments", "imageUrl", "cover"],
  coverxl: ["attachments", "imageUrl", "cover"],
  nbtracks: ["tracksCount"],
  recordtype: ["content-type", "facts"],
  artist: ["authors", "people"],
  backgroundimage: ["attachments", "imageUrl", "cover"],
  backgroundimageadditional: ["attachments"],
  esrbrating: ["ageRating", "facts"],
  ratingscount: ["rating", "facts"],
  ratingtop: ["rating", "facts"],
  reviewstextcount: ["rating", "facts"],
  added: ["facts"],
  thumb: ["imageUrl", "attachments", "cover"],
  coverimage: ["imageUrl", "attachments", "cover"],
  masterid: ["identifier", "facts"],
  masterurl: ["sourceUrl", "facts"],
  catno: ["identifier", "facts"],
  label: ["publishers", "facts"],
  barcode: ["identifier", "facts"],
  date: ["releaseDate"],
  releaseevents: ["releaseDate", "facts"],
  status: ["releaseStatus", "facts"],
  uri: ["sourceUrl", "facts"],
  href: ["sourceUrl", "facts"],
  link: ["sourceUrl", "facts"],
  share: ["sourceUrl", "facts"],
  slug: ["identifier", "facts"],
  productname: ["title"],
  coverurl: ["imageUrl", "attachments", "cover"],
  agerating: ["ageRating", "facts"],
  platformkey: ["platform", "facts"],
  sourceurl: ["sourceUrl", "facts"],
  matchedquery: ["facts"],
  offercount: ["facts"],
  pricenew: ["facts"],
  priceused: ["facts"],
  igdbmetadata: ["facts"],
  imdbid: ["identifier", "facts"],
  awards: ["facts", "award"],
  developers: ["authors", "people"],
  screenshots: ["attachments"],
  posterpath: ["attachments", "imageUrl", "cover"],
  adult: ["content-warning", "facts"],
  softcore: ["content-warning", "facts"],
  explicitcontentlyrics: ["content-warning", "facts"],
  explicitcontentscover: ["content-warning", "facts"],
  genreid: ["genre", "facts"],
  available: ["availability", "facts"],
  tags: ["facts", "genre"],
  media: ["format", "facts", "tracksCount"],
  labelinfo: ["label", "facts", "publishers"],
  formats: ["format", "facts"],
  formatquantity: ["format", "facts"],
  community: ["popularity", "facts"],
  parentplatforms: ["platform", "facts"],
  reviewscount: ["rating", "facts"],
  reviews: ["rating", "facts"],
  priceoverview: ["availability", "facts"],
  recommendations: ["popularity", "facts"],
  averagerating: ["rating", "facts"],
  industryidentifiers: ["barcode", "identifier", "facts"],
  imagelinks: ["attachments", "imageUrl", "cover"],
  pagecount: ["pageCount"],
  publisheddate: ["releaseDate"],
  volumeinfo: ["title", "description", "facts"],
  ratingsaverage: ["rating", "facts"],
  summary: ["rating", "facts"],
  counts: ["rating", "facts"],
  yearpublished: ["releaseDate"],
  minplayers: ["players", "facts"],
  maxplayers: ["players", "facts"],
  playingtime: ["duration", "playtime", "facts"],
  minplaytime: ["duration", "playtime", "facts"],
  maxplaytime: ["duration", "playtime", "facts"],
  minage: ["ageRating", "facts"],
  usersrated: ["rating", "popularity", "facts"],
  bayesaverage: ["rating", "facts"],
  ranks: ["popularity", "facts"],
  boardgamedesigner: ["authors", "people"],
  boardgamepublisher: ["publishers"],
  boardgamecategory: ["genre", "facts"],
  boardgamemechanic: ["facts"],
  boardgamefamily: ["facts"],
};

function normalizeKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

const RAW_KEY_IGNORE = new Set(
  [
    "id",
    "response",
    "type",
    "dvd",
    "tba",
    "error",
    "message",
    "version",
    "count",
    "total",
    "offset",
    "limit",
    "page",
    "pages",
    "success",
    "codestatus",
    "codestatusmessage",
    "totalresults",
    "totalpages",
    "search",
    "data",
    "results",
    "items",
    "metadata",
    "api",
    "timestamp",
    "createdat",
    "updatedat",
    "self",
    "next",
    "previous",
    "etag",
    "checksum",
    "checksummd5",
    "upc",
    "isrc",
    "gain",
    "tracklist",
    "genresdata",
    "availablecountries",
    "fans",
    "rank",
    "position",
    "disknumber",
    "tracknumber",
    "durationms",
    "preview",
    "streamable",
    "mod",
    "md5image",
    "firstreleasedate",
    "disambiguation",
    "matchtype",
    "resourceurl",
    "videopresent",
    "video",
    "belongstocollectionid",
    "collectionid",
    "externalids",
    "wikidataid",
    "facebookid",
    "instagramid",
    "twitterid",
    "packages",
    "packagegroups",
    "achievements",
    "movies",
    "supportinfo",
    "pcrequirements",
    "macrequirements",
    "linuxrequirements",
    "legalnotice",
    "demourl",
    "backgroundraw",
    "screenshotsraw",
    "moviesraw",
    "supportedlanguagesraw",
    "totalseasons",
    "season",
    "seriesid",
    "lastmodified",
    "works",
    "classifications",
    "latestrevision",
    "revision",
    "created",
  ].map(normalizeKey),
);

function deriveMappedSemanticKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const semantic: string[] = [];

  if (record.description) {
    semantic.push("plot", "overview", "synopsis");
  }
  if (record.releaseDate) {
    semantic.push("release", "released", "year", "publishDate", "airDate");
  }
  if (record.duration) {
    semantic.push("runtime", "playtime");
  }
  if (record.imageUrl) {
    semantic.push("poster", "cover");
  }
  if (record.coverUrl) {
    semantic.push("coverurl", "cover", "poster", "imageUrl");
  }
  if (record.productName) {
    semantic.push("productname", "title", "name");
  }
  if (record.platform || record.platformKey) {
    semantic.push("platform", "platformkey");
  }
  if (record.tracksCount) {
    semantic.push("trackCount", "tracks");
  }
  if (Array.isArray(record.authors) && record.authors.length > 0) {
    semantic.push("people", "director", "artist", "creator");
  }
  if (Array.isArray(record.publishers) && record.publishers.length > 0) {
    semantic.push("company", "production", "studio", "label");
  }
  if (Array.isArray(record.attachments) && record.attachments.length > 0) {
    semantic.push("attachment", "media");
    for (const attachment of record.attachments) {
      if (
        attachment &&
        typeof attachment === "object" &&
        "type" in attachment &&
        attachment.type
      ) {
        semantic.push(String(attachment.type));
      }
    }
  }
  if (Array.isArray(record.facts) && record.facts.length > 0) {
    semantic.push("facts");
    for (const fact of record.facts) {
      if (fact && typeof fact === "object") {
        const typedFact = fact as Record<string, unknown>;
        if (typedFact.kind) semantic.push(String(typedFact.kind));
        if (typedFact.label) semantic.push(String(typedFact.label));
        if (typedFact.kind && typedFact.label) {
          semantic.push(`${typedFact.kind}:${typedFact.label}`);
        }
      }
    }
  }

  return semantic;
}

function buildCoverageKeys(record: Record<string, unknown>): string[] {
  return Array.from(
    new Set([...Object.keys(record), ...deriveMappedSemanticKeys(record)]),
  );
}

export function collectMappedKeyLabels(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const labels = new Set<string>();

  for (const key of Object.keys(record)) {
    const fieldValue = record[key];
    if (fieldValue == null || fieldValue === "" || key === "fieldEvidence") {
      continue;
    }

    if (key === "facts" && Array.isArray(fieldValue)) {
      for (const fact of fieldValue) {
        if (!fact || typeof fact !== "object") continue;
        const kind = (fact as { kind?: unknown }).kind;
        const label = (fact as { label?: unknown }).label;
        if (typeof kind !== "string" || !kind.trim()) continue;
        labels.add(
          typeof label === "string" && label.trim()
            ? `${kind} (${label.trim()})`
            : kind.trim(),
        );
      }
      continue;
    }

    if (key === "attachments" && Array.isArray(fieldValue)) {
      for (const attachment of fieldValue) {
        if (!attachment || typeof attachment !== "object") continue;
        const type = (attachment as { type?: unknown }).type;
        if (typeof type === "string" && type.trim()) {
          labels.add(`attachment:${type.trim()}`);
        }
      }
      continue;
    }

    if (
      (key === "authors" ||
        key === "publishers" ||
        key === "aliases" ||
        key === "regionalTitles") &&
      Array.isArray(fieldValue) &&
      fieldValue.length === 0
    ) {
      continue;
    }

    labels.add(key);
  }

  return Array.from(labels).sort((a, b) => a.localeCompare(b, "fr"));
}

function sortProbeKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b, "fr"));
}

export function buildUnusedKeys(rawKeys: string[], mappedKeys: string[]) {
  const mappedSet = new Set(mappedKeys.map(normalizeKey));
  return sortProbeKeys(
    rawKeys.filter((rawKey) => {
      const normalizedRaw = normalizeKey(rawKey);
      if (RAW_KEY_IGNORE.has(normalizedRaw)) return false;
      if (mappedSet.has(normalizedRaw)) return false;

      const aliases = RAW_KEY_ALIASES[normalizedRaw] || [];
      return !aliases.some((alias) => mappedSet.has(normalizeKey(alias)));
    }),
  );
}

export function metadataProbe(
  value: unknown,
  rawKeys: string[] = [],
): MappingProbeResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const coverageKeys = buildCoverageKeys(record);
  return {
    rawKeys,
    mappedKeys: collectMappedKeyLabels(record),
    coverageKeys,
    unusedKeys: buildUnusedKeys(rawKeys, coverageKeys),
    attachmentsCount: Array.isArray(record.attachments)
      ? record.attachments.length
      : 0,
    factsCount: Array.isArray(record.facts) ? record.facts.length : 0,
    example:
      (typeof record.title === "string" && record.title) ||
      (typeof record.name === "string" && record.name) ||
      null,
  };
}

export function rawProbe(
  value: unknown,
  explicitRawKeys: string[] = [],
): MappingProbeResult | null {
  if (!value) return null;
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  const coverageKeys = record
    ? buildCoverageKeys(record)
    : Array.from(
        new Set([
          ...(typeof value === "object" ? Object.keys(value as object) : []),
          ...deriveMappedSemanticKeys(value),
        ]),
      );
  const mappedKeys = record
    ? collectMappedKeyLabels(record)
    : coverageKeys;
  const rawKeys = explicitRawKeys.length > 0 ? explicitRawKeys : coverageKeys;
  const igdbMeta =
    record?.igdb_metadata &&
    typeof record.igdb_metadata === "object"
      ? (record.igdb_metadata as Record<string, unknown>)
      : null;

  return {
    rawKeys,
    mappedKeys,
    coverageKeys,
    unusedKeys: buildUnusedKeys(rawKeys, coverageKeys),
    attachmentsCount: 0,
    factsCount: 0,
    example:
      (typeof record?.title === "string" && record.title) ||
      (typeof record?.productName === "string" && record.productName) ||
      (typeof record?.name === "string" && record.name) ||
      (typeof igdbMeta?.name === "string" && igdbMeta.name) ||
      null,
    statusHint:
      record &&
      (record.title ||
        record.productName ||
        record.name ||
        record.platform ||
        record.coverUrl ||
        record.ageRating ||
        igdbMeta?.name)
        ? "ok"
        : undefined,
  };
}

export function listProbe(value: unknown): MappingProbeResult | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  const record =
    first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  const mappedKeys = record ? collectMappedKeyLabels(record) : [];
  const example =
    (typeof record?.name === "string" && record.name) ||
    (typeof record?.title === "string" && record.title) ||
    null;

  return {
    rawKeys: mappedKeys,
    mappedKeys,
    unusedKeys: [],
    attachmentsCount: 0,
    factsCount: 0,
    example,
    // Marketplace scrapers: name (+ optional cover) is the full contract.
    statusHint: example ? "ok" : undefined,
  };
}

export function probeErrorResult(
  reason: string,
  statusHint: MappingProbeStatus = "error",
): MappingProbeResult {
  return {
    rawKeys: [],
    mappedKeys: [],
    unusedKeys: [],
    attachmentsCount: 0,
    factsCount: 0,
    example: null,
    reason,
    statusHint,
  };
}

export interface BarcodeMetadataProbeSample {
  barcode: string;
  fallbackName?: string;
  fallbackPlatform?: string;
  isPal?: boolean;
}

export async function probeBarcodesWithFallback(
  queries: string[],
  fetcher: (query: string) => Promise<unknown>,
  toProbe: (value: unknown) => MappingProbeResult | null,
  providerLabel: string,
  options?: {
    retryAttempts?: number;
    unreachableStatus?: MappingProbeStatus;
  },
): Promise<MappingProbeResult | null> {
  const attempts = Math.max(1, options?.retryAttempts ?? 1);
  let sawNetworkFailure = false;

  for (const query of queries) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const value = await fetcher(query);
        const result = toProbe(value);
        if (result) return result;
      } catch (error) {
        if (isProbeNetworkFailure(error)) {
          sawNetworkFailure = true;
        }
        if (attempt < attempts - 1) {
          await sleep(400);
        }
      }
    }
  }

  const statusHint = sawNetworkFailure
    ? options?.unreachableStatus || "blocked"
    : "error";

  return probeErrorResult(
    sawNetworkFailure
      ? `${providerLabel}: host unreachable or timeout (${queries.join(", ")})`
      : `${providerLabel}: no data for known samples (${queries.join(", ")})`,
    statusHint,
  );
}

export async function probeBarcodeMetadataSamples(
  samples: BarcodeMetadataProbeSample[],
  fetcher: (
    sample: BarcodeMetadataProbeSample,
  ) => Promise<unknown>,
  toProbe: (value: unknown) => MappingProbeResult | null,
  providerLabel: string,
): Promise<MappingProbeResult | null> {
  for (const sample of samples) {
    try {
      const result = toProbe(await fetcher(sample));
      if (result) return result;
    } catch (error) {
      if (isProbeNetworkFailure(error)) {
        return probeErrorResult(
          `${providerLabel}: host unreachable or timeout (${sample.barcode})`,
          "blocked",
        );
      }
    }
  }

  return probeErrorResult(
    `No data for known samples (${samples.map((sample) => sample.barcode).join(", ")})`,
    "error",
  );
}

function isProbeNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";
  return (
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("network")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }
  throw lastError;
}

export function inferMappingProbeStatus(
  result: MappingProbeResult | null,
): MappingProbeStatus {
  if (!result) return "empty";
  if (result.statusHint) return result.statusHint;
  if (result.mappedKeys.length === 0) return "empty";
  if (
    result.attachmentsCount === 0 &&
    result.factsCount === 0 &&
    result.mappedKeys.length <= 2
  ) {
    return "partial";
  }
  return "ok";
}

export function mergeMappingProbeRawKeys(
  result: MappingProbeResult | null,
  rawKeys: string[],
): MappingProbeResult | null {
  if (!result) return null;
  if (rawKeys.length === 0) return result;
  return {
    ...result,
    rawKeys,
    unusedKeys: buildUnusedKeys(rawKeys, result.coverageKeys || result.mappedKeys),
  };
}
