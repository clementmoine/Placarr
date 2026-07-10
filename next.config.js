// @ts-check
import crypto from "node:crypto";
import withSerwistInit from "@serwist/next";
import { NEXT_IMAGE_CONFIG_REMOTE_PATTERNS } from "./src/core/enrich/media/nextImageRemoteHosts.ts";

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
    // Next.js caps remotePatterns at 50 — runtime host guard in `src/proxy.ts`.
    remotePatterns: NEXT_IMAGE_CONFIG_REMOTE_PATTERNS,
  },
};

export default withSerwist(nextConfig);
