import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { PROVIDERS } from "@/services/provider/registry";

import {
  IMAGE_REMOTE_EXACT_HOSTS,
  IMAGE_REMOTE_WILDCARD_HOSTS,
  isNextImageRemoteHostAllowed,
  looksLikeRemoteImageUrl,
  nextImageRemotePatternCount,
} from "./nextImageRemoteHosts";

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
    expect(nextImageRemotePatternCount()).toBeLessThanOrEqual(50);
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
      "https://upload.wikimedia.org/wikipedia/fr/cover.png",
      "https://i.discogs.com/primary.jpeg",
    ];
    for (const url of samples) {
      const host = hostFromUrl(url);
      expect(host, url).not.toBeNull();
      expect(isNextImageRemoteHostAllowed(host!), url).toBe(true);
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
        isNextImageRemoteHostAllowed(host),
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
        ...(item.metadata?.attachments ?? []).map((attachment) => attachment.url),
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
      for (const match of setting.value?.matchAll(/https?:\/\/[^\s"'<>\\]+/g) ?? []) {
        if (looksLikeRemoteImageUrl(match[0])) urls.add(match[0]);
      }
    }

    expect(urls.size).toBeGreaterThan(0);
    const uncovered = [...urls]
      .map((url) => ({ url, host: hostFromUrl(url) }))
      .filter(
        (entry): entry is { url: string; host: string } =>
          Boolean(entry.host) && !isNextImageRemoteHostAllowed(entry.host),
      );

    expect(uncovered).toEqual([]);
  });

  it("documents wildcard and exact host lists without overlap confusion", () => {
    expect(IMAGE_REMOTE_WILDCARD_HOSTS).toContain("screenscraper.fr");
    expect(IMAGE_REMOTE_EXACT_HOSTS).toContain("imagedelivery.net");
  });
});
