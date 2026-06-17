// @ts-check
import withSerwistInit from "@serwist/next";

// You may want to use a more robust revision to cache
// files more efficiently.
// A viable option is `git rev-parse HEAD`.
const revision = crypto.randomUUID();

const withSerwist = withSerwistInit({
  cacheOnNavigation: true,
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/", revision }],
});

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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
        hostname: "neoclone.screenscraper.fr",
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
    ],
  },
};

export default withSerwist(nextConfig);
