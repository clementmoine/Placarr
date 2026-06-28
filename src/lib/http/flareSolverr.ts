import axios from "axios";

export type FlareSolverrCookies = {
  cookie: string;
  userAgent: string;
};

export async function flareSolverrCookiesFor(
  referer: string,
  maxTimeoutMs = 60_000,
): Promise<FlareSolverrCookies | null> {
  const flaresolverrUrl = process.env.FLARESOLVERR_URL?.trim();
  if (!flaresolverrUrl) return null;

  try {
    const response = await axios.post(
      `${flaresolverrUrl.replace(/\/+$/, "")}/v1`,
      {
        cmd: "request.get",
        url: referer,
        maxTimeout: maxTimeoutMs,
      },
      { timeout: maxTimeoutMs + 10_000, validateStatus: () => true },
    );
    if (response.data?.status !== "ok") return null;
    const solution = response.data.solution;
    const cookie = (solution?.cookies || [])
      .map((entry: { name: string; value: string }) => `${entry.name}=${entry.value}`)
      .join("; ");
    if (!cookie) return null;
    return {
      cookie,
      userAgent:
        solution?.userAgent ||
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
  } catch {
    return null;
  }
}

export async function fetchWithFlareSolverr(
  url: string,
  maxTimeoutMs = 45_000,
): Promise<string | null> {
  const flaresolverrUrl = process.env.FLARESOLVERR_URL?.trim();
  if (!flaresolverrUrl) return null;

  try {
    const response = await axios.post(
      `${flaresolverrUrl.replace(/\/+$/, "")}/v1`,
      {
        cmd: "request.get",
        url,
        maxTimeout: maxTimeoutMs,
      },
      { timeout: maxTimeoutMs + 5_000, validateStatus: () => true },
    );
    const html = response.data?.solution?.response;
    const status = Number(response.data?.solution?.status || 0);
    if (typeof html !== "string" || status >= 400) return null;
    return html;
  } catch {
    return null;
  }
}
