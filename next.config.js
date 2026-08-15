// @ts-check
import crypto from "node:crypto";
import withSerwistInit from "@serwist/next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
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
  // Runtime data stays out of the standalone trace (multi‑GB under data/).
  outputFileTracingExcludes: {
    "*": ["./data/**"],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // Next.js caps remotePatterns at 50 — runtime host guard in `src/proxy.ts`.
    remotePatterns: NEXT_IMAGE_CONFIG_REMOTE_PATTERNS,
  },
  /**
   * Server packages Next must NOT bundle.
   *
   * This used to be `[]`, which reads like "nothing special to declare" but
   * actually *replaces* Next's own default list — 79 packages, `sharp` and
   * `pg` among them. Emptying it made the build bundle a native image library
   * and its platform binaries into the server output: 22-minute builds and a
   * 3.7 GB `.next`.
   *
   * The original intent was narrower — keep **`@prisma/client`** bundled,
   * because Prisma 7's real client lives in `src/generated` and the npm package
   * is an empty stub that looks for a missing `.prisma/client`. So the list is
   * Next's defaults intersected with what this project actually depends on,
   * minus that one entry.
   */
  serverExternalPackages: ["eslint", "pg", "prettier", "prisma", "sharp", "typescript"],
};

/**
 * Watch tuning for the dev server only.
 *
 * Foil/CDN dumps write heavily under ``data/``. Watching them forces webpack to
 * recompile on every texture pull (and races JSON parses on concurrent
 * ``/assets/...`` requests during invalidation).
 *
 * Deliberately outside `nextConfig`: since Next 16 the mere presence of a
 * `webpack` key makes `next build` fail, because builds run on Turbopack. This
 * block never applied to a build anyway — it was entirely inside `if (dev)`.
 */
const devWebpack = (config) => {
  const ignored = [
    "**/node_modules/**",
    "**/.git/**",
    "**/.next/**",
    "**/data/**",
    "**/scripts/lorcana/.venv/**",
    "**/scripts/pokemon/.venv/**",
    "**/src/providers/lorcanatcg/unity/.venv/**",
    "**/src/providers/pokemontcglive/unity/.venv/**",
    // Dumpers rewrite these in place; watching them recompiles mid-extract.
    "**/src/effects/**/cards.json",
    "**/src/effects/**/manifest.json",
  ];
  config.watchOptions = { ...config.watchOptions, ignored };
  return config;
};

/*
  Phase-aware config: the `webpack` key exists only for `next dev --webpack`.
  Absent everywhere else, `next build` runs on Turbopack — the Next 16 default,
  and 2 to 5 times faster.
*/
export default (phase) =>
  withSerwist(
    phase === PHASE_DEVELOPMENT_SERVER
      ? { ...nextConfig, webpack: devWebpack }
      : nextConfig,
  );
