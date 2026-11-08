/**
 * Trade graph helpers — {@link ItemTradeLink} edges between exchanged items.
 * One directed row is enough in DB; the product reads both sides as a pair.
 */

export type TradeLinkRole = "out" | "in";

export type TradeCounterpartRef = {
  id: string;
  name: string;
  slug?: string | null;
  shelfId?: string | null;
};

export type TradeLinkView = {
  id: string;
  role: TradeLinkRole;
  note: string | null;
  createdAt: Date | string;
  counterpart: TradeCounterpartRef;
};

type RawTradeEdge = {
  id: string;
  note: string | null;
  createdAt: Date | string;
  itemOutId: string;
  itemInId: string;
  itemOut?: TradeCounterpartRef | null;
  itemIn?: TradeCounterpartRef | null;
};

/**
 * Flatten out/in Prisma relations into a single counterpart list for the UI.
 */
export function tradeLinksForItem(
  itemId: string,
  edges: {
    out?: readonly RawTradeEdge[] | null;
    in?: readonly RawTradeEdge[] | null;
  },
): TradeLinkView[] {
  const views: TradeLinkView[] = [];
  const seen = new Set<string>();

  for (const edge of edges.out ?? []) {
    const counterpart = edge.itemIn;
    if (!counterpart?.id || counterpart.id === itemId) continue;
    if (seen.has(edge.id)) continue;
    seen.add(edge.id);
    views.push({
      id: edge.id,
      role: "out",
      note: edge.note,
      createdAt: edge.createdAt,
      counterpart: {
        id: counterpart.id,
        name: counterpart.name,
        slug: counterpart.slug ?? null,
        shelfId: counterpart.shelfId ?? null,
      },
    });
  }

  for (const edge of edges.in ?? []) {
    const counterpart = edge.itemOut;
    if (!counterpart?.id || counterpart.id === itemId) continue;
    if (seen.has(edge.id)) continue;
    seen.add(edge.id);
    views.push({
      id: edge.id,
      role: "in",
      note: edge.note,
      createdAt: edge.createdAt,
      counterpart: {
        id: counterpart.id,
        name: counterpart.name,
        slug: counterpart.slug ?? null,
        shelfId: counterpart.shelfId ?? null,
      },
    });
  }

  return views;
}

/** First counterpart name for badges (« Échangé ↔ Titre »). */
export function primaryTradeCounterpartName(
  links: readonly TradeLinkView[],
): string | null {
  const name = links[0]?.counterpart.name?.trim();
  return name || null;
}
