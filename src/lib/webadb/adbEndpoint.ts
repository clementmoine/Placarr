/** Only loopback / private LAN — admin ADB pull, not open SSRF. */
export function isAllowedAdbEndpoint(serial: string): boolean {
  const trimmed = serial.trim();
  if (!trimmed || trimmed.includes(" ") || trimmed.includes("\n")) return false;
  if (!trimmed.includes(":")) {
    return /^[A-Za-z0-9._:-]+$/.test(trimmed);
  }
  const [host, portRaw] = trimmed.split(":");
  const port = Number(portRaw);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const m = host.match(/^172\.(\d{1,3})\./);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}
