// The same cases as rust/core/tests/parser.rs, in the TypeScript validator and
// reference renderer, so the two can't drift outside the recorded answers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCatalog } from "../spec/catalog.ts";
import { evaluate } from "../validator/validate.ts";
import { render } from "../render/html.ts";

test("synonyms coerce with a note", () => {
  const v = evaluate('Status: <Badge tone="current">On track</Badge>\n<Chart type="grouped">\n| A | B |\n|---|---|\n| x | 1 |\n</Chart>\n');
  assert.ok(v.complete, JSON.stringify(v.errs));
  assert.ok(v.notes.some((n) => n.includes("Badge.tone=current")));
  assert.ok(v.notes.some((n) => n.includes("Chart.type=grouped")));
  assert.ok(render('<Badge tone="current">On track</Badge>\n').includes("ms-badge ms-info"));
});

test("synonyms only for their own attribute", () => {
  const catalog = buildCatalog({ custom: [{ name: "logs", version: "1.0.0", components: { Log: { about: "a log line", attrs: { level: ["debug", "info", "error"] }, content: "text" } } }] });
  const v = evaluate('<Log level="current">Started</Log>\n', { catalog });
  assert.ok(v.errs.some((e) => e.cls === "enum-mismatch" && e.detail === "Log.level=current"), JSON.stringify(v.errs));
});

test("step subtitle", () => {
  const html = render('<Steps>\n<Step title="Pack" subtitle="Monday">Boxes.</Step>\n</Steps>\n');
  assert.ok(html.includes("<strong>Pack</strong><small>Monday</small>"), html);
});

test("a label attribute counts only where the component has one", () => {
  const v = evaluate('<Share label="Send" />\n', { catalog: buildCatalog({ packs: ["device"] }) });
  assert.ok(v.errs.some((e) => e.cls === "required-field" && e.detail === "Share label"), JSON.stringify(v.errs));
  for (const [text, ok] of [
    ['<Button label="Go"></Button>\n', true],
    ['Click <Button label="Go"></Button>\n', true],
    ['<Button label="  "></Button>\n', false],
    ['Click <Button label="  "></Button>\n', false],
    ["<Button label></Button>\n", false],
    ["Click <Button label></Button>\n", false],
  ] as const) {
    const v = evaluate(text);
    assert.equal(v.errs.every((e) => e.cls !== "required-field"), ok, `${JSON.stringify(text)}: ${JSON.stringify(v.errs)}`);
  }
});
