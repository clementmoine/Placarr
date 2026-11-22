/**
 * ColleX (collexstash.com) — page collection publique → visuels d'objets.
 *
 * Source principale : le flux RSC de la page (`self.__next_f`), qui porte
 * chaque objet en JSON (`name`, `itemNumber`, `slug`, `imageUrl`) — toute
 * la collection, pas seulement les vignettes rendues. Repli : chaque objet est
 * une balise `<img src="https://img.collexstash.com/<uuid>/items/<slug>.webp?v=…"
 * alt="<NNN> <Nom> <Titre de la collection>">`. Le numéro vient du suffixe
 * `-NNN` du slug quand il existe (cartes) ; le titre de la collection, commun
 * à tous les `alt` d'un même dossier `<uuid>`, est retiré du nom.
 */

export type CollexCollectionItem = {
  slug: string;
  /** Numéro imprimé (`001`) quand le slug le porte, sinon `null` (Fixeez…). */
  number: string | null;
  name: string;
  imageUrl: string;
};

const IMG_RE =
  /<img[^>]*\bsrc="(https:\/\/img\.collexstash\.com\/([^/"]+)\/items\/([a-z0-9-]+)\.(?:webp|png|jpe?g)(?:\?[^"#]*)?)"[^>]*>/gi;

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Mots de fin communs à tous les libellés (le titre de la collection). */
function commonWordSuffix(labels: readonly string[]): string[] {
  if (labels.length < 2) return [];
  const split = labels.map((l) => l.split(/\s+/).filter(Boolean));
  const out: string[] = [];
  for (let k = 1; ; k++) {
    const word = split[0]![split[0]!.length - k];
    if (!word) break;
    if (!split.every((w) => w.length > k && w[w.length - k] === word)) break;
    out.unshift(word);
  }
  return out;
}

const PAYLOAD_ITEM_RE =
  /"name":"((?:[^"\\]|\\.)*)","itemNumber":(null|"([^"]*)"),"slug":"([a-z0-9-]+)","imageUrl":"(https:\/\/img\.collexstash\.com\/[^"]+)"/g;

/** Objets lus dans le flux RSC (JSON échappé dans des chaînes JS). */
function itemsFromPayload(html: string): CollexCollectionItem[] {
  const text = html.replace(/\\"/g, '"');
  const out: CollexCollectionItem[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(PAYLOAD_ITEM_RE)) {
    const [, rawName, , number, slug, imageUrl] = m;
    if (!slug || !imageUrl || seen.has(slug)) continue;
    seen.add(slug);
    let name = rawName ?? "";
    try {
      name = JSON.parse(`"${name}"`) as string;
    } catch {
      /* nom brut */
    }
    out.push({
      slug,
      number: number?.trim() || null,
      name: name.trim(),
      imageUrl,
    });
  }
  return out;
}

export function parseCollexCollectionItems(
  html: string,
): CollexCollectionItem[] {
  const fromPayload = itemsFromPayload(html);
  if (fromPayload.length) return fromPayload;
  return itemsFromImgTags(html);
}

function itemsFromImgTags(html: string): CollexCollectionItem[] {
  const rows: {
    folder: string;
    slug: string;
    imageUrl: string;
    alt: string;
  }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(IMG_RE)) {
    const [tag, imageUrl, folder, slug] = m as unknown as [
      string,
      string,
      string,
      string,
    ];
    const key = `${folder}/${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const alt = decodeEntities(/\balt="([^"]*)"/i.exec(tag)?.[1] ?? "").trim();
    rows.push({ folder, slug, imageUrl, alt });
  }

  const suffixByFolder = new Map<string, number>();
  for (const folder of new Set(rows.map((r) => r.folder))) {
    const labels = rows
      .filter((r) => r.folder === folder)
      .map((r) => r.alt.replace(/^\d{1,4}\s+/, ""));
    suffixByFolder.set(folder, commonWordSuffix(labels).length);
  }

  return rows.map(({ folder, slug, imageUrl, alt }) => {
    const number = /-(\d{1,4})$/.exec(slug)?.[1] ?? null;
    const words = alt
      .replace(/^\d{1,4}\s+/, "")
      .split(/\s+/)
      .filter(Boolean);
    const drop = suffixByFolder.get(folder) ?? 0;
    const name = (drop ? words.slice(0, words.length - drop) : words).join(" ");
    return { slug, number, name, imageUrl };
  });
}
