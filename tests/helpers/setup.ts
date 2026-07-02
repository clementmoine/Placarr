import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Charge .env dans process.env (Vitest ne le fait pas tout seul).
// Indispensable en mode RECORD pour que les providers utilisent les clés d'API,
// et pour que la redaction des secrets (httpReplay) connaisse les valeurs à
// expurger AVANT d'écrire les fixtures.
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
