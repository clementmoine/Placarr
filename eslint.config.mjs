import pluginQuery from "@tanstack/eslint-plugin-query";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierRecommended from "eslint-plugin-prettier/recommended";

// Next 16 : `next lint` n'existe plus et eslint-config-next est nativement en
// flat config — plus de FlatCompat. `pnpm lint` = `eslint .`.
const eslintConfig = [
  {
    // `next lint` gérait ces exclusions ; avec `eslint .` elles doivent être
    // explicites. tests/fixtures = fichiers générés (record réseau),
    // scratch/ = scripts de debug gitignorés (Prettier les saute déjà).
    ignores: [
      ".next/",
      "node_modules/",
      "public/",
      "coverage/",
      "tests/fixtures/",
      "scratch/",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...pluginQuery.configs["flat/recommended"],
  prettierRecommended, // Ensures Prettier rules are applied
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Sweep 2026-07-02 : les ~130 `any` hérités sont typés — la règle est
      // remontée en erreur pour empêcher toute réintroduction.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      // Règles React Compiler arrivées avec eslint-config-next 16 : vrais
      // signaux, mais chaque fix est une refonte de composant à tester.
      // Burn-down suivi au backlog (« React Compiler rules sweep »).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },
  {
    // Scripts CommonJS : require() est l'idiome attendu.
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
