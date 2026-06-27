import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateSheetMetrics } from "../src/metrics.mjs";

test("calculates leads, spend, CPL, VAT spend, and bonus CPL", () => {
  assert.deepEqual(
    calculateSheetMetrics({
      leads: 4,
      spend: 800,
      vatRate: 0.22,
      bonusMultiplier: 0.5,
    }),
    {
      leads: 4,
      spend: 800,
      spendWithVat: 976,
      cpl: 200,
      cplWithBonus: 100,
    },
  );
});

test("uses zero CPL values when there are no leads", () => {
  assert.deepEqual(
    calculateSheetMetrics({
      leads: 0,
      spend: 800,
      vatRate: 0.22,
      bonusMultiplier: 0.5,
    }),
    {
      leads: 0,
      spend: 800,
      spendWithVat: 976,
      cpl: 0,
      cplWithBonus: 0,
    },
  );
});
