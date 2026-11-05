import { test } from "node:test";
import assert from "node:assert/strict";
import { localDateInput } from "../src/utils/dates";
test("date inputs use local calendar days on either side of UTC midnight", () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = "Africa/Johannesburg";
    assert.equal(
      localDateInput(new Date("2026-11-05T22:30:00Z")),
      "2026-11-06",
    );
    process.env.TZ = "America/New_York";
    assert.equal(
      localDateInput(new Date("2026-11-05T03:30:00Z")),
      "2026-11-04",
    );
    assert.equal(localDateInput(new Date("invalid")), "");
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
