/**
 * Kind-aware fuse: card art-band vs sealed full-frame product matches.
 * Confident sealed FP forbidden — honest doubt / miss only.
 */
import {
  IDENTIFY_DOUBT_MAX,
  IDENTIFY_DOUBT_RADIUS_EMBED,
  IDENTIFY_EMBED_SHORTLIST_MAX,
  IDENTIFY_SURE_EMBED,
  IDENTIFY_SURE_MARGIN_EMBED,
  type IdentifyConfidence,
} from "@/core/identify/identifyConfidence";

export type FuseCardMatch = {
  printKey: string;
  distance: number;
  confidence?: IdentifyConfidence;
  faceUrl?: string | null;
  packId?: string | null;
  lang?: string | null;
  ambiguous?: boolean;
};

export type FuseProductMatch = {
  productKey: string;
  distance: number;
  faceUrl?: string | null;
  packId?: string | null;
  lang?: string | null;
  slug?: string | null;
  ambiguous?: boolean;
};

export type IdentifyFuseKind = "card" | "product" | "doubt" | "miss";

export type FuseShortlistEntry =
  | {
      kind: "card";
      printKey: string;
      distance: number;
      faceUrl?: string | null;
      packId?: string | null;
      lang?: string | null;
      ambiguous?: boolean;
    }
  | {
      kind: "product";
      productKey: string;
      distance: number;
      faceUrl?: string | null;
      packId?: string | null;
      lang?: string | null;
      slug?: string | null;
      ambiguous?: boolean;
    };

export type ProductIdentifyFuseResult = {
  kind: IdentifyFuseKind;
  /** Sure only when a single kind wins clearly — never sure sealed on collision. */
  confidence: IdentifyConfidence;
  cards: FuseCardMatch[];
  products: FuseProductMatch[];
  shortlist: FuseShortlistEntry[];
};

export type ProductConfidenceResult = {
  matches: FuseProductMatch[];
  confidence: IdentifyConfidence;
};

/**
 * Product-only sure / doubt / miss — same embed ceilings as cards.
 * No cross-game abstain (productKey is pack-scoped).
 */
export function finalizeProductIdentifyConfidence(
  matches: readonly FuseProductMatch[],
): ProductConfidenceResult {
  if (!matches.length) {
    return { matches: [], confidence: "miss" };
  }
  const sorted = [...matches].sort(
    (a, b) =>
      a.distance - b.distance || a.productKey.localeCompare(b.productKey),
  );
  const top = sorted[0]!;
  if (top.distance > IDENTIFY_EMBED_SHORTLIST_MAX) {
    return { matches: [], confidence: "miss" };
  }

  const second = sorted[1];
  const marginOk =
    !second || second.distance - top.distance >= IDENTIFY_SURE_MARGIN_EMBED;
  const sure = marginOk && top.distance <= IDENTIFY_SURE_EMBED;

  if (sure) {
    return {
      matches: [{ ...top, ambiguous: undefined }],
      confidence: "sure",
    };
  }

  const radius = IDENTIFY_DOUBT_RADIUS_EMBED;
  const near = sorted.filter((row) => row.distance <= top.distance + radius);
  return {
    matches: near.slice(0, IDENTIFY_DOUBT_MAX).map((row) => ({
      ...row,
      ambiguous: true,
    })),
    confidence: "doubt",
  };
}

type CardBand = {
  confidence: IdentifyConfidence;
  top: FuseCardMatch | null;
  /** Soft shortlist — not sure-band (e.g. embed 282 DBS FP on a booster). */
  soft: boolean;
};

function cardBand(matches: readonly FuseCardMatch[]): CardBand {
  if (!matches.length) {
    return { confidence: "miss", top: null, soft: false };
  }
  const sorted = [...matches].sort(
    (a, b) =>
      a.distance - b.distance || a.printKey.localeCompare(b.printKey),
  );
  const top = sorted[0]!;
  if (top.distance > IDENTIFY_EMBED_SHORTLIST_MAX) {
    return { confidence: "miss", top: null, soft: false };
  }

  const explicit = top.confidence;
  if (explicit === "miss") {
    return { confidence: "miss", top: null, soft: false };
  }
  if (explicit === "sure") {
    return { confidence: "sure", top, soft: false };
  }
  if (explicit === "doubt") {
    return { confidence: "doubt", top, soft: true };
  }

  const second = sorted[1];
  const marginOk =
    !second || second.distance - top.distance >= IDENTIFY_SURE_MARGIN_EMBED;
  if (marginOk && top.distance <= IDENTIFY_SURE_EMBED) {
    return { confidence: "sure", top, soft: false };
  }
  return { confidence: "doubt", top, soft: true };
}

/** Cross-kind conflict window (same milli units as card sure margin). */
const KIND_CONFLICT_MARGIN = IDENTIFY_SURE_MARGIN_EMBED;

function toCardEntry(row: FuseCardMatch, ambiguous?: boolean): FuseShortlistEntry {
  return {
    kind: "card",
    printKey: row.printKey,
    distance: row.distance,
    faceUrl: row.faceUrl,
    packId: row.packId,
    lang: row.lang,
    ambiguous: ambiguous ?? row.ambiguous,
  };
}

function toProductEntry(
  row: FuseProductMatch,
  ambiguous?: boolean,
): FuseShortlistEntry {
  return {
    kind: "product",
    productKey: row.productKey,
    distance: row.distance,
    faceUrl: row.faceUrl,
    packId: row.packId,
    lang: row.lang,
    slug: row.slug,
    ambiguous: ambiguous ?? row.ambiguous,
  };
}

function productSureResult(
  products: FuseProductMatch[],
): ProductIdentifyFuseResult {
  return {
    kind: "product",
    confidence: "sure",
    cards: [],
    products,
    shortlist: products.map((row) => toProductEntry(row)),
  };
}

function cardSureResult(card: FuseCardMatch): ProductIdentifyFuseResult {
  return {
    kind: "card",
    confidence: "sure",
    cards: [card],
    products: [],
    shortlist: [toCardEntry(card)],
  };
}

/**
 * Fuse card + product shortlists into a single kind decision for the scanner.
 */
export function fuseCardAndProductIdentify(
  cards: readonly FuseCardMatch[],
  products: readonly FuseProductMatch[],
): ProductIdentifyFuseResult {
  const card = cardBand(cards);
  const product = finalizeProductIdentifyConfidence(products);

  if (card.confidence === "miss" && product.confidence === "miss") {
    return {
      kind: "miss",
      confidence: "miss",
      cards: [],
      products: [],
      shortlist: [],
    };
  }

  // Soft / miss card + clear product → product (booster packshot vs DBS FP).
  if (
    product.confidence === "sure" &&
    (card.confidence === "miss" || card.soft || card.confidence === "doubt")
  ) {
    return productSureResult(product.matches);
  }

  if (card.confidence === "sure" && product.confidence === "miss") {
    return cardSureResult(card.top!);
  }

  // Sure vs sure — prefer clearer distance; near conflict → doubt.
  if (card.confidence === "sure" && product.confidence === "sure") {
    const c = card.top!;
    const p = product.matches[0]!;
    const delta = Math.abs(c.distance - p.distance);
    if (delta < KIND_CONFLICT_MARGIN) {
      return {
        kind: "doubt",
        confidence: "doubt",
        cards: [c],
        products: product.matches,
        shortlist: [toCardEntry(c, true), toProductEntry(p, true)],
      };
    }
    if (p.distance < c.distance) {
      return productSureResult(product.matches);
    }
    return cardSureResult(c);
  }

  // Remaining soft / mixed doubt — carousel, never sure sealed.
  const cardRows =
    card.confidence === "miss" || !card.top
      ? []
      : [...cards]
          .filter((row) => row.distance <= IDENTIFY_EMBED_SHORTLIST_MAX)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, IDENTIFY_DOUBT_MAX);
  const productRows = product.matches;

  if (!cardRows.length && productRows.length) {
    const sure = product.confidence === "sure";
    return {
      kind: sure ? "product" : "doubt",
      confidence: sure ? "sure" : "doubt",
      cards: [],
      products: productRows,
      shortlist: productRows.map((row) => toProductEntry(row, !sure)),
    };
  }

  if (cardRows.length && !productRows.length) {
    const sure = card.confidence === "sure" && !card.soft;
    return {
      kind: sure ? "card" : "doubt",
      confidence: sure ? "sure" : "doubt",
      cards: sure ? [cardRows[0]!] : cardRows,
      products: [],
      shortlist: (sure ? [cardRows[0]!] : cardRows).map((row) =>
        toCardEntry(row, !sure),
      ),
    };
  }

  const shortlist: FuseShortlistEntry[] = [
    ...cardRows.map((row) => toCardEntry(row, true)),
    ...productRows.map((row) => toProductEntry(row, true)),
  ]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, IDENTIFY_DOUBT_MAX);

  return {
    kind: "doubt",
    confidence: "doubt",
    cards: cardRows,
    products: productRows,
    shortlist,
  };
}
