import { normalizeForTokens } from "@/lib/barcode/titleUtils";

export function getRepresentativeScore(name: string, priority: number): number {
  let score = priority * 1000;
  const normalized = normalizeForTokens(name);
  const listingNoise =
    /\b(jeux?\s+video|vintage|old|pal|ntsc|scelle|scellé|blister|boite|boîte|livret|notice|complet|complete|fonctionnel|tested|teste|testé|tbe|hs|condizioni|multilingua|originale|vip|gratte|gratté|escape\s+game|jeu\s+d\s*enquete|space\s+cowboys|scunl[a-z0-9]+)\b/i;

  if (name.includes(":") || name.includes(" - ")) {
    score += 100;
  }

  if (/![\s!]/.test(name) || /unlock!/i.test(name)) {
    score += 80;
  }

  if (name.includes("&")) {
    score += 45;
  }

  const hasAccents = /[éèàùçêâôîëïüû]/.test(name.toLowerCase());
  if (hasAccents) {
    score += 50;
  }

  const meaningfulFrenchWords =
    /\b(criquet|ravageur|histoire|aventure|monde|château|chateau|légende|legende|cretins|crétins|millions?|retour|passe|passé)\b/i;
  const hasFrenchTitleWords = meaningfulFrenchWords.test(name);
  if (hasFrenchTitleWords) {
    score += 30;
  }

  if (listingNoise.test(normalized)) {
    score -= 420;
  }

  if (/\bjeux?\s+olympiques?\b/.test(normalized)) {
    score += 70;
  }

  if (
    /\band\b/.test(name) &&
    /\b(aux|jeux?|olympiques?|hiver)\b/.test(normalized)
  ) {
    score -= 55;
  }

  if (priority >= 1 && (hasAccents || hasFrenchTitleWords)) {
    score += 1500;
  }

  if (name.length <= 3) {
    score -= 20;
  }

  return score;
}

export function scoreDisplayTitle(name: string, isCanonical = false): number {
  const normalized = normalizeForTokens(name);
  let score = getRepresentativeScore(name, 1);

  if (isCanonical) score += 120;
  if (name.includes("&")) score += 180;
  if (/\b(19|20)\d{2}\b/.test(normalized)) score -= 90;
  if (
    /\b(nintendo|sega|notice|manuale|livret|boite|boîte|complet|complete|completo|pal|fra|ita|jeu\s+video|jeux\s+video|vintage|old|fonctionnel|tested|teste|testé|scelle|scellé|blister|tbe|hs|vip|gratte|gratté)\b/.test(
      normalized,
    )
  ) {
    score -= 360;
  }

  if (/\s[-–—]\s*(wiisc|wii|switch|ps[1-5]|xbox)\s*$/i.test(name)) {
    score -= 500;
  }

  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) {
    score -= 120;
  }

  // CJK characters penalty (Japanese, Chinese, Korean)
  const hasCjk = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\uac00-\ud7af]/.test(name);
  if (hasCjk) {
    score -= 200;
  }

  return score;
}

export function normalizeDisplayTitle(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 2 &&
        !["and", "the", "aux", "des", "les", "une", "pour"].includes(token),
    );
}

export function areDisplayTitlesSameProduct(a: string, b: string): boolean {
  const aTokens = normalizeDisplayTitle(a);
  const bTokens = normalizeDisplayTitle(b);
  if (aTokens.length === 0 || bTokens.length === 0) return false;

  const shared = aTokens.filter((token) => bTokens.includes(token));
  return shared.length >= Math.min(2, Math.min(aTokens.length, bTokens.length));
}

export function scoreMetadataDisplayTitle(title: string): number {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let score = 0;

  if (title.includes("&")) score += 45;
  if (/[éèàùçêâôîëïüû]/i.test(title)) score += 25;
  if (
    /\b(le|la|les|un|une|des|du|de|en|et|pour|sur|au|aux|avec|sans|dans)\b/.test(
      normalized,
    )
  ) {
    score += 40;
  }
  if (/\bjeux?\s+olympiques?\b/.test(normalized)) score += 120;
  if (
    /\band\b/.test(title) &&
    /\b(aux|jeux?|olympiques?|hiver)\b/.test(normalized)
  ) {
    score -= 20;
  }
  if (/\b(19|20)\d{2}\b/.test(normalized)) score -= 60;
  if (
    /\b(nintendo|playstation|xbox|wii|wiisc|switch|sega|notice|manuale|complet|complete|completo|pal|fra|ita)\b/.test(
      normalized,
    )
  ) {
    score -= 120;
  }

  // CJK characters penalty (Japanese, Chinese, Korean)
  const hasCjk = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\uac00-\ud7af]/.test(title);
  if (hasCjk) {
    score -= 200;
  }

  return score;
}
