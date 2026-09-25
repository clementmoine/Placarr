/**
 * Unit tests for Rainier GameSettings contentpath helpers (no network).
 */
import { describe, expect, it } from "vitest";

import {
  contentBaseFromGameSettings,
  contentPathField,
  gameSettingsUrl,
  normalizeContentBase,
  syntheticContentBase,
} from "./gameSettings";

describe("gameSettings", () => {
  it("builds_game_settings_url", () => {
    expect(gameSettingsUrl("1.40.0")).toBe(
      "https://cdn.studio-prod.pokemon.com/rainier/GameSettings/1.40.0/GameSettings.json",
    );
  });

  it("reads_android_contentpath", () => {
    const base = contentBaseFromGameSettings({
      data: {
        android_contentpath:
          "https://cdn.studio-preprod.pokemon.biz/rainier/Content/Android/1.41.0",
        osxplayer_contentpath: "https://example.invalid/osx/",
      },
    });
    expect(base).toBe(
      "https://cdn.studio-preprod.pokemon.biz/rainier/Content/Android/1.41.0/",
    );
  });

  it("prefers_redirect_when_asked", () => {
    const base = contentBaseFromGameSettings(
      {
        data: {
          android_contentpath: "https://a.example/old/",
          android_env_redirect_contentpath: "https://b.example/new/",
        },
      },
      { preferRedirect: true },
    );
    expect(base).toBe("https://b.example/new/");
  });

  it("synthetic_matches_historical_android_layout", () => {
    expect(syntheticContentBase("1.40.0")).toBe(
      "https://cdn.studio-prod.pokemon.com/rainier/Content/Android/1.40.0/",
    );
    expect(contentPathField("android")).toBe("android_contentpath");
    expect(normalizeContentBase("https://x/y")).toBe("https://x/y/");
  });
});
