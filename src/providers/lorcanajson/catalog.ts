import {
  getFreshProviderEvidence,
  putProviderEvidence,
} from "@/core/enrich/providerEvidenceStore";

/**
 * The few foil details the published data files leave out.
 *
 * LorcanaJSON reads Ravensburger's own catalogue and then drops three fields on
 * the way to its output — checked against all 3159 cards of `allCards.json`,
 * which contains no colour at all. The one that matters is `hot_foil_color`:
 * nothing else predicts it. Three Enchanted prints from set 9, in Amber,
 * Amethyst and Ruby, all throw the same `#D9A36D`, while the seven Iconic
 * prints throw seven different colours. Drawing the coat without it means
 * inventing a hue, which is visibly wrong on exactly the cards where the coat
 * carries the look.
 *
 * So this reads the same catalogue LorcanaJSON does. A suggestion has been sent
 * upstream (`docs/lorcanajson_suggestion.md`); if it lands, this file goes away.
 */
export type PrintFoilDetails = {
  /** Hue the stamped varnish throws. */
  hotFoilColor: string;
  /** Second stamped coat, on the two prints that carry one. */
  secondHotFoilColor?: string;
  secondVarnishMaskUrl?: string;
};

/**
 * Keyed by the catalogue's own card id, which is exactly `LorcanaCard.
 * providerId` — verified against all 83 coloured variants, every one of which
 * matched. Keying by print key instead would mean this file loading the card
 * index to resolve it, and the card index is what consumes this one.
 */
export type PrintFoilIndex = Record<string, PrintFoilDetails>;

const TOKEN_URL = "https://sso.ravensburger.de/token";
const CATALOG_URL = "https://api.lorcana.ravensburger.com/v3/catalog";

/**
 * Read-only key the official app uses, published in LorcanaJSON's own source.
 * It grants nothing but this catalogue.
 */
const CATALOG_AUTH =
  "Basic bG9yY2FuYS1hcGktcmVhZDpFdkJrMzJkQWtkMzludWt5QVNIMHc2X2FJcVZEcHpJenVrS0lxcDlBNXRlb2c5R3JkQ1JHMUFBaDVSendMdERkYlRpc2k3THJYWDl2Y0FkSTI4S096dw==";

/**
 * How long a stored index stays good.
 *
 * A set ships roughly every two to three months and nothing in here changes
 * between releases, so this is deliberately long: the catalogue is 4 MB, and
 * fetching it more often than the game changes would be pure waste.
 */
export const PRINT_FOIL_TTL_MS = 70 * 24 * 60 * 60 * 1000;

/** Where the stored copy lives, alongside every other provider's yield. */
const EVIDENCE_KIND = "printFoil";

type CatalogVariant = {
  hot_foil_color?: unknown;
  second_hot_foil_color?: unknown;
  second_foil_top_layer_mask_url?: unknown;
};

type CatalogCard = {
  culture_invariant_id?: unknown;
  variants?: unknown;
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Fold the catalogue down to the handful of fields that are missing elsewhere.
 *
 * Exported for its own sake: the shape of the catalogue is the part most likely
 * to drift, and a parser is far easier to hold to a fixture than a fetch.
 */
export function foilIndexFromCatalog(catalog: unknown): PrintFoilIndex {
  const groups = (catalog as { cards?: Record<string, unknown> })?.cards;
  if (!groups || typeof groups !== "object") return {};

  const index: PrintFoilIndex = {};
  for (const group of Object.values(groups)) {
    if (!Array.isArray(group)) continue;
    for (const card of group as CatalogCard[]) {
      const id = card?.culture_invariant_id;
      if (id == null) continue;
      const key = String(id);

      for (const variant of (Array.isArray(card.variants)
        ? card.variants
        : []) as CatalogVariant[]) {
        const hotFoilColor = text(variant?.hot_foil_color);
        if (!hotFoilColor) continue;
        index[key] = {
          hotFoilColor,
          secondHotFoilColor: text(variant?.second_hot_foil_color),
          secondVarnishMaskUrl: text(variant?.second_foil_top_layer_mask_url),
        };
        // One coloured variant per print is all the catalogue carries, and all
        // the renderer can use.
        break;
      }
    }
  }
  return index;
}

async function fetchCatalog(
  language: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: CATALOG_AUTH,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal,
  });
  if (!tokenResponse.ok) throw new Error(`token ${tokenResponse.status}`);
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    token_type?: string;
  };
  if (!token.access_token) throw new Error("token missing access_token");

  const response = await fetch(`${CATALOG_URL}/${language}`, {
    headers: {
      authorization: `${token.token_type ?? "Bearer"} ${token.access_token}`,
    },
    signal,
  });
  if (!response.ok) throw new Error(`catalog ${response.status}`);
  return response.json();
}

/** Concurrent builds share one request rather than each fetching 4 MB. */
let inFlight: Promise<PrintFoilIndex> | null = null;

/**
 * The foil details for every print, from storage when it is still good.
 *
 * Held in the database rather than in memory so it survives a restart and is
 * shared between the app and the worker — the same reasoning, and the same
 * table, as every other durable provider yield.
 *
 * Never throws: without it the coats simply render without their own hue, which
 * is what happened before this existed.
 */
export async function loadPrintFoilIndex(options: {
  providerId: string;
  language: string;
  signal?: AbortSignal;
  now?: Date;
}): Promise<PrintFoilIndex> {
  const url = `${CATALOG_URL}/${options.language}`;

  const stored = await getFreshProviderEvidence(
    options.providerId,
    url,
    options.now,
  ).catch(() => null);
  if (stored?.yieldJson && typeof stored.yieldJson === "object") {
    return stored.yieldJson as PrintFoilIndex;
  }

  return (inFlight ??= (async () => {
    try {
      const catalog = await fetchCatalog(options.language, options.signal);
      const index = foilIndexFromCatalog(catalog);
      await putProviderEvidence({
        providerId: options.providerId,
        url,
        kind: EVIDENCE_KIND,
        yieldJson: index,
        ttlMs: PRINT_FOIL_TTL_MS,
      });
      return index;
    } catch {
      // The catalogue is a nicety, not a dependency.
      return {};
    } finally {
      inFlight = null;
    }
  })());
}

/** Drops the collapsed request, so tests do not leak one into the next. */
export function resetPrintFoilIndexCache(): void {
  inFlight = null;
}
