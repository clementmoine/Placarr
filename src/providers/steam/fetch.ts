import axios from "axios";
import levenshtein from "fast-levenshtein";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

interface SteamSearchItem {
  id: number;
  name: string;
  tiny_image?: string;
}

interface SteamAppDetails {
  type?: string;
  name?: string;
  steam_appid?: number;
  required_age?: string | number;
  release_date?: {
    coming_soon?: boolean;
    date?: string;
  };
  is_free?: boolean;
  controller_support?: string;
  dlc?: number[];
  about_the_game?: string;
  detailed_description?: string;
  short_description?: string;
  header_image?: string;
  capsule_image?: string;
  capsule_imagev5?: string;
  background_raw?: string;
  website?: string;
  developers?: string[];
  publishers?: string[];
  platforms?: Record<string, boolean>;
  metacritic?: {
    score?: number;
    url?: string;
  };
  genres?: { id?: string; description?: string }[];
  categories?: { id?: number; description?: string }[];
  supported_languages?: string;
  ratings?: Record<
    string,
    {
      rating?: string;
      descriptors?: string;
      required_age?: string | number;
    }
  >;
  content_descriptors?: {
    ids?: number[];
    notes?: string;
  };
  recommendations?: { total?: number };
  reviews?: {
    total_reviews?: number;
    review_score?: number;
    review_score_desc?: string;
    percent_positive?: number;
  };
  price_overview?: {
    currency?: string;
    initial?: number;
    final?: number;
    discount_percent?: number;
  };
  screenshots?: { id?: number; path_thumbnail?: string; path_full?: string }[];
}

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const normA = normalizeForComparison(a);
  const normB = normalizeForComparison(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.86;

  const dist = levenshtein.get(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return maxLen > 0 ? 1 - dist / maxLen : 0;
}

function stripHtml(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || undefined;
}

function formatNumber(value?: number): string | null {
  if (!value || value <= 0) return null;
  return new Intl.NumberFormat("fr-FR").format(value);
}

function buildSteamFacts(appId: number, data: SteamAppDetails): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Steam",
      value: "Fiche Steam",
      url: `https://store.steampowered.com/app/${appId}`,
      source: "steam",
      confidence: 0.82,
      priority: 42,
    },
    {
      kind: "external-link",
      label: "SteamDB",
      value: "Historique Steam",
      url: `https://steamdb.info/app/${appId}/`,
      source: "steamdb",
      confidence: 0.78,
      priority: 41,
    },
  ];

  if (data.metacritic?.score) {
    facts.push({
      kind: "rating",
      label: "Metacritic",
      value: `${data.metacritic.score}/100`,
      url: data.metacritic.url,
      source: "steam",
      confidence: 0.8,
      priority: 70,
    });
  }

  const recommendations = formatNumber(data.recommendations?.total);
  if (recommendations) {
    facts.push({
      kind: "popularity",
      label: "Recommandations Steam",
      value: recommendations,
      source: "steam",
      confidence: 0.65,
      priority: 35,
    });
  }

  const reviewPercent = data.reviews?.percent_positive;
  const reviewTotal = data.reviews?.total_reviews;
  if (
    typeof reviewPercent === "number" &&
    Number.isFinite(reviewPercent) &&
    typeof reviewTotal === "number" &&
    reviewTotal > 0
  ) {
    const formattedTotal = formatNumber(reviewTotal);
    const scoreDesc = data.reviews?.review_score_desc?.trim();
    facts.push({
      kind: "rating",
      label: "Avis Steam",
      value: scoreDesc
        ? `${reviewPercent}% — ${scoreDesc}${formattedTotal ? ` (${formattedTotal})` : ""}`
        : `${reviewPercent}%${formattedTotal ? ` (${formattedTotal} avis)` : ""}`,
      source: "steam",
      confidence: 0.72,
      priority: 71,
    });
  }

  const priceOverview = data.price_overview;
  if (priceOverview && typeof priceOverview.final === "number") {
    const currency = priceOverview.currency || "EUR";
    const finalPrice = priceOverview.final / 100;
    const initialPrice =
      typeof priceOverview.initial === "number"
        ? priceOverview.initial / 100
        : null;
    const discount =
      typeof priceOverview.discount_percent === "number" &&
      priceOverview.discount_percent > 0
        ? ` (-${priceOverview.discount_percent}%)`
        : "";
    const formattedFinal = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
    }).format(finalPrice);
    const formattedInitial =
      initialPrice != null && initialPrice > finalPrice
        ? new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency,
          }).format(initialPrice)
        : null;
    facts.push({
      kind: "availability",
      label: "Prix Steam",
      value: formattedInitial
        ? `${formattedFinal}${discount} (au lieu de ${formattedInitial})`
        : `${formattedFinal}${discount}`,
      source: "steam",
      confidence: 0.68,
      priority: 33,
    });
  }

  if (typeof data.is_free === "boolean") {
    facts.push({
      kind: "availability",
      label: "Steam",
      value: data.is_free ? "Free-to-play" : "Payant",
      source: "steam",
      confidence: 0.65,
      priority: 25,
    });
  }

  if (
    typeof data.controller_support === "string" &&
    data.controller_support.trim()
  ) {
    facts.push({
      kind: "controllers",
      label: "Support manette",
      value: data.controller_support.trim(),
      source: "steam",
      confidence: 0.6,
      priority: 27,
    });
  }

  if (Array.isArray(data.dlc) && data.dlc.length > 0) {
    facts.push({
      kind: "dlc",
      label: "DLC",
      value: String(data.dlc.length),
      source: "steam",
      confidence: 0.58,
      priority: 24,
    });
  }

  if (typeof data.website === "string" && data.website.trim()) {
    facts.push({
      kind: "source-url",
      label: "Site officiel",
      value: data.website.trim(),
      url: data.website.trim(),
      source: "steam",
      confidence: 0.58,
      priority: 23,
    });
  }

  const supportedPlatforms = Object.entries(data.platforms || {})
    .filter(([, supported]) => Boolean(supported))
    .map(([platformKey]) => platformKey.toUpperCase());
  if (supportedPlatforms.length > 0) {
    facts.push({
      kind: "platform",
      label: "Plateformes",
      value: supportedPlatforms.join(" • "),
      source: "steam",
      confidence: 0.62,
      priority: 39,
    });
  }

  if (
    typeof data.steam_appid === "number" &&
    Number.isFinite(data.steam_appid)
  ) {
    facts.push({
      kind: "identifier",
      label: "Steam App ID",
      value: String(data.steam_appid),
      source: "steam",
      confidence: 0.66,
      priority: 28,
    });
  }

  if (typeof data.type === "string" && data.type.trim()) {
    facts.push({
      kind: "content-type",
      label: "Type",
      value: data.type.trim(),
      source: "steam",
      confidence: 0.57,
      priority: 20,
    });
  }

  const requiredAgeValue =
    typeof data.required_age === "number"
      ? data.required_age
      : Number(String(data.required_age || "").replace(/[^\d]/g, ""));
  if (Number.isFinite(requiredAgeValue) && requiredAgeValue > 0) {
    facts.push({
      kind: "age-rating",
      label: "Classification",
      value: `${requiredAgeValue}+`,
      source: "steam",
      confidence: 0.66,
      priority: 52,
    });
  }

  const genres = (data.genres || [])
    .map((genre) => genre.description?.trim())
    .filter((value): value is string => Boolean(value));
  if (genres.length > 0) {
    facts.push({
      kind: "genre",
      label: "Genres",
      value: genres.slice(0, 3).join(" • "),
      source: "steam",
      confidence: 0.68,
      priority: 46,
    });
  }

  const gameModes = (data.categories || [])
    .map((category) => category.description?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) =>
      /joueur|multijoueur|multiplayer|coop|co-op|solo|lan|pvp/i.test(value),
    );
  if (gameModes.length > 0) {
    facts.push({
      kind: "modes",
      label: "Modes de jeu",
      value: Array.from(new Set(gameModes)).slice(0, 4).join(" • "),
      source: "steam",
      confidence: 0.64,
      priority: 45,
    });
  }

  if (data.supported_languages) {
    const languageText = data.supported_languages
      .replace(/<br\s*\/?>/gi, ",")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (languageText) {
      facts.push({
        kind: "languages",
        label: "Langues",
        value: languageText.slice(0, 180),
        source: "steam",
        confidence: 0.6,
        priority: 38,
      });
    }
  }

  if (data.content_descriptors?.notes?.trim()) {
    facts.push({
      kind: "content-warning",
      label: "Contenu sensible",
      value: data.content_descriptors.notes.trim(),
      source: "steam",
      confidence: 0.62,
      priority: 54,
    });
  }

  for (const [board, details] of Object.entries(data.ratings || {})) {
    const rating = details?.rating?.trim();
    if (rating) {
      facts.push({
        kind: "age-rating",
        label: board.toUpperCase(),
        value: rating,
        source: "steam",
        confidence: 0.68,
        priority: 64,
      });
    }
    const descriptors = details?.descriptors?.trim();
    if (descriptors) {
      facts.push({
        kind: "content-warning",
        label: `${board.toUpperCase()} descripteurs`,
        value: descriptors,
        source: "steam",
        confidence: 0.63,
        priority: 53,
      });
    }
  }

  return facts;
}

function buildSteamAttachments(data: SteamAppDetails): MetadataAttachment[] {
  const attachments: MetadataAttachment[] = [];

  if (data.capsule_imagev5 || data.capsule_image || data.header_image) {
    attachments.push({
      type: "cover",
      url: data.capsule_imagev5 || data.capsule_image || data.header_image!,
      source: "steam",
      role: "capsule",
    });
  }

  if (data.header_image) {
    attachments.push({
      type: "artwork",
      url: data.header_image,
      source: "steam",
      role: "header",
    });
  }

  if (data.background_raw) {
    attachments.push({
      type: "background",
      url: data.background_raw,
      source: "steam",
    });
  }

  for (const screenshot of data.screenshots || []) {
    const url = screenshot.path_full || screenshot.path_thumbnail;
    if (!url) continue;
    attachments.push({
      type: "screenshot",
      url,
      source: "steam",
    });
  }

  return attachments;
}

export function buildGameReferenceFacts(title: string): MetadataFact[] {
  const query = title.trim();
  if (!query) return [];
  const encoded = encodeURIComponent(query);

  return [
    {
      kind: "external-link",
      label: "PCGamingWiki",
      value: "Recherche technique",
      url: `https://www.pcgamingwiki.com/w/index.php?search=${encoded}`,
      source: "pcgamingwiki",
      confidence: 0.55,
      priority: 43,
    },
    {
      kind: "external-link",
      label: "SteamDB",
      value: "Recherche SteamDB",
      url: `https://steamdb.info/search/?a=app&q=${encoded}`,
      source: "steamdb",
      confidence: 0.55,
      priority: 17,
    },
  ];
}

export async function fetchFromSteam(
  name: string,
): Promise<MetadataResult | null> {
  const query = name.trim();
  if (!query) return null;

  try {
    const searchRes = await axios.get<{
      total?: number;
      items?: SteamSearchItem[];
    }>("https://store.steampowered.com/api/storesearch/", {
      params: {
        term: query,
        cc: "fr",
        l: "french",
      },
      timeout: 8000,
    });

    const items = searchRes.data.items || [];
    if (items.length === 0) return null;

    const ranked = items
      .map((item) => ({
        ...item,
        score: titleSimilarity(query, item.name),
      }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 0.42) return null;

    const detailsRes = await axios.get<
      Record<string, { success?: boolean; data?: SteamAppDetails }>
    >("https://store.steampowered.com/api/appdetails", {
      params: {
        appids: best.id,
        cc: "fr",
        l: "french",
      },
      timeout: 8000,
    });

    const details = detailsRes.data[String(best.id)];
    if (!details?.success || !details.data) return null;
    const data = details.data;
    const title = data.name || best.name;

    return {
      title,
      description: stripHtml(
        data.short_description ||
          data.about_the_game ||
          data.detailed_description,
      ),
      releaseDate: data.release_date?.date || undefined,
      imageUrl: data.capsule_imagev5 || data.capsule_image || data.header_image,
      publishers: (data.publishers || []).map((publisher) => ({
        name: publisher,
      })),
      authors: (data.developers || []).map((developer) => ({
        name: developer,
      })),
      attachments: buildSteamAttachments(data),
      facts: buildSteamFacts(best.id, data),
      externalIds: { steam: String(best.id) },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Steam] Error fetching metadata for "${name}":`, message);
    return null;
  }
}
