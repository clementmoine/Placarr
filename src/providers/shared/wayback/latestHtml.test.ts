import { describe, expect, it } from "vitest";

import { fetchWaybackLatestHtml, waybackCdxQueryUrl } from "./latestHtml";

const PAGE = "https://www.coleka.com/fr/x/micropopz_r2836";
const HTML = `<html>${"x".repeat(500)}</html>`;

describe("fetchWaybackLatestHtml", () => {
  it("demande les colonnes lues par fetchCdxRows (timestamp, original…)", () => {
    // Sans `fl=`, le CDX renvoie la urlkey en tête et décale toutes les colonnes.
    expect(waybackCdxQueryUrl(PAGE)).toContain(
      "fl=timestamp,original,mimetype,statuscode",
    );
  });

  it("prend la capture 200 la plus récente, citation ouvrable", async () => {
    const fetched: string[] = [];
    const capture = await fetchWaybackLatestHtml(PAGE, {
      fetchRows: async (url) => {
        expect(url).toBe(waybackCdxQueryUrl(PAGE));
        return [
          {
            timestamp: "20191112084822",
            original: PAGE,
            mimetype: "text/html",
            statuscode: "200",
          },
          {
            timestamp: "20250609152258",
            original: PAGE,
            mimetype: "text/html",
            statuscode: "200",
          },
          {
            timestamp: "20260101000000",
            original: PAGE,
            mimetype: "text/html",
            statuscode: "302",
          },
        ];
      },
      fetchText: async (url) => {
        fetched.push(url);
        return HTML;
      },
    });
    expect(fetched).toEqual([
      `https://web.archive.org/web/20250609152258id_/${PAGE}`,
    ]);
    expect(capture).toMatchObject({
      html: HTML,
      timestamp: "20250609152258",
      citationUrl: `https://web.archive.org/web/20250609152258/${PAGE}`,
    });
  });

  it("rend null sans capture ou sur échec CDX", async () => {
    expect(
      await fetchWaybackLatestHtml(PAGE, {
        fetchRows: async () => [],
        fetchText: async () => HTML,
      }),
    ).toBeNull();
    expect(
      await fetchWaybackLatestHtml(PAGE, {
        fetchRows: async () => {
          throw new Error("CDX down");
        },
      }),
    ).toBeNull();
  });
});
