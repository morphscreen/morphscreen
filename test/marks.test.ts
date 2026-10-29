// The marks: the generated platform files match spec/marks.json, and every
// mark has the same lines and points as the others of its kind, so each can
// morph into each.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { marks, outputs } from "../spec/marks.ts";

test("generated mark files are up to date (run node spec/marks.ts)", () => {
  for (const [path, text] of Object.entries(outputs())) assert.equal(readFileSync(path, "utf8"), text, path);
});

for (const kind of ["marks", "filled"] as const) {
  test(`${kind}: every one has the same lines and points`, () => {
    const shapes = Object.entries(marks[kind]);
    const form = (s: [number, number][][]) => s.map((l) => l.length).join(",");
    for (const [k, s] of shapes) {
      assert.equal(form(s), form(shapes[0][1]), `${k} doesn't match ${shapes[0][0]}`);
      for (const l of s) for (const [x, y] of l) assert.ok(x >= 0 && x <= 24 && y >= 0 && y <= 24, `${k} leaves the 24-unit grid`);
    }
  });
}
