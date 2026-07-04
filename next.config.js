// @ts-check
import crypto from "node:crypto";
import withSerwistInit from "@serwist/next";
import { nextImageRemotePatterns } from "./src/lib/media/nextImageRemoteHosts.ts";

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
    remotePatterns: nextImageRemotePatterns(),
  },
};

export default withSerwist(nextConfig);
