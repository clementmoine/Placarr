// @ts-check
import crypto from "node:crypto";
import withSerwistInit from "@serwist/next";
import { PRESTASHOP_RETAILER_CONFIGS } from "./src/services/providers/prestashop/configs.ts";
import { SHOPIFY_RETAILER_CONFIGS } from "./src/services/providers/shopify/configs.ts";
import { DEDICATED_CATALOG_IMAGE_HOSTS } from "./src/lib/media/dedicatedCatalogImageHosts.ts";
import {
  catalogRetailerImageHosts,
  nextImageRemotePatterns,
} from "./src/lib/media/nextImageRemoteHosts.ts";

const catalogImageHosts = catalogRetailerImageHosts([
  ...PRESTASHOP_RETAILER_CONFIGS,
  ...SHOPIFY_RETAILER_CONFIGS,
  ...DEDICATED_CATALOG_IMAGE_HOSTS,
]);

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
    remotePatterns: nextImageRemotePatterns(catalogImageHosts),
  },
};

export default withSerwist(nextConfig);
