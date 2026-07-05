import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { PROVIDERS } from "@/services/provider/catalog";

import { PRESTASHOP_RETAILER_CONFIGS } from "@/services/providers/prestashop/configs";
import { SHOPIFY_RETAILER_CONFIGS } from "@/services/providers/shopify/configs";
import { DEDICATED_CATALOG_IMAGE_HOSTS } from "@/lib/media/dedicatedCatalogImageHosts";

import {
  buildImageRemoteHostLists,
  catalogRetailerImageHosts,
  isNextImageRemoteHostAllowed,
  looksLikeRemoteImageUrl,
  nextImageRemotePatternCount,
} from "./nextImageRemoteHosts";

const CATALOG_IMAGE_HOSTS = catalogRetailerImageHosts([
  ...PRESTASHOP_RETAILER_CONFIGS,
  ...SHOPIFY_RETAILER_CONFIGS,
  ...DEDICATED_CATALOG_IMAGE_HOSTS,
]);

const IMAGE_REMOTE_HOST_LISTS = buildImageRemoteHostLists(CATALOG_IMAGE_HOSTS);

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostFromCoverUrlHost(fragment: string): string | null {
  const trimmed = fragment.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http")) {
    return hostFromUrl(trimmed);
  }
  const candidate = trimmed.split("/")[0]?.trim();
  if (!candidate || !candidate.includes(".")) return null;
  return candidate.toLowerCase();
}

describe("nextImageRemoteHosts", () => {
  it("stays within the Next.js remotePatterns budget", () => {
    expect(
      nextImageRemotePatternCount(IMAGE_REMOTE_HOST_LISTS),
    ).toBeLessThanOrEqual(50);
  });

  it("allows known provider image CDNs", () => {
    const samples = [
      "https://neoclone.screenscraper.fr/api2/mediaJeu.php",
      "https://cdn1.booknode.com/book_cover/1/full.jpg",
      "https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg",
      "https://imagedelivery.net/account/image/public",
      "https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg",
      "https://cdn.thegamesdb.net/images/original/boxart/front/1.jpg",
      "https://chocobonplan.com/wp-content/uploads/cover.png",
      "https://www.okkazeo.com/images/jeux/1_1.jpg",
      "https://www.espritjeu.com/upload/image/sample-grande.jpg",
      "https://www.myludo.fr/img/jeux/1680490604/300/ae/4503.png",
      "https://media.play-in.com/img/product/sample.png",
      "https://upload.wikimedia.org/wikipedia/fr/cover.png",
      "https://i.discogs.com/primary.jpeg",
      "https://www.monsieurde.com/1218-large_default/black-stories.jpg",
      "https://lesgentlemendujeu.com/6805-home_default/black-stories.jpg",
    ];
    for (const url of samples) {
      const host = hostFromUrl(url);
      expect(host, url).not.toBeNull();
      expect(
        isNextImageRemoteHostAllowed(host!, IMAGE_REMOTE_HOST_LISTS),
        url,
      ).toBe(true);
    }
  });

  it("covers catalog retailer shop domains (PrestaShop / Shopify)", () => {
    const { wildcards, exacts } = catalogRetailerImageHosts([
      ...PRESTASHOP_RETAILER_CONFIGS,
      ...SHOPIFY_RETAILER_CONFIGS,
    ]);

    expect(wildcards).toContain("monsieurde.com");
    expect(exacts).toContain("lesgentlemendujeu.com");

    for (const config of [
      ...PRESTASHOP_RETAILER_CONFIGS,
      ...SHOPIFY_RETAILER_CONFIGS,
    ]) {
      const host = new URL(config.baseUrl).hostname.toLowerCase();
      expect(
        isNextImageRemoteHostAllowed(host, IMAGE_REMOTE_HOST_LISTS),
        `uncovered catalog retailer host: ${host} (${config.id})`,
      ).toBe(true);
    }
  });

  it("covers registry coverUrlHost fragments", () => {
    const hosts = PROVIDERS.flatMap((provider) => {
      const fragments = [
        provider.coverUrlHost,
        provider.isbnCoverUrlTemplate,
      ].filter(Boolean) as string[];
      return fragments
        .map(hostFromCoverUrlHost)
        .filter((host): host is string => Boolean(host));
    });

    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(
        isNextImageRemoteHostAllowed(host, IMAGE_REMOTE_HOST_LISTS),
        `uncovered cover host: ${host}`,
      ).toBe(true);
    }
  });

  it("covers remote https image URLs persisted in the database", async () => {
    const urls = new Set<string>();
    const items = await prisma.item.findMany({
      select: {
        imageUrl: true,
        backgroundImageUrl: true,
        metadata: {
          select: {
            imageUrl: true,
            heroImageUrl: true,
            attachments: { select: { url: true } },
          },
        },
      },
    });

    for (const item of items) {
      for (const candidate of [
        item.imageUrl,
        item.backgroundImageUrl,
        item.metadata?.imageUrl,
        item.metadata?.heroImageUrl,
        ...(item.metadata?.attachments ?? []).map(
          (attachment) => attachment.url,
        ),
      ]) {
        if (candidate && looksLikeRemoteImageUrl(candidate)) {
          urls.add(candidate);
        }
      }
    }

    const settings = await prisma.setting.findMany({
      where: { key: { startsWith: "screenscraper:" } },
      select: { value: true },
    });
    for (const setting of settings) {
      for (const match of setting.value?.matchAll(/https?:\/\/[^\s"'<>\\]+/g) ??
        []) {
        if (looksLikeRemoteImageUrl(match[0])) urls.add(match[0]);
      }
    }

    expect(urls.size).toBeGreaterThan(0);
    const uncovered = [...urls]
      .map((url) => ({ url, host: hostFromUrl(url) }))
      .filter(
        (entry): entry is { url: string; host: string } =>
          entry.host !== null &&
          !isNextImageRemoteHostAllowed(entry.host, IMAGE_REMOTE_HOST_LISTS),
      );

    expect(uncovered).toEqual([]);
  });

  it("documents wildcard and exact host lists without overlap confusion", () => {
    expect(IMAGE_REMOTE_HOST_LISTS.wildcards).toContain("screenscraper.fr");
    expect(IMAGE_REMOTE_HOST_LISTS.exacts).toContain("imagedelivery.net");
  });
});
