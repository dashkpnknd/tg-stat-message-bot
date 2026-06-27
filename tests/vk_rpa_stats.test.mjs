import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAdPlansUrl,
  buildDashboardStatsUrl,
  normalizeDashboardStats,
  normalizeDashboardStatsItems,
  vkDate,
} from "../src/vk_rpa_stats.mjs";

test("formats date for VK dashboard endpoints", () => {
  assert.equal(vkDate("2026-06-18"), "18.06.2026");
});

test("builds ad plans URL for selected internal account", () => {
  assert.equal(
    buildAdPlansUrl({ accountId: "20436176" }),
    "https://ads.vk.com/proxy/mt/v2/ad_plans.json?fields=id%2Cname%2Cstatus%2Cdelivery%2Cbudget_limit%2Cbudget_limit_day%2Ccreated%2Cdate_end%2Cdate_start%2Cobjective%2Cstats_info%2Ccampaigns&_status__in=active%2Cblocked&sorting=-id&limit=50&offset=0&account=20436176",
  );
});

test("builds dashboard stats URL for campaign ids and date", () => {
  assert.equal(
    buildDashboardStatsUrl({
      accountId: "20436176",
      date: "2026-06-18",
      adPlanIds: ["22223464", "22223329"],
    }),
    "https://ads.vk.com/proxy/mt/v3/statistics/ad_plans/day.json?date_from=18.06.2026&date_to=18.06.2026&attribution=conversion&id=22223464%2C22223329&metrics=base&limit=2&account=20436176",
  );
});

test("normalizes VK dashboard stats total", () => {
  assert.deepEqual(
    normalizeDashboardStats({
      total: {
        base: {
          spent: "1234.50",
          goals: 7,
          shows: 1000,
          clicks: 30,
          vk: { result: 7 },
        },
      },
    }),
    {
      spend: 1234.5,
      leads: 7,
      shows: 1000,
      clicks: 30,
    },
  );
});

test("normalizes VK dashboard stats by ad plan item", () => {
  assert.deepEqual(
    normalizeDashboardStatsItems({
      items: [
        {
          id: 22818531,
          total: {
            base: {
              spent: "1011.38",
              clicks: 29,
              shows: 7893,
              vk: { result: 3 },
            },
          },
        },
      ],
    }),
    [
      {
        id: "22818531",
        stats: {
          spend: 1011.38,
          leads: 3,
          shows: 7893,
          clicks: 29,
        },
      },
    ],
  );
});
