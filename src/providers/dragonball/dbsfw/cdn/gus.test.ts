import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DBS_FW_CDN_ORIGIN, parseGusManifestXml } from "./gus";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8" ?> <actions version="0">
    <action type="extracted_size" data_size="7106264119"></action>
    <action type="torrent_download" torrent_type="3" torrent_link="$cdn_url/16741/full_games/full_game_/full_game_dc856891b7c7d3021a5eba934e2e71de_.7z.009.torrent" alt_data_link="16741/full_games/full_game_/full_game_dc856891b7c7d3021a5eba934e2e71de_.7z.009" data_size="348684244"></action>
    <action type="torrent_download" torrent_type="3" alt_data_link="16741/full_games/full_game_/full_game_dc856891b7c7d3021a5eba934e2e71de_.7z.001" data_size="524288000"></action>
    <action type="torrent_download" torrent_type="3" alt_data_link="16741/full_games/full_game_/full_game_dc856891b7c7d3021a5eba934e2e71de_.7z.002" data_size="524288000"></action>
    <action type="version" version="97"></action>
</actions>`;

describe("parseGusManifestXml", () => {
  it("reads version, buildId, stem and sorts volumes", () => {
    const m = parseGusManifestXml(FIXTURE);
    expect(m.version).toBe("97");
    expect(m.buildId).toBe("16741");
    expect(m.stem).toBe("full_game_dc856891b7c7d3021a5eba934e2e71de_");
    expect(m.extractedSize).toBe(7106264119);
    expect(m.volumes).toHaveLength(3);
    expect(m.firstVolume.fileName).toMatch(/\.7z\.001$/);
    expect(m.firstVolume.url).toBe(
      `${DBS_FW_CDN_ORIGIN}/16741/full_games/full_game_/full_game_dc856891b7c7d3021a5eba934e2e71de_.7z.001`,
    );
  });

  it("parses the live GUS fixture when present", () => {
    let xml: string;
    try {
      xml = readFileSync("/tmp/gus-fw.xml", "utf8");
    } catch {
      return;
    }
    const m = parseGusManifestXml(xml);
    expect(Number(m.version)).toBeGreaterThan(0);
    expect(m.volumes.length).toBeGreaterThanOrEqual(2);
    expect(m.firstVolume.url).toContain(m.buildId);
  });
});
