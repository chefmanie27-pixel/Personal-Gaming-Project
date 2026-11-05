import { test } from "node:test";
import assert from "node:assert/strict";
import { alertTargetError } from "../src/utils/alertTarget";
test("alert targets preserve the positive two-decimal contract and expose incomplete native input", () => {
  for (const value of [0.01, 85.25, 100, 9999999999.99]) assert.equal(alertTargetError(value), "");
  for (const value of [undefined, "", 0, -1, 1.001, 10000000000, Infinity, NaN]) assert.match(alertTargetError(value), /positive target/);
  assert.match(alertTargetError(80, true), /positive target/);
});
