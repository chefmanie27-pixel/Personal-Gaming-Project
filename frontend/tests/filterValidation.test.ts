import { test } from "node:test";
import assert from "node:assert/strict";
import { filterNumberError } from "../src/utils/filterValidation";
test("optional number filters accept empty values, zero thresholds and inclusive boundaries", () => {
  for (const kind of ["year", "score", "price"] as const)
    for (const value of ["", undefined, null]) assert.equal(filterNumberError(value, kind), "");
  for (const value of [0, "0", 100]) assert.equal(filterNumberError(value, "score"), "");
  for (const value of [0, "0", "19.99", 0.29, 1000000]) assert.equal(filterNumberError(value, "price"), "");
  for (const value of [1970, "2025", 2100]) assert.equal(filterNumberError(value, "year"), "");
});
test("invalid filters distinguish incomplete input, range, precision and nonfinite errors from empty results", () => {
  for (const value of [1969, 2101, 2025.5]) assert.match(filterNumberError(value, "year"), /whole year/);
  for (const value of [-1, 101, 85.5]) assert.match(filterNumberError(value, "score"), /whole score/);
  for (const value of [-1, 1000001, 1.001, Infinity, NaN, "invalid"]) assert.match(filterNumberError(value, "price"), /price/);
  assert.match(filterNumberError("", "price", true), /price/);
  assert.equal(filterNumberError("", "price", false), "");
});
