import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatLocalDate,
  yesterdayLocalDate,
} from "../src/date_utils.mjs";

test("formats local dates as yyyy-mm-dd", () => {
  assert.equal(formatLocalDate(new Date(2026, 5, 18)), "2026-06-18");
});

test("returns yesterday as local yyyy-mm-dd", () => {
  assert.equal(yesterdayLocalDate(new Date(2026, 5, 19, 10, 30)), "2026-06-18");
});
