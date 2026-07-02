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
        hostname: "**.rawg.io",
      },
      {
        protocol: "https",
        hostname: "**.tmdb.org",
      },
      {
        protocol: "https",
        hostname: "cdn-images.dzcdn.net",
      },
      {
        protocol: "https",
        hostname: "**.geekdo-images.com",
      },
      {
        protocol: "https",
        hostname: "**.openlibrary.org",
      },
      {
        protocol: "https",
        hostname: "**.booknode.com",
      },
      {
        protocol: "https",
        hostname: "coverproject.sfo2.cdn.digitaloceanspaces.com",
      },
      {
        protocol: "https",
        hostname: "**.chasse-aux-livres.fr",
      },
      {
        protocol: "https",
        hostname: "**.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "**.achatmoinscher.com",
      },
      {
        protocol: "https",
        hostname: "**.igdb.com",
      },
      {
        protocol: "https",
        hostname: "**.screenscraper.fr",
      },
      {
        protocol: "https",
        hostname: "**.achatmoinscher.com",
      },
      {
        protocol: "https",
        hostname: "**.fnac-static.com",
      },
      {
        protocol: "https",
        hostname: "apriloshop.fr",
      },
      {
        protocol: "https",
        hostname: "**.freakxy.fr",
      },
      {
        protocol: "https",
        hostname: "**.picclickimg.com",
      },
      {
        protocol: "https",
        hostname: "**.steamgriddb.com",
      },
      {
        protocol: "https",
        hostname: "**.pji.nu",
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
      {
        protocol: "https",
        hostname: "**.okkazeo.com",
      },
      {
        protocol: "https",
        hostname: "**.bcd-jeux.fr",
      },
      {
        protocol: "https",
        hostname: "**.philibertnet.com",
      },
    ],
  },
};

export default withSerwist(nextConfig);
