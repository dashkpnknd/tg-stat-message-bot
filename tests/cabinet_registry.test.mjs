import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cabinetRegistryKey,
  upsertCabinetRegistryRows,
} from "../src/cabinet_registry.mjs";

test("builds a stable cabinet registry key from account label and cabinet id", () => {
  assert.equal(
    cabinetRegistryKey({ account_label: "vk-account-1", cabinet_id: "1090530911" }),
    "vk-account-1|1090530911",
  );
  assert.equal(
    cabinetRegistryKey({ accountLabel: "vk-account-1", cabinetId: "1090530911" }),
    "vk-account-1|1090530911",
  );
});

test("upserts cabinet registry rows by account and cabinet id", () => {
  const result = upsertCabinetRegistryRows(
    [
      {
        status: "ignored_zero_spend",
        account_label: "vk-account-1",
        cabinet_id: "1090530911",
        cabinet_name: "Аймоби | Москва (2)",
        last_spend: "0",
      },
    ],
    [
      {
        status: "active",
        account_label: "vk-account-2",
        cabinet_id: "1090425401",
        cabinet_name: "Аймоби | Москва",
        last_spend: "1186.12",
      },
      {
        status: "ignored_zero_spend",
        account_label: "vk-account-1",
        cabinet_id: "1090530911",
        cabinet_name: "Аймоби | Москва (2)",
        last_spend: "0",
        last_seen_at: "2026-06-18",
      },
    ],
  );

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.find((row) => row.cabinet_id === "1090530911"),
    {
      status: "ignored_zero_spend",
      account_label: "vk-account-1",
      cabinet_id: "1090530911",
      cabinet_name: "Аймоби | Москва (2)",
      last_spend: "0",
      last_seen_at: "2026-06-18",
    },
  );
});
