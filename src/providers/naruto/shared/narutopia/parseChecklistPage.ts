/**
 * Parse Narutopia.fr Elementor checklist pages (Kayou / Mythos / Heritage).
 *
 * Pattern: image (lazy data-src / srcset) → checkbox → heading (code ± name).
 */
export type NarutopiaChecklistEntry = {
  heading: string;
  /** Printed / collector label when detectable. */
  code: string | null;
  /** Character / title fragment after the code (`NR-001-NARUTO` → NARUTO). */
  name: string | null;
  faceUrl: string | null;
  widgetId: string | null;
};

const HEADING_RE =
  /<h([234])[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>([^<]+)<\/h\1>/gi;

function preferFullWebp(urls: readonly string[]): string | null {
  if (!urls.length) return null;
  const full = urls.filter(
    (u) => /\.webp$/i.test(u) && !/-\d+x\d+\.webp$/i.test(u),
  );
  if (full.length) return full[full.length - 1]!;
  return urls[urls.length - 1]!;
}

function pickFaceFromWindow(windowHtml: string): string | null {
  const srcsets = [...windowHtml.matchAll(/data-srcset="([^"]+)"/gi)].map(
    (m) => m[1]!,
  );
  for (let i = srcsets.length - 1; i >= 0; i -= 1) {
    const urls = srcsets[i]!
      .split(",")
      .map((p) => p.trim().split(/\s+/)[0]!)
      .filter(Boolean);
    const hit = preferFullWebp(urls);
    if (hit) return hit;
  }
  const dataSrcs = [
    ...windowHtml.matchAll(
      /data-src="(https:\/\/narutopia\.fr\/wp-content\/uploads\/[^"]+\.(?:webp|jpg|jpeg|png))"/gi,
    ),
  ].map((m) => m[1]!);
  return preferFullWebp(dataSrcs) ?? dataSrcs.at(-1) ?? null;
}

function pickWidgetId(windowHtml: string): string | null {
  const ids = [
    ...windowHtml.matchAll(
      /id="([^"]+)"[^>]*data-widget_type="html\.default"/gi,
    ),
  ].map((m) => m[1]!);
  return ids.at(-1) ?? null;
}

/** Split `SSR-001-NARUTO` / `C-001` / `R-104 A` / `Mythos - 113 V`. */
export function splitNarutopiaHeading(heading: string): {
  code: string | null;
  name: string | null;
} {
  const h = heading.trim().replace(/\s+/g, " ");
  if (!h) return { code: null, name: null };

  const kayou = h.match(/^([A-Z0-9][A-Z0-9+/.-]*?)-([A-Za-zÀ-ÿ].+)$/u);
  if (kayou && /[0-9]/.test(kayou[1]!)) {
    return { code: kayou[1]!.toUpperCase(), name: kayou[2]!.trim() };
  }

  const spaced = h.match(
    /^(Mythos|Secret|Legendray|Legendary|Mission)\s*[-–]?\s*(.+)$/i,
  );
  if (spaced) {
    return {
      code: `${spaced[1]} ${spaced[2]}`.replace(/\s+/g, " ").trim(),
      name: null,
    };
  }

  const rarityCode = h.match(
    /^([A-Z]{1,6}-\d{1,4}(?:\s*[A-Z]+)?)$/i,
  );
  if (rarityCode) {
    return { code: rarityCode[1]!.replace(/\s+/g, " ").toUpperCase(), name: null };
  }

  return { code: h, name: null };
}

export function parseNarutopiaChecklistHtml(
  html: string,
): NarutopiaChecklistEntry[] {
  const out: NarutopiaChecklistEntry[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(HEADING_RE)) {
    const heading = match[2]!.trim();
    if (!heading || heading.length > 120) continue;
    const lower = heading.toLowerCase();
    if (
      lower.includes("cochez") ||
      lower.includes("liste des") ||
      lower.includes("votre collection") ||
      lower.startsWith("- cartes")
    ) {
      continue;
    }
    const start = match.index ?? 0;
    const windowHtml = html.slice(Math.max(0, start - 5000), start);
    const faceUrl = pickFaceFromWindow(windowHtml);
    const { code, name } = splitNarutopiaHeading(heading);
    const key = `${code ?? heading}|${faceUrl ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      heading,
      code,
      name,
      faceUrl,
      widgetId: pickWidgetId(windowHtml),
    });
  }
  return out;
}
