#!/usr/bin/env node
import { withPage } from "../src/cdp_client.mjs";
import { parseCabinetListText } from "../src/cabinet_list_parser.mjs";
import { yesterdayLocalDate } from "../src/date_utils.mjs";
import {
  buildAdPlansUrl,
  buildDashboardStatsUrl,
  normalizeDashboardStats,
  vkDate,
} from "../src/vk_rpa_stats.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const port = Number(args.get("--port") || 9223);
const cabinetId = args.get("--cabinet-id");
const date = args.get("--date") || yesterdayLocalDate();

if (!cabinetId) {
  console.error("Usage: cabinet_stats.mjs --port 9223 --cabinet-id 1090548811 --date 2026-06-18");
  process.exit(2);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSelectedCabinet(client, expectedCabinetId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => ({
        userId: localStorage.getItem('user_id'),
        accountId: localStorage.getItem('accountId'),
        cabinetName: document.querySelector('[class*="changeAccountName"]')?.innerText?.trim() || '',
        url: location.href
      }))()`,
    });
    const value = result.result.value;
    if (String(value.userId) === String(expectedCabinetId) && value.accountId) {
      return value;
    }
    await sleep(500);
  }
  throw new Error(`Cabinet did not become active: ${expectedCabinetId}`);
}

const result = await withPage(port, async (client) => {
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      if (!document.querySelector('[class*="accountsDropdown"]')) {
        document.querySelector('[class*="changeAccountButton"]')?.click();
      }
      const input = document.querySelector('[class*="accountsDropdown"] input[type="search"], input[placeholder="Поиск"]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`,
  });
  await sleep(700);
  const listTextResult = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => (document.querySelector('[class*="accountsDropdown"]') || document.body).innerText || "")()`,
  });
  const cabinetName = parseCabinetListText(listTextResult.result.value).find(
    (cabinet) => cabinet.cabinetId === String(cabinetId),
  )?.cabinetName;
  if (!cabinetName) {
    throw new Error(`Cabinet not found in list: ${cabinetId}`);
  }

  await client.send("Runtime.evaluate", {
    expression: `(() => {
      if (!document.querySelector('[class*="accountsDropdown"]')) {
        document.querySelector('[class*="changeAccountButton"]')?.click();
      }
    })()`,
  });
  await sleep(700);
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('[class*="accountsDropdown"] input[type="search"], input[placeholder="Поиск"]');
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(String(cabinetName))});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  });
  await sleep(700);

  const selectResult = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const id = ${JSON.stringify(String(cabinetId))};
      const candidates = Array.from(document.querySelectorAll('[role="button"]'));
      const target = candidates.find((el) => (el.innerText || '').includes('ID: ' + id));
      if (!target) return { ok: false, error: 'cabinet_not_found' };
      target.scrollIntoView({ block: 'center' });
      target.click();
      return { ok: true };
    })()`,
  });
  if (!selectResult.result.value?.ok) {
    throw new Error(`Cannot select cabinet ${cabinetId}: ${selectResult.result.value?.error || "unknown"}`);
  }

  const selected = await waitForSelectedCabinet(client, cabinetId);
  const dateParam = vkDate(date);
  await client.send("Page.navigate", {
    url: `https://ads.vk.com/hq/dashboard/ad_plans?mode=ads&attribution=conversion&date_from=${dateParam}&date_to=${dateParam}&sort=-created`,
  });
  await sleep(2500);

  const accountInfo = await waitForSelectedCabinet(client, cabinetId);
  const adPlansUrl = buildAdPlansUrl({ accountId: accountInfo.accountId });
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
      cabinetId,
      cabinetName: accountInfo.cabinetName || selected.cabinetName,
      accountId: accountInfo.accountId,
      date,
      adPlanIds,
      stats: { spend: 0, leads: 0, shows: 0, clicks: 0 },
    };
  }

  const statsUrl = buildDashboardStatsUrl({
    accountId: accountInfo.accountId,
    date,
    adPlanIds,
  });
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
    cabinetId,
    cabinetName: accountInfo.cabinetName || selected.cabinetName,
    accountId: accountInfo.accountId,
    date,
    adPlanIds,
    stats: normalizeDashboardStats(statsPayload.data),
  };
});

console.log(JSON.stringify(result, null, 2));
