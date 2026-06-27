#!/usr/bin/env node
import { withPage } from "../src/cdp_client.mjs";
import {
  buildAdPlansUrl,
  buildDashboardStatsUrl,
  normalizeDashboardStats,
} from "../src/vk_rpa_stats.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const port = Number(args.get("--port") || 9223);
const date = args.get("--date") || "2026-06-18";

const result = await withPage(port, async (client) => {
  await client.send("Runtime.enable");
  const info = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => ({
      accountId: localStorage.getItem('accountId'),
      userId: localStorage.getItem('user_id'),
      cabinetName: document.querySelector('[class*="changeAccountName"]')?.innerText?.trim() || '',
      url: location.href
    }))()`,
  });
  const { accountId, userId, cabinetName, url } = info.result.value;
  if (!accountId) {
    throw new Error("Cannot read localStorage.accountId from VK page");
  }

  const adPlansUrl = buildAdPlansUrl({ accountId });
  const adPlansResult = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const response = await fetch(${JSON.stringify(adPlansUrl)}, { credentials: 'include' });
      return { status: response.status, data: await response.json() };
    })()`,
  });
  const adPlansPayload = adPlansResult.result.value;
  if (adPlansPayload.status !== 200) {
    throw new Error(`Ad plans request failed: ${adPlansPayload.status} ${JSON.stringify(adPlansPayload.data)}`);
  }

  const adPlanIds = (adPlansPayload.data.items || []).map((item) => String(item.id));
  if (!adPlanIds.length) {
    return {
      accountId,
      userId,
      cabinetName,
      url,
      date,
      adPlanIds,
      stats: { spend: 0, leads: 0, shows: 0, clicks: 0 },
    };
  }

  const statsUrl = buildDashboardStatsUrl({ accountId, date, adPlanIds });
  const statsResult = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const response = await fetch(${JSON.stringify(statsUrl)}, { credentials: 'include' });
      return { status: response.status, data: await response.json() };
    })()`,
  });
  const statsPayload = statsResult.result.value;
  if (statsPayload.status !== 200) {
    throw new Error(`Stats request failed: ${statsPayload.status} ${JSON.stringify(statsPayload.data)}`);
  }

  return {
    accountId,
    userId,
    cabinetName,
    url,
    date,
    adPlanIds,
    stats: normalizeDashboardStats(statsPayload.data),
  };
});

console.log(JSON.stringify(result, null, 2));
