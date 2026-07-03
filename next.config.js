// @ts-check
import crypto from "node:crypto";
import withSerwistInit from "@serwist/next";

const revision = crypto.randomUUID();

const withSerwist = withSerwistInit({
  disable: process.env.NODE_ENV !== "production",
  cacheOnNavigation: true,
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/", revision }],
});

/** Next.js 16 caps images.remotePatterns at 50 — one entry per host, no apex duplicates. */
const IMAGE_REMOTE_WILDCARD_HOSTS = [
  "achatmoinscher.com",
  "apriloshop.fr",
  "bcd-jeux.fr",
  "bedetheque.com",
  "booknode.com",
  "chasse-aux-livres.fr",
  "ebayimg.com",
  "fnac-static.com",
  "freakxy.fr",
  "geedie.lt",
  "geekdo-images.com",
  "googleapis.com",
  "historiquedesjeuxvideo.com",
  "icollecteverything.com",
  "igdb.com",
  "imagedelivery.net",
  "netgamesretro.com",
  "okkazeo.com",
  "openlibrary.org",
  "philibertnet.com",
  "picclickimg.com",
  "pji.nu",
  "prisjakt.nu",
  "rawg.io",
  "screenscraper.fr",
  "steamgriddb.com",
  "tmdb.org",
];

/** Hostnames that are not covered by **.{parent-domain} patterns. */
const IMAGE_REMOTE_EXACT_HOSTS = [
  "cdn-images.dzcdn.net",
  "coverproject.sfo2.cdn.digitaloceanspaces.com",
  "upload.wikimedia.org",
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Les données runtime ne font pas partie du build : sans cette exclusion le
  // tracing standalone recopiait tout public/uploads (plusieurs Go) et .cache
  // (index SQLite providers) dans .next/standalone à chaque build. Elles sont
  // écrites/servies au runtime et persistées par des volumes Docker.
  outputFileTracingExcludes: {
    "*": ["./public/uploads/**", "./.cache/**"],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      ...IMAGE_REMOTE_WILDCARD_HOSTS.map((hostname) => ({
        protocol: "https",
        hostname: `**.${hostname}`,
      })),
      ...IMAGE_REMOTE_EXACT_HOSTS.map((hostname) => ({
        protocol: "https",
        hostname,
      })),
      {
        protocol: "https",
        hostname: "i.discogs.com",
        pathname: "/**",
      },
    ],
  },
};

export default withSerwist(nextConfig);
