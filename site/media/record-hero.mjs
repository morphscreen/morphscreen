// The home page's hero video: the docs' planets answer (DeepSeek V4 Flash,
// site/media/intro-answer.md, its photos NASA's) streaming through the real
// web SDK at the pace the model wrote it, laid out on the right of a wide
// frame so the page's words sit over the dark left side. It fades in from
// black and out to it, so the loop starts again cleanly. Nothing is edited.
//
//   node sdk/web/build.mjs && node site/media/record-hero.mjs
//   writes site/static/media/hero.mp4 and hero.jpg (its first frame)

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { film, open, recorded, repo } from "./capture.mjs";

const out = join(repo, "site/static/media");
mkdirSync(out, { recursive: true });
const text = readFileSync(join(import.meta.dirname, "intro-answer.md"), "utf8");
const meta = recorded("bench/raw/v010-everyday-photokey", "ours__ev3-planets__r2");
const photos = [...text.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)/g)].map((m) => m[1]);
const CHUNK = 24;
const every = Math.round(meta.ms / Math.ceil(text.length / CHUNK));

const { tab, close } = await open({
  ask: "Tell me about the planets in our solar system.",
  hosts: [...new Set(photos.map((u) => new URL(u).host))],
  width: 1920,
  height: 1080,
  // The answer in the right half; the page's copy covers the left.
  css: ".wrap { width: 760px; margin-left: 1060px; padding-top: 140px; }",
});
await tab.evaluate((urls) => window.decodePhotos(urls), photos);
const { length } = await film(
  tab,
  join(out, "hero.mp4"),
  async ({ wait, stream, settle }) => {
    await wait(500);
    await stream(text, CHUNK, every);
    await settle();
    await wait(1400);
  },
  { crf: 31, fadeIn: 0.5, fadeOut: 0.9 },
);
await close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.6", "-i", join(out, "hero.mp4"), "-frames:v", "1", "-q:v", "6", join(out, "hero.jpg")]);
console.log(`site/static/media/hero.mp4: ${length.toFixed(1)} s, the answer streaming ${(meta.ms / 1000).toFixed(1)} s as ${meta.model} wrote it`);
