// The default theme (spec/theme.tokens.json, DTCG) as each platform's code. Run
// it after changing the theme; test/tokens.test.ts fails while the files are stale.
//   node spec/tokens.ts                     write the three platform files
//   node spec/tokens.ts check <file>        check any theme file (contrast in light, dark and mono)
//   node spec/tokens.ts css <file>          print a theme file as the web's CSS
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTheme, modes, readTheme, roles, steps, themeCss, type Palette, type Shadow, type Theme } from "../sdk/web/src/theme.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

export const themeFile = join(here, "theme.tokens.json");
export const loadTheme = (path = themeFile): Theme => readTheme(JSON.parse(readFileSync(path, "utf8")));
export const theme = loadTheme();

const hex = (s: string) => s.replace("#", "").toUpperCase();
const header = (c: string) => `${c} Generated from spec/theme.tokens.json by \`node spec/tokens.ts\`: edit that file, not this one.\n`;

function css(t: Theme): string {
  return header("/*").replace("\n", " */\n") + themeCss(t);
}

function swift(t: Theme): string {
  const shadow = (s: Shadow[]) => `[${s.map((x) => `.init(x: ${x.x}, y: ${x.y}, blur: ${x.blur}, spread: ${x.spread}, rgb: 0x${hex(x.rgb)}, alpha: ${x.alpha})`).join(", ")}]`;
  const palette = (p: Palette) =>
    `.init(\n${roles.map((r) => `            ${r}: 0x${hex(p.color[r])},`).join("\n")}\n            series: [${p.series.map((c) => `0x${hex(c)}`).join(", ")}],\n            rest: ${shadow(p.shadow.rest)},\n            lifted: ${shadow(p.shadow.lifted)},\n            heatMax: ${p.heat}\n        )`;
  const step = (k: (typeof steps)[number]) => {
    const s = t.type[k];
    return `            ${k}: .init(family: .${s.family}, size: ${s.size}, line: ${s.line}, weight: ${s.weight}, tracking: ${s.tracking}, style: .${s.apple})`;
  };
  return `${header("//")}
import SwiftUI

extension ThemeSpec {
    /// The default theme: IBM Plex Sans and Mono with a petrol accent.
    public static let standard = ThemeSpec(
        fonts: .init(
            sans: ${JSON.stringify(t.font.sans).replace(/,/g, ", ")},
            mono: ${JSON.stringify(t.font.mono).replace(/,/g, ", ")}
        ),
        type: .init(
${steps.map(step).join(",\n")}
        ),
        space: .init(${Object.entries(t.space).map(([k, v]) => `${k}: ${v}`).join(", ")}),
        radius: .init(card: ${t.radius.card}, control: ${t.radius.control}, small: ${t.radius.small}),
        motion: .init(fast: ${t.motion.fast / 1000}, base: ${t.motion.base / 1000}, slow: ${t.motion.slow / 1000}, ease: [${t.motion.ease.join(", ")}], spring: [${t.motion.spring.join(", ")}]),
${modes.map((m) => `        ${m}: ${palette(t.modes[m])}`).join(",\n")}
    )
}
`;
}

function kotlin(t: Theme): string {
  const shadow = (s: Shadow[]) => `listOf(${s.map((x) => `Shadow(${x.x}f, ${x.y}f, ${x.blur}f, ${x.spread}f, 0xFF${hex(x.rgb)}, ${x.alpha}f)`).join(", ")})`;
  const palette = (p: Palette) =>
    `MorphPalette(\n${roles.map((r) => `        ${r} = 0xFF${hex(p.color[r])},`).join("\n")}\n        series = listOf(${p.series.map((c) => `0xFF${hex(c)}`).join(", ")}),\n        rest = ${shadow(p.shadow.rest)},\n        lifted = ${shadow(p.shadow.lifted)},\n        heatMax = ${p.heat}f,\n    )`;
  const step = (k: (typeof steps)[number]) => {
    const s = t.type[k];
    return `        ${k} = TypeStep(Family.${s.family === "mono" ? "Mono" : "Sans"}, ${s.size}f, ${s.line}f, ${s.weight}, ${s.tracking}f),`;
  };
  return `${header("//")}
package com.morphscreen.ui

/** The default theme: IBM Plex Sans and Mono with a petrol accent. */
internal val StandardTheme = MorphTheme(
    fonts = Fonts(
        sans = listOf(${t.font.sans.map((f) => JSON.stringify(f)).join(", ")}),
        mono = listOf(${t.font.mono.map((f) => JSON.stringify(f)).join(", ")}),
    ),
    type = TypeScale(
${steps.map(step).join("\n")}
    ),
    space = Space(${Object.values(t.space).map((v) => `${v}f`).join(", ")}),
    radius = Radii(card = ${t.radius.card}f, control = ${t.radius.control}f, small = ${t.radius.small}f),
    motion = Motion(fast = ${t.motion.fast}, base = ${t.motion.base}, slow = ${t.motion.slow}, ease = listOf(${t.motion.ease.map((n) => `${n}f`).join(", ")}), spring = listOf(${t.motion.spring.map((n) => `${n}f`).join(", ")})),
${modes.map((m) => `    ${m} = ${palette(t.modes[m])},`).join("\n")}
)
`;
}

export const outputs = (t = theme) => ({
  [join(root, "render/tokens.css")]: css(t),
  [join(root, "sdk/swift/Sources/MorphScreen/Tokens.swift")]: swift(t),
  [join(root, "sdk/android/ui/src/commonMain/kotlin/com/morphscreen/ui/Tokens.kt")]: kotlin(t),
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "check") {
    const fails = checkTheme(loadTheme(file));
    console.log(fails.length ? `${file}: ${fails.length} problems\n  ${fails.join("\n  ")}` : `${file}: ok (every text colour at least 4.5:1 in light, dark and mono)`);
    process.exit(fails.length ? 1 : 0);
  } else if (cmd === "css") {
    process.stdout.write(themeCss(loadTheme(file)));
  } else {
    for (const [path, text] of Object.entries(outputs())) {
      writeFileSync(path, text);
      console.log(`wrote ${path.slice(root.length + 1)}`);
    }
  }
}
