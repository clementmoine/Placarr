"use strict";

/**
 * typescript-eslint 8 `require("typescript")` and throws on major >= 7:
 * TS 7 ships `tsc` only, no JS compiler API (expected again in 7.1).
 *
 * Loaded first from `eslint.config.mjs` so every `eslint` invocation
 * (script, `pnpm exec`, editor) sees the TS 6 API. `tsc` / `next build`
 * keep resolving the real `typescript@7` package.
 *
 * https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0
 */
const Module = require("module");

const ts6 = require.resolve("@typescript/typescript6", {
  paths: [__dirname],
});

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveTypescript6(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "typescript") {
    return ts6;
  }
  return originalResolve.call(this, request, parent, isMain, options);
};
