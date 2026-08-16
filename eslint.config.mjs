import "./eslint-ts6-alias.cjs";
import pluginQuery from "@tanstack/eslint-plugin-query";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierRecommended from "eslint-plugin-prettier/recommended";

// Next 16 : `next lint` n'existe plus et eslint-config-next est nativement en
// flat config — plus de FlatCompat. `pnpm lint` = `eslint .`.
//
// `eslint-ts6-alias.cjs` doit rester le premier import : typescript-eslint 8
// n'a pas d'API TS 7. `tsc` / `next build` restent sur typescript@7.
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
      // Dumps / audit locaux (gitignorés) — pas du source produit.
      "data/",
      ".tmp-foil-audit/",
      ".tmp-rebase-aside/",
      "**/unity/.venv/",
      "scripts/**/.venv/",
      // Client Prisma généré (prisma generate) — jamais édité à la main.
      "src/generated/",
      "next-env.d.ts",
      "eslint-ts6-alias.cjs",
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
      // Sweep 2026-07-02 : imports/variables morts purgés — en erreur, avec
      // les conventions habituelles (`_` = volontairement inutilisé,
      // rest-siblings = destructuration d'omission).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
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
