# Unity extract — Node only (ADR-021)

Hot path: `@/lib/unity` + `extractAllNode.ts` / related modules.
Golden fixtures under `fixtures/` (CDN AssetManifest samples).

Local `.venv/` is obsolete — delete if present. Frida QA scripts (if any)
remain separate and out of product extract.
