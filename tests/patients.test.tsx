import assert from "node:assert/strict";
import test from "node:test";

import { calculateAge, normalizeRegisterNo } from "../src/lib/patients";

test("register numbers are normalized for stable lookup and uniqueness", () => {
  assert.equal(normalizeRegisterNo(" аа 00112233 "), "АА00112233");
  assert.equal(normalizeRegisterNo("P-1001"), "P-1001");
});

test("age is calculated from birth date instead of being stored as stale data", () => {
  assert.equal(calculateAge("2019-10-10", new Date(2026, 8, 29)), 6);
  assert.equal(calculateAge("2019-09-29", new Date(2026, 8, 29)), 7);
  assert.equal(calculateAge(null, new Date(2026, 8, 29)), null);
});
