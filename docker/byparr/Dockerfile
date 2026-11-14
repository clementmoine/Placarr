# Placarr Byparr: Camoufox Flare-compatible /v1 + browser downloadUrls.
# Stock Byparr has no image download / session API; Placarr needs downloadUrls
# for Booknode CDN (cf_clearance is TLS-bound — Node re-fetch 403s).
FROM ghcr.io/thephaseless/byparr:latest

COPY models.py endpoints.py content.py /app/src/

# Corporate MITM (Zscaler etc.) presents an untrusted issuer to Camoufox inside
# Docker; host curl trusts the CA via macOS keychain. Ignore HTTPS errors so
# challenges still solve on intercepted egress.
USER root
RUN sed -i \
  's/context = await browser.new_context()/context = await browser.new_context(ignore_https_errors=True)/' \
  /app/src/utils.py
# Upstream image runs as a non-root user when present; restore if defined.
USER 1000
