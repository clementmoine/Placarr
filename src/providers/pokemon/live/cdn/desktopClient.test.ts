import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  desktopClientNeedsDownload,
  parseUpdaterManifest,
  pokemonClientDataDir,
} from "./desktopClient";

/** Shape served by `rainier/updater/StandaloneOSX/Manifest.json` (2026-11). */
const MANIFEST = {
  CompressedArtifact: {
    MD5: "df851aaab247cc656cfe4c8558b6304a",
    Url: "https://cdn.studio-prod.pokemon.com/rainier/updater/StandaloneOSX/Contents.zip",
  },
  BackgroundImages: [],
  ReleaseNotes: {},
};

describe("parseUpdaterManifest", () => {
  it("reads the official client archive and its MD5", () => {
    expect(parseUpdaterManifest(MANIFEST)).toEqual({
      url: "https://cdn.studio-prod.pokemon.com/rainier/updater/StandaloneOSX/Contents.zip",
      md5: "df851aaab247cc656cfe4c8558b6304a",
    });
  });

  it("refuses an archive without MD5 or off the publisher CDN", () => {
    expect(
      parseUpdaterManifest({
        CompressedArtifact: { MD5: "", Url: MANIFEST.CompressedArtifact.Url },
      }),
    ).toBeNull();
    expect(
      parseUpdaterManifest({
        CompressedArtifact: {
          MD5: MANIFEST.CompressedArtifact.MD5,
          Url: "https://mirror.example.com/Contents.zip",
        },
      }),
    ).toBeNull();
    expect(parseUpdaterManifest(null)).toBeNull();
  });
});

describe("desktopClientNeedsDownload", () => {
  const latest = {
    md5: "aaa",
    url: "https://cdn.studio-prod.pokemon.com/x.zip",
  };

  it("downloads when the MD5 moved or the Data dir is gone", () => {
    expect(desktopClientNeedsDownload(null, latest, { hasData: true })).toBe(
      true,
    );
    expect(
      desktopClientNeedsDownload({ md5: "old" }, latest, { hasData: true }),
    ).toBe(true);
    expect(
      desktopClientNeedsDownload({ md5: "aaa" }, latest, { hasData: false }),
    ).toBe(true);
  });

  it("skips a client already unpacked for this MD5 unless forced", () => {
    expect(
      desktopClientNeedsDownload({ md5: "aaa" }, latest, { hasData: true }),
    ).toBe(false);
    expect(
      desktopClientNeedsDownload({ md5: "aaa" }, latest, {
        hasData: true,
        force: true,
      }),
    ).toBe(true);
  });
});

describe("pokemonClientDataDir", () => {
  it("is the unpacked desktop Data dir when it holds Unity serialized files", () => {
    const staging = mkdtempSync(path.join(tmpdir(), "poke-client-"));
    expect(pokemonClientDataDir(staging)).toBeNull();
    const data = path.join(staging, "desktop-client", "Data");
    mkdirSync(data, { recursive: true });
    expect(pokemonClientDataDir(staging)).toBeNull();
    writeFileSync(path.join(data, "sharedassets1.assets"), "x");
    expect(pokemonClientDataDir(staging)).toBe(data);
  });
});
