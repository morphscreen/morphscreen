// AG-UI's schema table in the core matches the protocol's schema file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { out, source } from "../spec/agui.ts";

test("rust/core/src/agui/schema.rs is up to date (run node spec/agui.ts)", () => {
  assert.equal(readFileSync(out, "utf8"), source);
});
