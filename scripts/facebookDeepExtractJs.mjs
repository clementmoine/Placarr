/** Deep-extract a Facebook group post page via saved CDP JSON. */
import { readFileSync } from "node:fs";

const DEEP_EXTRACT_JS = String.raw`
(async () => {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const safeExpand = () => {
    for (const b of document.querySelectorAll('[role="button"]')) {
      const t = norm(b.innerText);
      if (t === 'En voir plus' || t === 'Voir plus') try { b.click(); } catch (e) {}
      if (/^\d+ réponses$/.test(t) || /^Voir plus de commentaires$/.test(t)) try { b.click(); } catch (e) {}
    }
  };
  safeExpand();
  await new Promise(r => setTimeout(r, 400));
  safeExpand();
  const main = document.querySelector('[role="dialog"] [role="main"]')
    || document.querySelector('[role="main"]')
    || document.body;
  const text = norm(main.innerText).replace(/Facebook\s+/g, ' ');
  const imgs = [...document.querySelectorAll('img[src*="scontent"]')]
    .map(i => ({ alt: i.alt || '', src: (i.src || '').split('?')[0].slice(0, 200) }))
    .filter(x => x.alt && !/profile picture/i.test(x.alt))
    .slice(0, 24);
  const tag = [...text.matchAll(/\[[^\]]+\]/g)].map(m => m[0]).slice(0, 8);
  return JSON.stringify({
    permalink: location.href.split('?')[0],
    tag,
    text: text.slice(0, 20000),
    imageCount: imgs.length,
    images: imgs,
  });
})()
`;

export { DEEP_EXTRACT_JS };
