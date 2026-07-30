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
  /**
   * Hosts allowed to load dev assets, for testing on a phone over the LAN.
   *
   * `next dev` answers 403 to any `/_next/*` request carrying a cross-origin
   * `Origin` header, which is every request a browser makes to
   * `http://192.168.x.y:3000`. The page itself still renders, so the failure
   * looks like anything but what it is: the client bundle never boots, so React
   * never hydrates — the UI shows raw i18n keys (`auth.loginButton`), and the
   * login form submits natively and comes back blank instead of signing you in.
   *
   * Private ranges only, and `next dev` only, so nothing routable can reach it.
   * A home network hands out a different address often enough that pinning one
   * would only break again.
   */
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "*.local",
    "*.localhost",
  ],
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
  // Prisma 7 client lives in src/generated — do not externalize the empty
  // npm `@prisma/client` stub (it looks for missing `.prisma/client`).
  serverExternalPackages: [],
};

export default withSerwist(nextConfig);
