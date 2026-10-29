// The stylesheet styles answers and nothing else (roadmap C5): every rule is
// scoped to an answer (.ms-answer) or the agent's thread (.ms-thread), every
// class is ms-, and the app's own components inside an answer are left out.
// page.css, the page around a server-rendered answer, is the one exception.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const css = readFileSync(join(import.meta.dirname, "../render/theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every style rule's selectors, inside @media, @supports and @container too. */
function selectors(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    let depth = 0, k = open;
    for (; k < text.length; k++) {
      if (text[k] === "{") depth++;
      else if (text[k] === "}" && --depth === 0) break;
    }
    const body = text.slice(open + 1, k);
    if (head.startsWith("@keyframes") || head.startsWith("@font-face")) {
      // Not selectors.
    } else if (head.startsWith("@")) out.push(...selectors(body));
    else out.push(...split(head));
    i = k + 1;
  }
  return out;
}

/** A selector list split at its top-level commas. */
function split(list: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

const all = selectors(css);

test("every rule is inside an answer or the agent's thread", () => {
  assert.ok(all.length > 1000, `${all.length} selectors`);
  const scoped = (s: string) =>
    s === ":root" ||
    /^\.ms-(answer|thread)[.\s:>]/.test(s) ||
    s === ".ms-answer" ||
    s === ".ms-thread" ||
    /^:is\(\.ms-answer\.ms-answer, \.ms-answer /.test(s) ||
    /^:root(\[[^\]]*\]|:not\([^)]*\))* \.ms-answer /.test(s);
  assert.deepEqual(all.filter((s) => !scoped(s)), []);
});

test("every class is ms-", () => {
  const classes = new Set(all.flatMap((s) => [...s.replace(/\[[^\]]*\]/g, "").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])));
  assert.ok(classes.size > 200, `${classes.size} classes`);
  assert.deepEqual([...classes].filter((c) => !c.startsWith("ms-")), []);
});

test("the app's own components inside an answer keep the app's styles", () => {
  // Every rule that reaches into an answer leaves out what's inside .ms-custom.
  const inside = all.filter((s) => s !== ":root" && s !== ".ms-answer" && s !== ".ms-thread" && !s.startsWith(".ms-thread.ms-thread"));
  assert.deepEqual(inside.filter((s) => !s.includes(":not(.ms-custom *)")), []);
});

test("the page's own rules are page.css's alone", () => {
  for (const s of all) assert.ok(!/(^|[\s,>+~(])(body|html)\b/.test(s), s);
  const page = readFileSync(join(import.meta.dirname, "../render/page.css"), "utf8");
  assert.match(page, /^body \{/m);
  assert.match(page, /^body > \.ms-answer \{/m);
});
