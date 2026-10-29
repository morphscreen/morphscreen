// The theme (spec/theme.tokens.json, DTCG): the generated platform files match
// it, it goes through the format and back unchanged, and every theme, ours and
// the ones in test/fixtures/themes, keeps every text colour readable on every
// background it's drawn on in light, dark and mono (WCAG AA, 4.5:1).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkTheme, readTheme, themeCss, ThemeError, writeTheme } from "../sdk/web/src/theme.ts";
import { loadTheme, outputs, theme, themeFile } from "../spec/tokens.ts";

test("generated token files are up to date (run node spec/tokens.ts)", () => {
  for (const [path, text] of Object.entries(outputs())) assert.equal(readFileSync(path, "utf8"), text, path);
});

test("the theme goes through the format and back unchanged", () => {
  const file = JSON.parse(readFileSync(themeFile, "utf8"));
  const { $description, ...rest } = file;
  assert.deepEqual(writeTheme(theme), rest);
  assert.deepEqual(readTheme(writeTheme(theme)), theme);
});

test("the web's tokens are the theme's CSS", () => {
  const css = readFileSync(join(import.meta.dirname, "../render/tokens.css"), "utf8");
  assert.equal(css.slice(css.indexOf("\n") + 1), themeCss(theme));
});

const fixtures = join(import.meta.dirname, "fixtures/themes");
const themes = [themeFile, ...readdirSync(fixtures).filter((f) => f.endsWith(".tokens.json")).map((f) => join(fixtures, f))];
for (const path of themes) {
  test(`${path.split("/").slice(-2).join("/")}: text is readable everywhere it's drawn`, () => {
    assert.deepEqual(checkTheme(loadTheme(path)), []);
  });
}

test("every custom property is ours, named --ms-, so an app's own (shadcn/ui's --accent) are left alone", () => {
  const root = join(import.meta.dirname, "..");
  const sources = ["render/tokens.css", "render/theme.css", ...readdirSync(join(root, "sdk/web/src")).map((f) => `sdk/web/src/${f}`)];
  for (const f of sources) {
    const text = readFileSync(join(root, f), "utf8");
    const other = [...text.matchAll(/(?<![\w-])--(?!ms-)[a-z][a-z0-9-]*/g)].map((m) => m[0]);
    assert.deepEqual(other, [], f);
  }
  // The core's HTML sets its own on elements too (a bar's width, a slider's place).
  const html = ["html.rs", "html/packs.rs"].map((f) => readFileSync(join(root, "rust/core/src", f), "utf8")).join("");
  assert.deepEqual([...html.matchAll(/style=\\"--(?!ms-)[a-z]+/g)].map((m) => m[0]), []);
});

test("a theme with unreadable text fails the check", () => {
  const t = structuredClone(theme);
  t.modes.dark.color.ink3 = "#3a3d44";
  t.modes.light.color.accentInk = "#2a8f9a";
  const fails = checkTheme(t);
  assert.ok(fails.some((f) => f.startsWith("dark: ink3 on page")), fails.join("\n"));
  assert.ok(fails.some((f) => f.startsWith("light: accentInk on accent")), fails.join("\n"));
});

test("aliases are followed; a loop or a missing token names the token", () => {
  const file = writeTheme(theme) as any;
  file.color.dark.focus = { $value: "{color.dark.accent}" };
  assert.equal(readTheme(file).modes.dark.color.focus, theme.modes.dark.color.accent);
  file.color.dark.focus = { $value: "{color.dark.ink}" };
  file.color.dark.ink = { $value: "{color.dark.focus}" };
  assert.throws(() => readTheme(file), (e: Error) => e instanceof ThemeError && /alias loop/.test(e.message));
  delete file.color.light.accentBg;
  assert.throws(() => readTheme(file), (e: Error) => e instanceof ThemeError && /color\.light\.accentBg/.test(e.message));
});

test("older spellings are read too: hex strings, px strings, durations in seconds", () => {
  const file = writeTheme(theme) as any;
  file.color.light.accent = { $value: "#0B7480" };
  file.space.s4 = { $value: "1rem" };
  file.motion.fast = { $value: "0.12s" };
  const t = readTheme(file);
  assert.equal(t.modes.light.color.accent, "#0b7480");
  assert.equal(t.space.s4, 16);
  assert.equal(t.motion.fast, 120);
});

test("a theme without the primary colour keeps ink on primary buttons; one with it uses it", () => {
  const file = writeTheme(theme) as any;
  for (const m of ["light", "dark", "mono"]) {
    delete file.color[m].primary;
    delete file.color[m].primaryInk;
  }
  const old = readTheme(file);
  for (const m of ["light", "dark", "mono"] as const) {
    assert.equal(old.modes[m].color.primary, old.modes[m].color.ink);
    assert.equal(old.modes[m].color.primaryInk, old.modes[m].color.page);
  }
  file.color.light.primary = { $value: "#6c3fd1" };
  file.color.light.primaryInk = { $value: "#ffffff" };
  const brand = readTheme(file);
  assert.equal(brand.modes.light.color.primary, "#6c3fd1");
  assert.ok(themeCss(brand).includes("--ms-primary: #6c3fd1;"));
  assert.deepEqual(checkTheme(brand), []);
});
