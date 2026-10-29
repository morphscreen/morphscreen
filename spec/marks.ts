// The marks (spec/marks.json) as each platform's code. Run it after changing
// them; test/marks.test.ts fails while the files are stale.
//   node spec/marks.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
type Shape = [number, number][][];
export const marks: { marks: Record<string, Shape>; filled: Record<string, Shape> } = JSON.parse(readFileSync(join(here, "marks.json"), "utf8"));

const name = (k: string) => k.toUpperCase().replace(/-/g, "_");
const shape = (s: Shape) => JSON.stringify(s).replace(/,/g, ", ");

function ts(): string {
  const lines = [
    "// Generated from spec/marks.json by `node spec/marks.ts`: edit that file, not this one.",
    'import type { Shape } from "./morph";',
    "",
    ...Object.entries(marks.marks).map(([k, s]) => `export const ${name(k)}: Shape = ${shape(s)};`),
    "/** Filled: their lines close. */",
    ...Object.entries(marks.filled).map(([k, s]) => `export const ${name(k)}: Shape = ${shape(s)};`),
    "",
  ];
  return lines.join("\n");
}

export const outputs = () => ({ [join(root, "sdk/web/src/marks.ts")]: ts() });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [path, text] of Object.entries(outputs())) {
    writeFileSync(path, text);
    console.log(`wrote ${path.slice(root.length + 1)}`);
  }
}
