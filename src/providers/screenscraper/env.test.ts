import { describe, expect, it } from "vitest";

import {
  buildScreenScraperBaseParams,
  getScreenScraperEnv,
  SCREEN_SCRAPER_REQUEST_TIMEOUT_MS,
} from "./env";

describe("ScreenScraper env", () => {
  it("exposes a request timeout above the legacy 8s cap", () => {
    expect(SCREEN_SCRAPER_REQUEST_TIMEOUT_MS).toBeGreaterThan(8_000);
  });

  it("builds base API params from dev credentials", () => {
    const keys = [
      "SCREENSCRAPER_DEV_ID",
      "SCREENSCRAPER_DEV_PASSWORD",
      "SCREENSCRAPER_USER",
      "SCREENSCRAPER_PASSWORD",
    ] as const;
    const previous = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    process.env.SCREENSCRAPER_DEV_ID = "dev-id";
    process.env.SCREENSCRAPER_DEV_PASSWORD = "dev-pass";
    delete process.env.SCREENSCRAPER_USER;
    delete process.env.SCREENSCRAPER_PASSWORD;

    try {
      const credentials = getScreenScraperEnv();
      expect(credentials).not.toBeNull();
      if (!credentials) return;

      expect(buildScreenScraperBaseParams(credentials)).toEqual({
        devid: "dev-id",
        devpassword: "dev-pass",
        softname: "Placarr",
        output: "json",
      });
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("includes member credentials when configured", () => {
    const keys = [
      "SCREENSCRAPER_DEV_ID",
      "SCREENSCRAPER_DEV_PASSWORD",
      "SCREENSCRAPER_USER",
      "SCREENSCRAPER_PASSWORD",
    ] as const;
    const previous = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    process.env.SCREENSCRAPER_DEV_ID = "dev-id";
    process.env.SCREENSCRAPER_DEV_PASSWORD = "dev-pass";
    process.env.SCREENSCRAPER_USER = "member";
    process.env.SCREENSCRAPER_PASSWORD = "member-pass";

    try {
      const credentials = getScreenScraperEnv();
      expect(credentials).not.toBeNull();
      if (!credentials) return;

      expect(buildScreenScraperBaseParams(credentials)).toEqual({
        devid: "dev-id",
        devpassword: "dev-pass",
        softname: "Placarr",
        output: "json",
        ssid: "member",
        sspassword: "member-pass",
      });
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
