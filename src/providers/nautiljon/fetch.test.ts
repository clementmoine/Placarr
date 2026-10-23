import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/http/scrapeFetch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/http/scrapeFetch")>();
  return {
    ...actual,
    fetchGetWithFlareFallback: vi.fn(),
  };
});

import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import {
  parseNautiljonSearchHits,
  parseNautiljonVolumeLinks,
  parseNautiljonVolumePage,
  resolveNautiljonVolume,
} from "./fetch";
import { mapNautiljonMetadata, nautiljonModule } from "./index";

const scrapeMock = vi.mocked(fetchGetWithFlareFallback);

const VOLUME_URL =
  "https://www.nautiljon.com/mangas/your+name./volume-1,25779.html";

function volumeHtml(overrides?: { ean?: string; title?: string }) {
  const ean = overrides?.ean ?? "9782811635862";
  const title = overrides?.title ?? "Your Name. Vol. 1";
  return `<!DOCTYPE html>
<html><head>
<meta property="og:title" content="${title}" />
<meta property="og:image" content="https://www.nautiljon.com/images/manga/00/11/your_name_11.jpg" />
<title>${title}</title>
</head><body>
<h1 class="h1titre"><span itemprop="name">${title}</span></h1>
<div class="image_fiche fleft"><a href="#"><img src="/images/manga/00/11/your_name_11.jpg" /></a></div>
<ul>
<li><span>Éditeur VF : </span>Pika(Shonen)</li>
<li><span>Éditeur VO : </span>MEDIA FACTORY</li>
<li><span>Date de parution VO : </span>23/08/2016</li>
<li><span>Date de parution VF : </span>05/07/2017</li>
<li><span>Prix : </span>7.70 € / 594 ¥</li>
<li><span>Nombre de pages : </span>180</li>
<li><span>Illustrations : </span>N&B</li>
<li><span>Code EAN : </span>${ean}</li>
</ul>
<span>Auteur : </span>Kotone Ranmaru
<a href="/mangas/your+name..html">Your Name.</a>
<div class="description"><p>Deux lycéens échangent leurs corps.</p></div>
</body></html>`;
}

function searchHtml() {
  return `<!DOCTYPE html><html><body>
<table><tbody></tbody>
<tbody>
<tr>
<td class="image"><img src="/imagesmin/manga/00/11/your_name_11.jpg" /></td>
<td class="left vtop"><span></span><a href="/mangas/your+name..html">Your Name.</a><p>Synopsis…</p></td>
<td class="acenter">Seinen</td>
<td class="acenter">3</td>
</tr>
</tbody></table>
<a href="/mangas/your+name./volume-1,25779.html">Vol. 1</a>
</body></html>`;
}

describe("parseNautiljonVolumePage", () => {
  it("extracts EAN, price, publisher and series", () => {
    const volume = parseNautiljonVolumePage(volumeHtml(), VOLUME_URL);
    expect(volume).toMatchObject({
      id: "25779",
      title: "Your Name. Vol. 1",
      barcode: "9782811635862",
      publisherVf: "Pika",
      demographic: "Shonen",
      pageCount: 180,
      priceEuroCents: 770,
      priceYen: 594,
      volumeNumber: 1,
      seriesName: "Your Name.",
      authors: ["Kotone Ranmaru"],
    });
    expect(volume?.releaseDateVf).toBe("2017-07-05");
    expect(volume?.imageUrl).toContain("your_name_11.jpg");
  });

  it("rejects pages without a volume id in the URL", () => {
    expect(
      parseNautiljonVolumePage(
        volumeHtml(),
        "https://www.nautiljon.com/mangas/your+name..html",
      ),
    ).toBeNull();
  });
});

describe("parseNautiljonSearchHits / volume links", () => {
  it("parses series rows and volume anchors", () => {
    const html = searchHtml();
    const hits = parseNautiljonSearchHits(html);
    expect(hits[0]?.title).toBe("Your Name.");
    expect(hits[0]?.url).toContain("/mangas/your+name..html");
    expect(parseNautiljonVolumeLinks(html)).toEqual([
      expect.objectContaining({ id: "25779" }),
    ]);
  });
});

describe("mapNautiljonMetadata", () => {
  it("emits barcode observations for a volume fiche", () => {
    const meta = mapNautiljonMetadata(
      parseNautiljonVolumePage(volumeHtml(), VOLUME_URL),
    );
    expect(meta?.barcode).toBe("9782811635862");
    expect(meta?.externalIds?.nautiljon).toBe("25779");
    expect(meta?.facts?.some((f) => f.kind === "price")).toBe(true);
    expect(meta?.observations?.length).toBeGreaterThan(0);
  });
});

describe("resolveNautiljonVolume", () => {
  beforeEach(() => {
    scrapeMock.mockReset();
  });

  it("matches barcode via search volume link and rejects EAN mismatch", async () => {
    scrapeMock.mockImplementation(async (url: string) => {
      if (String(url).includes("q=")) {
        return { status: 200, data: searchHtml() } as never;
      }
      if (String(url).includes("volume-1,25779")) {
        return { status: 200, data: volumeHtml() } as never;
      }
      return { status: 200, data: "<html></html>" } as never;
    });

    const hit = await resolveNautiljonVolume({
      barcode: "9782811635862",
      name: "Your Name. Vol. 1",
    });
    expect(hit?.id).toBe("25779");

    scrapeMock.mockImplementation(async (url: string) => {
      if (String(url).includes("q=")) {
        return { status: 200, data: searchHtml() } as never;
      }
      return {
        status: 200,
        data: volumeHtml({ ean: "9780000000000" }),
      } as never;
    });
    const miss = await resolveNautiljonVolume({
      barcode: "9782811635862",
    });
    expect(miss).toBeNull();
  });
});

describe("nautiljonModule", () => {
  it("declares books + price via defineProvider", () => {
    expect(nautiljonModule.info.id).toBe("nautiljon");
    expect(nautiljonModule.info.capabilities).toEqual(
      expect.arrayContaining(["identify", "price", "cover"]),
    );
    expect(nautiljonModule.refreshBarcodePriceOffers).toBeTypeOf("function");
  });
});
