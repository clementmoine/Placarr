// Static provider platform snapshots fetched on 2026-06-22.
// Sources:
// - ScreenScraper api2/systemesListe.php (names only, media URLs intentionally omitted)
// - LaunchBox Games Database public platform select
// These are build-time data for aliases/audits; the app must not fetch them live.
//
// Data lives in ./data/*.json — regenerate by editing those files (or re-exporting
// from the upstream lists). Keep this module as the typed loader only.

import launchBoxPlatforms from "./data/launchBoxPlatforms.json";
import screenScraperPlatforms from "./data/screenScraperPlatforms.json";

export type ScreenScraperPlatformReference = {
  id: number;
  type: string;
  names: readonly string[];
};

export type LaunchBoxPlatformReference = {
  id: number;
  name: string;
};

export const SCREEN_SCRAPER_PLATFORM_REFERENCES =
  screenScraperPlatforms as readonly ScreenScraperPlatformReference[];

export const LAUNCHBOX_PLATFORM_REFERENCES =
  launchBoxPlatforms as readonly LaunchBoxPlatformReference[];
