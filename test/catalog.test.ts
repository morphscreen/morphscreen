// node --test test/
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCatalog, fromJsonSchema, type Pack } from "../spec/catalog.ts";
import { promptHash, systemPrompt } from "../prompt/prompt.ts";
import { evaluate } from "../validator/validate.ts";
import { escapeHtml, render } from "../render/html.ts";
import { safeUrl } from "../spec/text.ts";

const acme: Pack = {
  name: "acme",
  version: "1.0.0",
  components: {
    ProductCard: {
      about: "a product with its price",
      attrs: { name: { type: "string", required: true }, price: { type: "string", required: true }, badge: ["new", "sale"] },
      content: "none",
    },
  },
  aliases: { Product: { as: "ProductCard" } },
};

// Pinned so a prompt change is always deliberate: update it together with a
// benchmark run of the new prompt (v0.2 was 89aaec82c8b7, v0.3 fd3a56d4fef9,
// v0.4 78bfdcad0955, v0.5 bf7c4304b0e6, v0.6 60b5d1ed5f28; v0.7 c9b9f2d860bb
// and v0.8 a7822d38bc32 for the photo and icon pilots in bench/raw; v0.9
// dcaf0a3f7f5d asked every answer for photos, v0.10 b9f05d638d2b didn't).
test("core alone gives the v0.11 prompt", () => {
  assert.equal(promptHash(), "f6ec7f010086");
});

test("a customer's components are taught after core's", () => {
  const cat = buildCatalog({ custom: [acme] });
  const prompt = systemPrompt(cat);
  assert.match(prompt, /<ProductCard name! price! badge=new\|sale \/>: a product with its price/);
  assert.ok(prompt.indexOf("<ProductCard") > prompt.indexOf("<Button"));
  assert.ok(!prompt.includes("<Product "), "aliases are never taught");
  assert.notEqual(cat.hash, buildCatalog().hash);
});

test("a name defined twice is an error, never an override", () => {
  const clash: Pack = { name: "clash", version: "1.0.0", components: { Card: { about: "mine", attrs: {}, content: "any" } } };
  assert.throws(() => buildCatalog({ custom: [clash] }), /Card is already defined by core/);
});

test("bad definitions are reported together", () => {
  const bad: Pack = {
    name: "bad",
    version: "1.0.0",
    components: {
      lowercase: { about: "x", attrs: {}, content: "none" },
      Thing: { about: "", attrs: { size: "huge", tone: ["red"], kind: { type: ["a", "b"], default: "c" } }, content: "stuff", parent: "Nope" },
    },
    aliases: { Gizmo: { as: "Missing" } },
  };
  const err = (() => {
    try {
      buildCatalog({ custom: [bad] });
    } catch (e) {
      return String(e);
    }
  })();
  for (const part of ["uppercase", 'needs "about"', 'unknown content "stuff"', 'unknown type "huge"', "tone is always", 'default "c"', "parent Nope", "points to Missing"])
    assert.ok(err?.includes(part), `missing: ${part}\n${err}`);
});

test("the validator checks a customer's components like built-ins", () => {
  const cat = buildCatalog({ custom: [acme] });
  assert.equal(evaluate('<ProductCard name="Kettle" price="$40" badge="sale" />', { catalog: cat }).complete, true);
  const bad = evaluate('<ProductCard name="Kettle" badge="clearance" />', { catalog: cat });
  assert.deepEqual(bad.errs.map((e) => e.cls).sort(), ["enum-mismatch", "required-field"]);
  // Without the customer's catalog it's an invented component.
  assert.equal(evaluate('<ProductCard name="Kettle" price="$40" />').errs[0].cls, "hallucinated-component");
  const viaAlias = evaluate('<Product name="Kettle" price="$40" />', { catalog: cat });
  assert.equal(viaAlias.complete, true);
  assert.match(viaAlias.notes.join(), /alias <Product> read as ProductCard/);
});

test("links never run script, however the scheme is spelled (as the core's safe_url)", () => {
  // A browser drops spaces and control characters before the scheme and tabs and line breaks anywhere.
  for (const u of ["javascript:alert(1)", "JaVaScRiPt:x", "java\tscript:x", "java\nscript:x", "\u0001javascript:x", " \u0000javascript:x", "vbscript:x", "file:///etc/passwd", "data:text/html,x"])
    assert.equal(safeUrl(u, false), false, JSON.stringify(u));
  for (const u of ["https://a.example/x", "/relative", "#top", "mailto:a@b.example", "jav&#x61;script:x"]) assert.equal(safeUrl(u, false), true, u);
  assert.equal(safeUrl("data:image/png;base64,AAAA", true), true);
  assert.equal(safeUrl("data:image/png;base64,AAAA", false), false);
  assert.deepEqual(evaluate('<Button href="java\tscript:alert(1)">Go</Button>').errs.map((e) => e.cls), ["unsafe-url"]);
});

test("a known component's line that isn't a valid tag is an error on its line (as the core)", () => {
  const unread = (t: string) => evaluate(t).errs.filter((e) => e.cls === "unreadable-tag").map((e) => e.detail);
  assert.deepEqual(unread("Intro.\n\n<Stat label! value! tone?>\n"), ["<Stat> can't be read as a tag (line 3)"]);
  assert.deepEqual(unread('<Columns>\n<Card title="Ambient" subtitle "Eno">\nCalm.\n</Card>\n</Columns>\n'), ["<Card> can't be read as a tag (line 2)"]);
  for (const t of ["<Foo bar baz>\n", "Use <Stat label> for one number.\n", "The signature:\n\n```\n<Stat label! value!>\n```\n", '<Card title=Budget>\nText.\n</Card>\n'])
    assert.deepEqual(unread(t), [], t);
});

test("a registered renderer draws the component; without one its attributes still show", () => {
  const cat = buildCatalog({ custom: [acme] });
  const answer = '<ProductCard name="Kettle <2L>" price="$40" />';
  const drawn = render(answer, {
    catalog: cat,
    components: { ProductCard: (a) => `<div class="product">${escapeHtml(String(a.name))} ${escapeHtml(String(a.price))}</div>` },
  });
  assert.equal(drawn, '<div class="product">Kettle &lt;2L&gt; $40</div>');
  const fallback = render(answer, { catalog: cat });
  assert.match(fallback, /<dt>name<\/dt><dd>Kettle &lt;2L&gt;<\/dd><dt>price<\/dt><dd>\$40<\/dd>/);
  // The alias renders as the component it means.
  assert.match(render('<Product name="Kettle" price="$40" />', { catalog: cat, components: { ProductCard: () => "drawn" } }), /drawn/);
});

test("a component from a Zod-style JSON Schema", () => {
  const c = fromJsonSchema("Flight", "one flight option", {
    type: "object",
    properties: {
      airline: { type: "string" },
      price: { type: "number" },
      stops: { type: "integer", default: 0 },
      cabin: { type: "string", enum: ["economy", "business"] },
      link: { type: "string", format: "uri" },
      perks: { type: "array", items: { type: "string" } },
      refundable: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    },
    required: ["airline", "price"],
  });
  assert.deepEqual(c.attrs, {
    airline: { type: "string", required: true },
    price: { type: "number", required: true },
    stops: { type: "number", default: 0 },
    cabin: ["economy", "business"],
    link: "url",
    perks: "list",
    refundable: "boolean",
  });
  assert.throws(
    () => fromJsonSchema("Bad", "x", { type: "object", properties: { legs: { type: "array", items: { type: "object" } } } }),
    /Bad.legs: array can't be written in an attribute/,
  );
});
