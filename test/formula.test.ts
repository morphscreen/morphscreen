// The reference checks a Result's formula as the core compiles it
// (rust/core/src/formula.rs), with the core's words for what's wrong.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formulaError } from "../validator/validate.ts";

test("formulas the core compiles pass", () => {
  for (const f of ["round(flour * hydration / 100)", "1,250 * price - 2^months", "-rate + max(0, 100 - abs(temp - 25) * 3)", "price × 2 ÷ people", "sqrt(area) % 3"]) {
    assert.equal(formulaError(f), null, f);
  }
});

test("formulas it can't are errors in its words", () => {
  // From recorded answers (2026-10-26): min and max take two values, round one.
  assert.equal(formulaError("min(light, co2, max(0, 100 - abs(temp - 25) * 3))"), "values without an operator between them");
  assert.equal(formulaError("round(flour * 0.002, 1)"), "values without an operator between them");
  assert.equal(formulaError("round(225000 * (rate/100/12 * (1+rate/100/12)^300 / ((1+rate/100/12)^300 - 1))"), "a ( without its )");
  assert.equal(formulaError("alert(1)"), "values without an operator between them", "a name followed by ( is not a call");
  assert.equal(formulaError("2 3"), "two values in a row");
  assert.equal(formulaError("* 2"), "* needs a value before it");
  assert.equal(formulaError("price)"), "a ) without its (");
  assert.equal(formulaError("2 + 1.2.3"), "not a number: 1.2.3");
  assert.equal(formulaError("price $"), "unexpected $");
  assert.equal(formulaError(""), "values without an operator between them");
});
