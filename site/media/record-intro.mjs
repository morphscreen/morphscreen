// The raw take for the docs' intro video (roadmap H1): a saved answer from
// DeepSeek V4 Flash to "Tell me about the planets in our solar system."
// streaming through the real web SDK in Chrome at the pace the model wrote
// it (its run's meta.jsonl), then a reader answering the quiz (one right, one
// wrong) and turning a flashcard, with real clicks and a drawn cursor. The
// photos the answer asked for are NASA's, public domain, put in by hand and
// credited under each (site/media/intro-answer.md; site/media/SOURCES.md).
// The answer is laid out at the docs' column width and zoomed 2.1 times, so
// the edit can move the camera in without upscaling. Writes the take and
// when each moment happens in it (take.json), for the edit in the
// morphscreen-docs-intro HyperFrames project, whose render becomes
// site/static/docs/media/intro.mp4.
//
//   node sdk/web/build.mjs && node site/media/record-intro.mjs [OUT_DIR]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { film, open, recorded } from "./capture.mjs";

const out = process.argv[2] ?? join(process.env.HOME, "Desktop/Projects/good-projects/morphscreen-docs-intro/assets");
mkdirSync(out, { recursive: true });
const RUN = "bench/raw/v010-everyday-photokey";
const ID = "ours__ev3-planets__r2";
const text = readFileSync(join(import.meta.dirname, "intro-answer.md"), "utf8");
const meta = recorded(RUN, ID);
const photos = [...text.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)/g)].map((m) => m[1]);
const CHUNK = 24;
// The whole answer arrives in the time the model took: the API sends each photo's line once it's filled, so the addresses don't add time.
const every = Math.round(meta.ms / Math.ceil(text.length / CHUNK));

const { tab, close } = await open({
  ask: "Tell me about the planets in our solar system.",
  hosts: [...new Set(photos.map((u) => new URL(u).host))],
  width: 1600,
  height: 1100,
  css: ".wrap { zoom: 2.1; width: 760px; box-sizing: border-box; margin: 0 auto; padding: 24px 24px 120px; }",
});
await tab.evaluate((urls) => window.decodePhotos(urls), photos);
const take = join(out, "take.mp4");
const { length, marks } = await film(
  tab,
  take,
  async ({ mark, wait, stream, settle, tap }) => {
    await wait(600);
    mark("stream");
    await stream(text, CHUNK, every);
    mark("streamed");
    await settle();
    await wait(500);
    const questions = await tab.$$(".ms-quiz li.ms-question");
    // The first question answered right, the second wrong: both states, each with its explanation.
    for (const [k, q] of questions.slice(0, 2).entries()) {
      const value = await q.evaluate((el, right) => (right ? el.dataset.answer : [...el.querySelectorAll("input")].find((i) => i.value !== el.dataset.answer)?.value), k === 0);
      const label = await q.$(`input[value="${value}"]`).then((i) => i.evaluateHandle((x) => x.closest("label")));
      // Long enough to read the explanation that opens under it.
      await tap(label, 1650, k === 0 ? "right" : "wrong");
    }
    const card = await tab.$(".ms-flashcards details.ms-card summary");
    await tap(card, 1200, "flip");
    const known = await tab.evaluateHandle(() => [...document.querySelectorAll(".ms-flashcards button")].find((b) => b.textContent.trim() === "Got it" && b.checkVisibility()));
    await tap(known.asElement(), 1000, "known");
    await tab.evaluate(() => (document.querySelector(".cursor").style.opacity = "0"));
    await wait(300);
    mark("end");
  },
  { crf: 16 },
);
await close();
writeFileSync(join(out, "take.json"), JSON.stringify({ length, width: 1600, height: 1100, model: meta.model, streamMs: meta.ms, marks }, null, 1));
console.log(`${take}: ${length.toFixed(1)} s; marks: ${marks.map((m) => `${m.name} ${m.t}`).join(", ")}`);
