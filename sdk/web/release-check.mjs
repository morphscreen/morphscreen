// Whether @morphscreen/web may be published as VERSION (roadmap H4, H6): a
// licence chosen and its file in the package, the third-party notices in
// dist, the package no longer marked private, VERSION written in
// CHANGELOG.md, and the bill of materials built.
// The release workflow runs it before it publishes anything.
//
//   node sdk/web/release-check.mjs 0.1.0

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const version = process.argv[2];
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const changelog = readFileSync(join(here, "CHANGELOG.md"), "utf8");
const problems = [];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version ?? "")) problems.push(`"${version}" isn't a version`);
if (!pkg.license || pkg.license === "UNLICENSED") problems.push("no licence chosen yet (roadmap H6): set package.json's license and add LICENSE");
if (!existsSync(join(here, "LICENSE"))) problems.push("sdk/web/LICENSE is missing");
if (pkg.private) problems.push('package.json still says "private": true');
if (!changelog.includes(`\n## ${version}\n`)) problems.push(`CHANGELOG.md has no "## ${version}"`);
if (!existsSync(join(here, "dist/THIRD_PARTY_NOTICES.md"))) problems.push("dist/THIRD_PARTY_NOTICES.md is missing: run node sdk/web/build.mjs");
if (!existsSync(join(here, "dist/sbom.cdx.json"))) problems.push("dist/sbom.cdx.json is missing: run node tools/sbom.mjs");
if (problems.length) {
  console.error(`@morphscreen/web ${version} can't be published yet:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`@morphscreen/web ${version} is ready to publish`);
