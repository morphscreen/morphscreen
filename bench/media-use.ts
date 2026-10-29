// How answers to everyday questions use media (roadmap Q12): of the answers a
// person would want photos in, how many ask for one with find; of those about
// places to go, how many draw a Map, and how many of those Maps give Lat and
// Lng (an Address-only Map is a list on the web, which has no geocoder);
// photos linked from other sites, which never load; how specific the photo
// requests are (a bare "Mars" finds the chocolate bar); and photos in answers
// that shouldn't have any. And how much of an answer is something to use
// rather than read: components that respond (a quiz, a map, a carousel, a
// button, follow-ups to tap), whether a shopping, learning or comparing
// question got its Product, Quiz or Flashcards, or Compare, and the share of
// the answer that is plain paragraphs. Validity as the scoreboard judges it.
//   node bench/media-use.ts LABEL[,LABEL...]   (bench/raw/LABEL, run with BENCH_BRIEFS=everyday)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../validator/validate.ts";
import { buildCatalog } from "../spec/catalog.ts";
import { EVERYDAY_BRIEFS, type Wants } from "./briefs/everyday.ts";

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2];
if (!label) {
  console.error("node bench/media-use.ts LABEL[,LABEL...]");
  process.exit(2);
}
const dirs = label.split(",").map((l) => join(here, "raw", l));
const meta = new Map<string, { truncated?: boolean; packs?: string[] }>(
  dirs.flatMap((dir) => readFileSync(join(dir, "meta.jsonl"), "utf8").split("\n").filter(Boolean).map((l): [string, any] => { const m = JSON.parse(l); return [`${dir}/${m.id}`, m]; })),
);
// Components that respond to the reader.
// (FollowUps, Tabs and Details are counted apart: nearly every answer has them.)
const RESPONDS = ["Quiz", "Flashcards", "Poll", "Checklist", "WhatIf", "Map", "Carousel", "Button", "Form", "TimeSlots", "Video", "Embed", "Combobox", "ToggleGroup", "RatingInput", "Stepper", "Slider", "Select"];
// The component a kind of question is best answered with.
const FITS: Record<string, string[]> = { product: ["Product"], quiz: ["Quiz", "Flashcards"], compare: ["Compare"] };
const tags = (text: string) => [...text.matchAll(/^\s*<([A-Z][A-Za-z]*)\b/gm)].map((x) => x[1]);
// Plain paragraphs: lines that are none of a tag, a table row, an image, a list item, a heading or a fence.
const prose = (text: string) => {
  let inside = 0, chars = 0, total = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    total += t.length;
    if (!t) continue;
    if (/^<[A-Z]/.test(t) && !/\/>$/.test(t) && !/<\/[A-Z][A-Za-z]*>$/.test(t)) inside++;
    if (/^<\/[A-Z]/.test(t)) inside = Math.max(0, inside - 1);
    if (!/^(<|\||!\[|[-*+] |\d+\. |#|```)/.test(t)) chars += t.length;
  }
  return total ? chars / total : 0;
};
const wants = new Map(EVERYDAY_BRIEFS.map((b) => [b.name, b.wants]));

type One = { brief: string; wants: Wants[]; valid: boolean; finds: string[]; hotlinks: number; galleries: number; maps: { coords: boolean; address: boolean }[]; tags: string[]; prose: number };
const answers: One[] = [];
for (const [dir, f] of dirs.flatMap((dir) => readdirSync(dir).sort().map((f) => [dir, f]))) {
  const m = f.match(/^ours__(.+)__r\d+\.txt$/);
  if (!m || !wants.has(m[1])) continue;
  const text = readFileSync(join(dir, f), "utf8");
  const info = meta.get(`${dir}/${f.replace(/\.txt$/, "")}`);
  const catalog = info?.packs?.length ? buildCatalog({ packs: info.packs }) : undefined;
  const maps = [...text.matchAll(/<Map\b[^>]*>([\s\S]*?)<\/Map>/g)].map((x) => {
    const head = (x[1].split("\n").find((l) => l.trim().startsWith("|")) ?? "").toLowerCase().split("|").map((c) => c.trim());
    return { coords: head.includes("lat") && (head.includes("lng") || head.includes("lon") || head.includes("long")), address: head.includes("address") };
  });
  answers.push({
    brief: m[1],
    wants: wants.get(m[1])!,
    valid: evaluate(text, { truncated: info?.truncated ?? false, catalog }).complete,
    finds: [...text.matchAll(/!\[([^\]]*)\]\(find\)/g)].map((x) => x[1]),
    hotlinks: [...text.matchAll(/!\[[^\]]*\]\(\s*https?:/g)].length,
    galleries: [...text.matchAll(/<(Gallery|Carousel)\b/g)].length,
    maps,
    tags: tags(text),
    prose: prose(text),
  });
}

const share = (n: number, d: number) => `${n} of ${d}${d ? ` (${Math.round((100 * n) / d)}%)` : ""}`;
const photos = answers.filter((a) => a.wants.includes("photos"));
const places = answers.filter((a) => a.wants.includes("map"));
const none = answers.filter((a) => a.wants.includes("none"));
const maps = places.flatMap((a) => a.maps);
const alts = answers.flatMap((a) => a.finds);
const words = alts.map((a) => a.trim().split(/\s+/).filter(Boolean).length).sort((x, y) => x - y);
const fit = answers.filter((a) => a.wants.some((w) => FITS[w]));
const responds = (a: One) => a.tags.filter((t) => RESPONDS.includes(t)).length;
const summary = {
  label,
  answers: answers.length,
  valid: share(answers.filter((a) => a.valid).length, answers.length),
  photos_where_wanted: share(photos.filter((a) => a.finds.length > 0).length, photos.length),
  galleries_where_wanted: share(photos.filter((a) => a.galleries > 0).length, photos.length),
  map_where_wanted: share(places.filter((a) => a.maps.length > 0).length, places.length),
  maps_with_coordinates: share(maps.filter((m) => m.coords).length, maps.length),
  hotlinked_photos: answers.reduce((n, a) => n + a.hotlinks, 0),
  photo_requests: alts.length,
  alt_words_median: words.length ? words[Math.floor(words.length / 2)] : 0,
  alts_of_three_words_or_more: share(words.filter((w) => w >= 3).length, words.length),
  photos_where_not_wanted: share(none.filter((a) => a.finds.length + a.hotlinks > 0).length, none.length),
  something_to_use: share(answers.filter((a) => responds(a) > 0).length, answers.length),
  responding_components_mean: answers.length ? +(answers.reduce((n, a) => n + responds(a), 0) / answers.length).toFixed(1) : 0,
  follow_ups: share(answers.filter((a) => a.tags.includes("FollowUps")).length, answers.length),
  the_fitting_component: share(fit.filter((a) => a.wants.some((w) => (FITS[w] ?? []).some((c) => a.tags.includes(c)))).length, fit.length),
  plain_paragraphs_median: answers.length ? `${Math.round(100 * [...answers.map((a) => a.prose)].sort((x, y) => x - y)[Math.floor(answers.length / 2)])}%` : "",
  by_brief: Object.fromEntries(EVERYDAY_BRIEFS.map((b) => {
    const mine = answers.filter((a) => a.brief === b.name);
    return [b.name, { answers: mine.length, valid: mine.filter((a) => a.valid).length, with_photos: mine.filter((a) => a.finds.length).length, with_map: mine.filter((a) => a.maps.length).length, hotlinks: mine.reduce((n, a) => n + a.hotlinks, 0), responding: mine.reduce((n, a) => n + responds(a), 0), fits: mine.filter((a) => a.wants.some((w) => (FITS[w] ?? []).some((c) => a.tags.includes(c)))).length }];
  })),
  alts: [...new Set(alts)].slice(0, 40),
};
writeFileSync(join(here, "results", `media-${label.replaceAll(",", "+")}.json`), JSON.stringify(summary, null, 1) + "\n");
console.log(JSON.stringify({ ...summary, by_brief: undefined, alts: undefined }, null, 1));
