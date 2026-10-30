/**
 * Nommer une langue de carte pour un humain.
 *
 * Le sélecteur affichait le code brut — `FR`, `JA` — ce qui se lit mal et ne
 * dit rien à qui ne connaît pas ISO 639. Le nom est donné dans **la langue
 * elle-même** : quelqu'un qui cherche ses cartes japonaises reconnaît 日本語
 * plus vite que « japonais ».
 *
 * Le drapeau est une **convention de collectionneur**, pas une affirmation
 * géographique : une carte anglaise n'est pas britannique, elle est en anglais.
 * Il sert de repère visuel dans une liste courte, rien de plus.
 */
export type PrintLanguageLabel = {
  code: string;
  flag: string;
  /** Le nom de la langue, dans cette langue. */
  name: string;
};

const KNOWN: Readonly<Record<string, { flag: string; name: string }>> = {
  fr: { flag: "🇫🇷", name: "Français" },
  en: { flag: "🇬🇧", name: "English" },
  ja: { flag: "🇯🇵", name: "日本語" },
  /** One Piece / some sealed indexes use `jp` instead of ISO `ja`. */
  jp: { flag: "🇯🇵", name: "日本語" },
  it: { flag: "🇮🇹", name: "Italiano" },
  de: { flag: "🇩🇪", name: "Deutsch" },
  es: { flag: "🇪🇸", name: "Español" },
  pt: { flag: "🇵🇹", name: "Português" },
  "pt-br": { flag: "🇧🇷", name: "Português (BR)" },
  /** Live / Malie / sealed indexes often store `ptbr` without a hyphen. */
  ptbr: { flag: "🇧🇷", name: "Português (BR)" },
  ko: { flag: "🇰🇷", name: "한국어" },
  "zh-tw": { flag: "🇹🇼", name: "繁體中文" },
  zh: { flag: "🇨🇳", name: "中文" },
  nl: { flag: "🇳🇱", name: "Nederlands" },
  pl: { flag: "🇵🇱", name: "Polski" },
  ru: { flag: "🇷🇺", name: "Русский" },
};

/**
 * Une langue inconnue garde son code et ne reçoit **pas** de drapeau : inventer
 * un pays serait pire que de ne rien dire, et le code reste sélectionnable.
 */
export function printLanguageLabel(code: string): PrintLanguageLabel {
  const key = code.trim().toLowerCase();
  const known = KNOWN[key];
  return {
    code: key,
    flag: known?.flag ?? "",
    name: known?.name ?? key.toUpperCase(),
  };
}
