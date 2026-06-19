export const SCREEN_SCRAPER_ENV_NAMES = [
  "SCREENSCRAPER_DEV_ID",
  "SCREENSCRAPER_DEV_PASSWORD",
];

export type ScreenScraperEnv = {
  devId: string;
  devPass: string;
  ssUser: string;
  ssPass: string;
  devDebugPassword: string;
  forceUpdate: boolean;
};

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

export function getScreenScraperEnv(): ScreenScraperEnv | null {
  const devId = env("SCREENSCRAPER_DEV_ID");
  const devPass = env("SCREENSCRAPER_DEV_PASSWORD");
  const ssUser = env("SCREENSCRAPER_USER");
  const ssPass = env("SCREENSCRAPER_PASSWORD");
  const devDebugPassword = env("SCREENSCRAPER_DEV_DEBUG_PASSWORD");

  if (!devId || !devPass) return null;

  return {
    devId,
    devPass,
    ssUser,
    ssPass,
    devDebugPassword,
    forceUpdate: process.env.SCREENSCRAPER_FORCE_UPDATE === "1",
  };
}

export function isScreenScraperConfigured(): boolean {
  return Boolean(getScreenScraperEnv());
}

export function getScreenScraperDebugParams(
  credentials: ScreenScraperEnv,
): Record<string, string> {
  if (!credentials.forceUpdate || !credentials.devDebugPassword) return {};
  return {
    devdebugpassword: credentials.devDebugPassword,
    forceupdate: "1",
  };
}
