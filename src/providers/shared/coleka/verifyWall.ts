/**
 * Coleka Cloudflare /verify interstitial — même mur pour Naruto, Pokémon,
 * Leclerc, Ultra Challenge : un détecteur, pas un par jeu.
 */
export function colekaHtmlIsVerifyWall(html: string): boolean {
  // FR « Vérification », IT « Verifica », EN turnstile interstitial.
  if (/<title>\s*V[eé]rifica(?:tion)?\b/i.test(html)) return true;
  if (
    /challenges\.cloudflare\.com\/turnstile/i.test(html) &&
    !/class="[^"]*lib_has_2_lines/i.test(html)
  ) {
    return true;
  }
  return (
    /\/verify\/\?lang=/i.test(html) &&
    !/class="[^"]*lib_has_2_lines/i.test(html)
  );
}
