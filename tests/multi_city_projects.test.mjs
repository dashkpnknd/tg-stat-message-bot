import assert from "node:assert/strict";
import { test } from "node:test";

import {
  expandProjectRecordsForMultiCity,
  projectEntriesForCabinet,
  splitMultiCityCabinetStats,
} from "../src/multi_city_projects.mjs";

const multiCityCabinets = {
  "9:41|стерлитамак салават ишимбай": ["Стерлитамак", "Салават", "Ишимбай"],
};

test("splits a configured multi-city cabinet by ad plan names", () => {
  const result = splitMultiCityCabinetStats(
    {
      accountLabel: "vk-account-2",
      cabinetId: "1090479557",
      cabinetName: "9:41 | Стерлитамак Салават Ишимбай",
      parsed: {
        projectName: "9:41",
        city: "Стерлитамак Салават Ишимбай",
        projectKey: "9:41|стерлитамак салават ишимбай",
      },
      adPlanStats: [
        { id: "22818506", name: "16.06 / Стерлитамак", stats: { leads: 5, spend: 900 } },
        { id: "22818531", name: "16.06 / Салават", stats: { leads: 3, spend: 1011.38 } },
        { id: "22818565", name: "16.06 / Ишимбае", stats: { leads: 1, spend: 977.32 } },
      ],
    },
    multiCityCabinets,
  );

  assert.deepEqual(result.map((cabinet) => ({
    cabinetId: cabinet.cabinetId,
    cabinetName: cabinet.cabinetName,
    projectKey: cabinet.parsed.projectKey,
    stats: cabinet.stats,
  })), [
    {
      cabinetId: "1090479557:22818506",
      cabinetName: "9:41 | Стерлитамак",
      projectKey: "9:41|стерлитамак",
      stats: { leads: 5, spend: 900 },
    },
    {
      cabinetId: "1090479557:22818531",
      cabinetName: "9:41 | Салават",
      projectKey: "9:41|салават",
      stats: { leads: 3, spend: 1011.38 },
    },
    {
      cabinetId: "1090479557:22818565",
      cabinetName: "9:41 | Ишимбай",
      projectKey: "9:41|ишимбай",
      stats: { leads: 1, spend: 977.32 },
    },
  ]);
});

test("splits a cabinet whose name is one city but ad plans contain the configured city group", () => {
  const result = splitMultiCityCabinetStats(
    {
      accountLabel: "vk-account-2",
      cabinetId: "1090479557",
      cabinetName: "9:41 | Стерлитамак (3)",
      parsed: {
        projectName: "9:41",
        city: "Стерлитамак",
        projectKey: "9:41|стерлитамак",
      },
      adPlanStats: [
        { id: "22818506", name: "16.06 / Стерлитамак", stats: { leads: 6, spend: 893.2 } },
        { id: "22818531", name: "16.06 / Салават", stats: { leads: 3, spend: 858.77 } },
        { id: "22818565", name: "16.06 / Ишимбае", stats: { leads: 4, spend: 1052.03 } },
      ],
    },
    multiCityCabinets,
  );

  assert.deepEqual(result.map((cabinet) => ({
    projectKey: cabinet.parsed.projectKey,
    leads: cabinet.stats.leads,
    spend: cabinet.stats.spend,
  })), [
    { projectKey: "9:41|стерлитамак", leads: 6, spend: 893.2 },
    { projectKey: "9:41|салават", leads: 3, spend: 858.77 },
    { projectKey: "9:41|ишимбай", leads: 4, spend: 1052.03 },
  ]);
});

test("adds separate project rows for a configured multi-city cabinet", () => {
  const entries = projectEntriesForCabinet(
    { cabinetName: "9:41 | Стерлитамак Салават Ишимбай" },
    multiCityCabinets,
  );

  assert.deepEqual(entries.map((entry) => entry.projectKey), [
    "9:41|стерлитамак",
    "9:41|салават",
    "9:41|ишимбай",
  ]);
});

test("expands multiline links from a multi-city project row", () => {
  const records = expandProjectRecordsForMultiCity(
    [
      {
        status: "готов",
        project_name: "9:41",
        city: "Стерлитамак",
        project_key: "9:41|стерлитамак",
        google_spreadsheet_url: [
          "https://docs.google.com/spreadsheets/d/st_sheet_12345678901234567890/edit",
          "https://docs.google.com/spreadsheets/d/sal_sheet_12345678901234567890/edit",
          "https://docs.google.com/spreadsheets/d/ish_sheet_12345678901234567890/edit",
        ].join("\n"),
        sheet_name: "",
        notes: "",
      },
      {
        status: "готов",
        project_name: "9:41",
        city: "Стерлитамак Салават Ишимбай",
        project_key: "9:41|стерлитамак салават ишимбай",
        google_spreadsheet_url: [
          "https://docs.google.com/spreadsheets/d/st_sheet_12345678901234567890/edit",
          "https://docs.google.com/spreadsheets/d/sal_sheet_12345678901234567890/edit",
          "https://docs.google.com/spreadsheets/d/ish_sheet_12345678901234567890/edit",
        ].join("\n"),
        sheet_name: "",
        notes: "",
      },
    ],
    multiCityCabinets,
  );

  const byKey = new Map(records.map((record) => [record.project_key, record]));
  assert.equal(
    byKey.get("9:41|стерлитамак").google_spreadsheet_url,
    "https://docs.google.com/spreadsheets/d/st_sheet_12345678901234567890/edit",
  );
  assert.equal(byKey.get("9:41|стерлитамак").google_spreadsheet_id, "st_sheet_12345678901234567890");
  assert.equal(byKey.get("9:41|салават").google_spreadsheet_id, "sal_sheet_12345678901234567890");
  assert.equal(byKey.get("9:41|ишимбай").google_spreadsheet_id, "ish_sheet_12345678901234567890");
});
