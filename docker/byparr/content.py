import base64
from urllib.parse import urljoin, urlsplit

from playwright.async_api import Page

from src.models import DownloadedImage, LinkRequest
from src.utils import logger

_BROWSER_FETCH_B64_JS = """
async (url) => {
  try {
    const r = await fetch(url, { credentials: 'include', cache: 'force-cache' });
    if (!r.ok) return { error: 'HTTP ' + r.status };
    const mime = r.headers.get('content-type') || '';
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return { encoded: btoa(binary), mime };
  } catch (e) {
    return { error: String(e) };
  }
}
"""


async def build_response_content(
    page: Page,
    request: LinkRequest,
    page_request: object,
) -> tuple[str, str]:
    """Build (content_type, response_content) from the settled page."""
    if request.return_only_cookies:
        return "text/html", ""

    header_ct = ""
    if page_request and getattr(page_request, "headers", None):
        header_ct = page_request.headers.get("content-type", "") or ""

    if header_ct.startswith("application/pdf") or header_ct.startswith("image/"):
        return await fetch_binary_content(page, header_ct)

    return "text/html", await page.content()


async def fetch_binary_content(page: Page, content_type: str) -> tuple[str, str]:
    """Fetch raw bytes as base64 (PDF / image), falling back to viewer HTML."""
    try:
        fetch_response = await page.request.fetch(page.url)
        response_content = base64.b64encode(await fetch_response.body()).decode("ascii")
    except Exception:
        logger.exception("Failed to fetch binary bytes, falling back to viewer HTML")
        return "text/html", await page.content()
    return content_type.split(";")[0].strip() or "application/octet-stream", response_content


async def download_images_via_browser(
    page: Page,
    request: LinkRequest,
) -> list[DownloadedImage]:
    """
    Fetch image bytes inside the already-solved browser session.

    Cross-origin CDN URLs often fail CORS from the referer document — navigate
    to the asset, then same-origin fetch (Chrome/Firefox image viewer).
    """
    if request.download_urls:
        image_urls = list(request.download_urls)
        logger.info("Downloading %s specific image URLs...", len(image_urls))
    else:
        logger.info("No specific URLs provided, finding all images on page...")
        image_urls = []
        for src in await page.eval_on_selector_all(
            "img[src]",
            "els => els.map(e => e.getAttribute('src')).filter(Boolean)",
        ):
            image_urls.append(urljoin(page.url, src))

    resp: list[DownloadedImage] = []
    for img_url in image_urls:
        try:
            data = await page.evaluate(_BROWSER_FETCH_B64_JS, img_url)
            if not isinstance(data, dict) or not data.get("encoded"):
                logger.info(
                    "Cross-origin fetch failed for %s; navigating in-session (%s)",
                    img_url,
                    data,
                )
                await page.goto(img_url, wait_until="domcontentloaded")
                data = await page.evaluate(_BROWSER_FETCH_B64_JS, page.url)

            if not isinstance(data, dict) or not data.get("encoded"):
                logger.error("No data returned for: %s (%s)", img_url, data)
                continue

            filename = urlsplit(img_url).path.rsplit("/", 1)[-1] or "image"
            mime_type = data.get("mime") or "image/jpeg"
            logger.info("Downloaded %s", img_url)
            resp.append(
                DownloadedImage(
                    url=img_url,
                    filename=filename,
                    mime_type=mime_type,
                    encoded_data=data["encoded"],
                )
            )
        except Exception:
            logger.exception("Error downloading %s", img_url)

    return resp
