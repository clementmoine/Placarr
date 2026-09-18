#!/usr/bin/env node
/** Priority Victor/catalog post permalinks for deep extract. */
export const PRIORITY_POSTS = [
  { id: "1246941432913826", slug: "ni236-ptite-info", path: "permalink" },
  { id: "1248487462759223", slug: "jordan-mij-thread", path: "permalink" },
  { id: "1121246878816616", slug: "ma-collection-videos", path: "posts" },
  { id: "1228068058134497", slug: "promo-card-exclusive", path: "posts" },
  { id: "1239180660356570", slug: "tin-holo-tempete", path: "posts" },
  { id: "1242066306734672", slug: "storm3-will-of-fire-price", path: "posts" },
  { id: "1167735117501125", slug: "boite-metal-fr", path: "posts" },
  { id: "957314205209885", slug: "displays-resurface", path: "posts" },
  { id: "867083010899672", slug: "display-storm3-only", path: "posts" },
  { id: "843560099918630", slug: "collection-fr-only", path: "posts" },
  { id: "825206098420697", slug: "items-scelle-advice", path: "posts" },
  { id: "1246941432913826", slug: "ni236-dup-skip", path: "permalink", skip: true },
].filter((p) => !p.skip);

export function postUrl(id, path = "posts") {
  return `https://www.facebook.com/groups/805799330361374/${path}/${id}/`;
}
