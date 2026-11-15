#!/usr/bin/env node
// morphscreen: set MorphScreen up in an app, and check what's set up.
//
//   npx morphscreen init [--no-install] [--json]
//   npx morphscreen doctor [--offline] [--json]
import { readFileSync } from "node:fs";
import { doctor } from "../lib/doctor.mjs";
import { init } from "../lib/init.mjs";

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("-"));
const flag = (f) => args.includes(f);
const json = flag("--json");
const dir = process.cwd();
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `morphscreen ${version}: generative UI for any model (https://morphscreen.com)

  npx morphscreen init      set MorphScreen up in this Next.js app (App Router):
                            installs @morphscreen/web, writes a route that keeps
                            your key on the server and a chat page at /morphscreen
      --no-install          write the files, install nothing
  npx morphscreen doctor    check what's set up, each problem with its fix
      --offline             don't ask npm or the API
  --json                    the result as JSON, for scripts and coding agents
`;

if (flag("--version") || flag("-v") || command === "version") {
  console.log(version);
  process.exit(0);
}
if (!command || flag("--help") || flag("-h")) {
  process.stdout.write(HELP);
  process.exit(command || flag("--help") || flag("-h") ? 0 : 1);
}

if (command === "init") {
  const r = init(dir, { install: !flag("--no-install"), log: json ? () => {} : (l) => console.log(l) });
  if (json) console.log(JSON.stringify(r, null, 2));
  else if (!r.ok) console.error(`\nmorphscreen init: ${r.error ?? "a step failed"}`);
  else {
    console.log(`
Next:
  1. Put your key in .env.local: MORPHSCREEN_KEY=ms_live_...
     (free, no card: https://app.morphscreen.com)
  2. Start the app and open /morphscreen
  3. npx morphscreen doctor checks it all`);
  }
  process.exit(r.ok ? 0 : 1);
}

if (command === "doctor") {
  const r = await doctor(dir, { offline: flag("--offline") });
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    for (const c of r.checks) console.log(`${{ ok: "ok  ", warn: "warn", fail: "FAIL" }[c.status]}  ${c.message}${c.fix ? `\n      fix: ${c.fix}` : ""}`);
    console.log(r.ok ? "\nAll set." : "\nFix the FAIL lines, then run it again.");
  }
  process.exit(r.ok ? 0 : 1);
}

process.stderr.write(`morphscreen: no command "${command}"\n\n${HELP}`);
process.exit(1);
