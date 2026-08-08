/**
 * Rainier GameSettings — authoritative CDN content base (ptcgl.dev / Live client).
 *
 * ``{platform}_contentpath`` is public JSON. The host is not stable across
 * client bumps (prod → preprod migrations); prefer this over hardcoding
 * ``cdn.studio-prod.pokemon.com``.
 */

import { CDN_HOST, DEFAULT_UA, DEFAULT_VERSION } from "./cdn";

export type RainierPlatform =
  | "android"
  | "iphoneplayer"
  | "osxplayer"
  | "windowsplayer";

export const DEFAULT_RAINIER_PLATFORM: RainierPlatform = "android";

export type GameSettingsPayload = {
  title?: string;
  editdate?: string;
  data?: Record<string, unknown>;
};

export function gameSettingsUrl(
  version: string = DEFAULT_VERSION,
  host: string = CDN_HOST,
): string {
  const v = version.trim() || DEFAULT_VERSION;
  const base = host.replace(/\/$/, "");
  return `${base}/rainier/GameSettings/${v}/GameSettings.json`;
}

export function contentPathField(
  platform: RainierPlatform = DEFAULT_RAINIER_PLATFORM,
): string {
  return `${platform}_contentpath`;
}

/**
 * Normalize a contentpath to always end with ``/``.
 * Live returns e.g. ``https://…/Content/Android/1.40.0/``.
 */
export function normalizeContentBase(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/** Fallback when GameSettings is unreachable (same shape Live used historically). */
export function syntheticContentBase(
  version: string = DEFAULT_VERSION,
  platform: RainierPlatform = DEFAULT_RAINIER_PLATFORM,
  host: string = CDN_HOST,
): string {
  const folder =
    platform === "android"
      ? "Android"
      : platform === "iphoneplayer"
        ? "iOS"
        : platform === "osxplayer"
          ? "StandaloneOSX"
          : "StandaloneWindows64";
  return normalizeContentBase(
    `${host.replace(/\/$/, "")}/rainier/Content/${folder}/${version.trim() || DEFAULT_VERSION}/`,
  );
}

export function contentBaseFromGameSettings(
  payload: GameSettingsPayload | Record<string, unknown>,
  opts: {
    platform?: RainierPlatform;
    preferRedirect?: boolean;
  } = {},
): string | null {
  const platform = opts.platform ?? DEFAULT_RAINIER_PLATFORM;
  const data =
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    payload.data &&
    typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : (payload as Record<string, unknown>);

  const keys = opts.preferRedirect
    ? [`${platform}_env_redirect_contentpath`, contentPathField(platform)]
    : [contentPathField(platform), `${platform}_env_redirect_contentpath`];

  for (const key of keys) {
    const raw = data[key];
    if (typeof raw === "string" && raw.trim()) {
      return normalizeContentBase(raw);
    }
  }
  return null;
}

export async function fetchContentBase(opts: {
  version?: string;
  platform?: RainierPlatform;
  host?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{
  contentBase: string;
  source: "game-settings" | "synthetic";
  version: string;
}> {
  const version = opts.version?.trim() || DEFAULT_VERSION;
  const platform = opts.platform ?? DEFAULT_RAINIER_PLATFORM;
  const host = opts.host ?? CDN_HOST;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = gameSettingsUrl(version, host);
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": DEFAULT_UA },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as GameSettingsPayload;
    const fromSettings = contentBaseFromGameSettings(payload, { platform });
    if (fromSettings) {
      return { contentBase: fromSettings, source: "game-settings", version };
    }
  } catch {
    /* fall through */
  }
  return {
    contentBase: syntheticContentBase(version, platform, host),
    source: "synthetic",
    version,
  };
}
