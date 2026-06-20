export function parseScreenScraperMediaUrl(url: string): {
  gameId?: number;
  systemId?: number;
} | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("screenscraper.fr")) return null;
    const gameId = Number(parsed.searchParams.get("jeuid"));
    const systemId = Number(parsed.searchParams.get("systemeid"));
    return {
      gameId: Number.isFinite(gameId) && gameId > 0 ? gameId : undefined,
      systemId:
        Number.isFinite(systemId) && systemId > 0 ? systemId : undefined,
    };
  } catch {
    return null;
  }
}
