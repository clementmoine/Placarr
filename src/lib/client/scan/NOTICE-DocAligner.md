# DocAligner (live corner model)

Placarr loads DocAligner LCNet ONNX weights (Apache License 2.0) from
DocsaidLab / DOCSAID for card-corner detection when classical Sobel misses
(bright desks, foil, sleeves).

- Model: `lcnet100_h_e_bifpn_256_fp32.onnx` (~4.5 MB) — prefer over FastViT.
- Hosted at `/models/lcnet100_h_e_bifpn_256_fp32.onnx` (override via
  `localStorage.placarr.scan.docalignerUrl`).
- Enabled by default; disable with `localStorage.placarr.scan.docaligner=0`.
- Runtime: `onnxruntime-web` (WASM). Weights cached in IndexedDB
  (`placarr-scan-models`).

See https://docsaid.org/en/models/docaligner and Apache-2.0 NOTICE from DOCSAID.
CollectorVision / Cornelius / Milo (AGPL) are intentionally not used.
