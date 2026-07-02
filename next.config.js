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

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.rawg.io",
      },
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
      {
        protocol: "https",
        hostname: "cdn-images.dzcdn.net",
      },
      {
        protocol: "https",
        hostname: "cf.geekdo-images.com",
      },
      {
        protocol: "https",
        hostname: "covers.openlibrary.org",
      },
      {
        protocol: "https",
        hostname: "cdn1.booknode.com",
      },
      {
        protocol: "https",
        hostname: "coverproject.sfo2.cdn.digitaloceanspaces.com",
      },
      {
        protocol: "https",
        hostname: "img.chasse-aux-livres.fr",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "cdn.achatmoinscher.com",
      },
      {
        protocol: "https",
        hostname: "images.igdb.com",
      },
      {
        protocol: "https",
        hostname: "**.screenscraper.fr",
      },
      {
        protocol: "https",
        hostname: "www.achatmoinscher.com",
      },
      {
        protocol: "https",
        hostname: "static.fnac-static.com",
      },
      {
        protocol: "https",
        hostname: "apriloshop.fr",
      },
      {
        protocol: "https",
        hostname: "www.freakxy.fr",
      },
      {
        protocol: "https",
        hostname: "www.picclickimg.com",
      },
      {
        protocol: "https",
        hostname: "cdn2.steamgriddb.com",
      },
      {
        protocol: "https",
        hostname: "cdn.pji.nu",
      },
      {
        protocol: "https",
        hostname: "**.prisjakt.nu",
      },
      {
        protocol: "https",
        hostname: "i.discogs.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.booknode.com",
      },
    ],
  },
};

export default withSerwist(nextConfig);
