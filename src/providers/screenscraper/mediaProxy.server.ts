import { isScreenScraperMediaUrl } from "@/core/enrich/media/remoteImageProxyHosts";
import { buildScreenScraperBaseParams, getScreenScraperEnv } from "./env";
import { getCachedScreenScraperGame } from "./cache";
import { parseScreenScraperMediaUrl, pickSSCover } from "./mediaUrl";

/**
 * Attach developer credentials to a bare ScreenScraper media URL so
 * `mediaJeu.php` returns the image instead of a login-error page.
 *
 * Server-only: the credentialed URL is used solely for the outbound fetch in
 * `/api/media/remote` and is never returned to the client. Credentials are
 * appended (not re-serialized) so the original `media=box-2D(eu)` param keeps
 * its literal parentheses.
 */
export function screenScraperMediaFetchUrl(url: string): string {
  if (!isScreenScraperMediaUrl(url)) return url;

  const env = getScreenScraperEnv();
  if (!env) return url;

  const creds = new URLSearchParams();
  for (const [key, value] of Object.entries(
    buildScreenScraperBaseParams(env),
  )) {
    // `output=json` would make the media endpoint return JSON, not the image.
    if (key === "output" || !value) continue;
    creds.set(key, value);
  }

  const query = creds.toString();
  if (!query) return url;

  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

/**
 * A stored ScreenScraper cover can point at a region the game doesn't actually
 * have (e.g. legacy `box-2D(eu)`), for which the API returns `NOMEDIA`. Recover
 * an actually-available cover from the cached game so old items self-heal at
 * display time. Cache-only — never triggers an extra API call — so it returns
 * null when the game isn't cached (the item's next metadata refresh fixes it).
 */
export async function resolveScreenScraperCoverFallback(
  url: string,
): Promise<string | null> {
  if (!isScreenScraperMediaUrl(url)) return null;

  const gameId = parseScreenScraperMediaUrl(url)?.gameId;
  if (!gameId) return null;

  const game = await getCachedScreenScraperGame(gameId, { allowStale: true });
  const fallback = game?.medias ? pickSSCover(game.medias) : null;

  return fallback && fallback !== url ? fallback : null;
}
