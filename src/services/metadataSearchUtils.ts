export function formatScore(value: number, max: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const maximumFractionDigits = max <= 10 ? 1 : 0;
  return `${value.toLocaleString("fr-FR", {
    maximumFractionDigits,
  })}/${max}`;
}

export function cleanSearchQuery(name: string): string {
  let cleaned = name;
  cleaned = cleaned.replace(/\b\d{12,13}\b/g, "");
  cleaned = cleaned.replace(
    /^\s*(microsoft|nintendo|sony|sega|atari|capcom|konami|namco|bandai|ubisoft|square\s*enix|disney|ea|electronic\s*arts|warner\s*bros|wb|activision|mojang|rockstar|valve|blizzard)\b\s*[-–—:|]*\s*/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\s*[-–—|]\s*.*?\b(ebay|amazon|fnac|pricecharting|rakuten|leboncoin|cdiscount|carrefour|auchan|boulanger|darty|cultura|decitre|deezer|discogs|qobuz|retroplace|micromania|philibert)\b.*/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\b(ps1|ps2|ps3|ps4|ps5|playstation\s*\d?|xbox\s*(one|series\s*[xs]|\d{360})?|nintendo\s*switch|wii\s*u?|switch|ds|3ds|pc|dvd|vhs|blu\s*ray|bluray)\b/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\b(good\s+condition|condition|pal|ntsc|fr|fra|fre|us|usa|uk|eu|eur|jp|jpn|import|jeu\s+vid[eé]o|jeu|game|jeux(?!\s+olympiques?)|sans\s+notice|avec\s+notice|boite\s+avec\s+notice|sans\s+boite|notice|boite|vf|vo|vost|vostfr|eng|ger|ita|spa)\b/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\s+\b(used|occasion|neuf|new|loose|cib|complet|complete)\s*$/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\b(microsoft|sony|nintendo|sega|atari|capcom|konami|ubisoft|ea)\b\s*$/gi,
    "",
  );
  cleaned = cleaned.replace(/\[[^\]]*\]/g, "");
  cleaned = cleaned.replace(/\([^)]*\)/g, "");
  cleaned = cleaned.replace(/\s*[-–—:|]+\s*$/g, "");
  cleaned = cleaned.replace(/^\s*[-–—:|]+\s*/g, "");
  cleaned = cleaned.replace(/\s+/g, " ");
  return cleaned.trim();
}
