// @ts-check
import { NEXT_IMAGE_CONFIG_REMOTE_PATTERNS } from "./src/core/enrich/media/nextImageRemoteHosts.ts";

/**
 * Trees `@vercel/nft` must not walk. The webpack plugin ignores only
 * `node_modules` by default — `data/` (multi-GB foil dumps) and Python
 * venvs under provider `unity` folders were on the critical path (~11 min).
 * `outputFileTracingExcludes` only filters after that walk; these go into
 * `TraceEntryPointsPlugin.traceIgnores` so NFT never stats them.
 */
const NFT_TRACE_IGNORES = [
  "**/data/**",
  "**/.venv/**",
  "**/__pycache__/**",
  "**/*.pyc",
  "**/unity/.venv/**",
  "**/curated/cards/**",
  "**/scratch/**",
  "**/.tmp-*/**",
  "**/coverage/**",
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Next 16 writes AGENTS.md / CLAUDE.md on `next dev`. We already have
  // project rules under `.cursor/`; don't dump extra files into the tree.
  agentRules: false,
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
  outputFileTracingExcludes: {
    "*": [
      "./data/**",
      "./src/providers/**/unity/**",
      "./src/providers/**/unity/.venv/**",
      "./src/providers/**/curated/cards/**",
      "./scripts/**/.venv/**",
      "./**/.venv/**",
      "./**/__pycache__/**",
      "./scratch/**",
      "./coverage/**",
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    // Large app: lets webpack drop compilation caches between compilers
    // so the worker stays under the 16 GB heap cap in `package.json`.
    webpackMemoryOptimizations: true,
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
  serverExternalPackages: [
    "eslint",
    "pg",
    "prettier",
    "prisma",
    "sharp",
    "typescript",
  ],
};

/**
 * Watch tuning for the webpack *dev* server only.
 *
 * Foil/CDN dumps write heavily under ``data/``. Watching them forces webpack to
 * recompile on every texture pull (and races JSON parses on concurrent
 * ``/assets/...`` requests during invalidation).
 *
 * Deliberately outside `nextConfig`: since Next 16 the mere presence of a
 * `webpack` key makes a Turbopack `next build` fail. The key exists only when
 * `TURBOPACK` is unset (`next dev --webpack` / `pnpm build`).
 *
 * @param {{ watchOptions?: Record<string, unknown>, plugins?: { constructor?: { name?: string }, traceIgnores?: string[] }[] }} config
 * @param {{ dev?: boolean, isServer?: boolean, nextRuntime?: string }} options
 */
const applyWebpack = (config, { dev, isServer, nextRuntime }) => {
  if (dev) {
    const ignored = [
      "**/node_modules/**",
      "**/.git/**",
      "**/.next/**",
      "**/data/**",
      "**/scripts/lorcana/.venv/**",
      "**/scripts/pokemon/.venv/**",
      "**/src/providers/lorcanatcg/unity/.venv/**",
      "**/src/providers/pokemontcglive/unity/.venv/**",
      "**/src/effects/**/cards.json",
      "**/src/effects/**/manifest.json",
    ];
    config.watchOptions = { ...config.watchOptions, ignored };
    return config;
  }
  if (isServer && nextRuntime === "nodejs") {
    for (const plugin of config.plugins ?? []) {
      if (
        plugin?.constructor?.name === "TraceEntryPointsPlugin" &&
        Array.isArray(plugin.traceIgnores)
      ) {
        plugin.traceIgnores.push(...NFT_TRACE_IGNORES);
      }
    }
  }
  return config;
};

function nextConfigForPhase() {
  /*
    `PLACARR_DIST_DIR` construit ailleurs que dans `.next` — de quoi vérifier un
    build sans écraser celui du serveur de dev qui tourne. Vérification
    seulement : la sortie normale reste `.next`.

    Étalé dans un **nouvel** objet : Next gèle la config qu'il a lue, et y
    écrire échoue à la validation, avant le moindre message utile — un build
    muet pendant plusieurs minutes, puis une erreur qui ne dit pas d'où elle
    vient.
  */
  const distDir = process.env.PLACARR_DIST_DIR;
  const base = distDir ? { ...nextConfig, distDir } : nextConfig;
  // Turbopack rejects a `webpack` key. `pnpm build` is `--webpack`.
  if (process.env.TURBOPACK) return base;
  return {
    ...base,
    webpack: (config, options) => applyWebpack(config, options),
  };
}

export default nextConfigForPhase;
