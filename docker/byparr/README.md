# Placarr Byparr

[Byparr](https://github.com/ThePhaseless/Byparr) (Camoufox) as the FlareSolverr-compatible challenge sidecar, plus Placarr patches:

- `download` / `downloadUrls` — browser-fetch image bytes after challenge (Booknode CDN)
- `sessions.*` — no-op (Byparr uses a fresh context per request)

```bash
docker compose up -d --build byparr
```

Point the app at it with `BYPARR_URL` (or legacy `FLARESOLVERR_URL`).

Corporate MITM (Zscaler): the image sets `ignore_https_errors=True` on the
Camoufox context so intercepted TLS still loads inside Docker.
