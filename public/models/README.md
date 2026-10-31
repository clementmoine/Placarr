# Scan models (client WASM / WebGPU)

Served as static assets under `/models/…` (immutable cache, CORP cross-origin). Prefetched once at camera start; browser cache + IndexedDB (DocAligner) avoid re-downloads.

| File | Role |
|------|------|
| `lcnet100_h_e_bifpn_256_fp32.onnx` | DocAligner subject quad |
| `ppocr/PP-OCRv5_mobile_det_infer.onnx` | PP-OCRv5 text detection (script-agnostic) |
| `ppocr/latin_PP-OCRv5_mobile_rec_infer.onnx` | PP-OCRv5 Latin mobile recognizer (FR/EN/DE/ES…) |
| `ppocr/ppocrv5_latin_dict.txt` | Latin recognizer dictionary |

PP-OCR files mirror the `V5_LATIN_MOBILE_MODEL` preset of `ppu-paddle-ocr` (same engine the server fallback runs on `onnxruntime-node`), fetched from `https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main`. Self-hosting keeps the scan loop independent from third-party rate limits.

Embedding shards live under pack data: `/assets/<pack>/card-embedding-index.{json,f16}` (written by Sync).
