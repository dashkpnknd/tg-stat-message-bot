import fs from "node:fs/promises";

import { GoogleSheetsClient } from "./google_sheets.mjs";
import { calculateSheetMetrics } from "./metrics.mjs";
import { fetchMockStats } from "./mock_vk_provider.mjs";
import { buildMetricUpdates } from "./table_mapper.mjs";
import { fetchVkAdsStats } from "./vk_ads_api.mjs";

const DEFAULT_READ_RANGE = "A1:AF40";

export async function loadConfig(configPath) {
  return JSON.parse(await fs.readFile(configPath, "utf8"));
}

export function yesterdayMoscow(now = new Date()) {
  const moscowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date(now.getTime() - 24 * 60 * 60 * 1000))
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  return `${moscowParts.year}-${moscowParts.month}-${moscowParts.day}`;
}

async function fetchStats(client, config, date) {
  if (client.vkSource === "mock") {
    return fetchMockStats(client);
  }
  if (client.vkSource === "vk_ads_api") {
    const credentials = config.vkCredentials?.[client.vkCredentialsRef];
    if (!credentials) {
      throw new Error(`Missing VK credentials: ${client.vkCredentialsRef}`);
    }
    return fetchVkAdsStats({
      credentials,
      date,
      level: client.vkStatisticsLevel || "ad_groups",
      period: client.vkStatisticsPeriod || "day",
      metrics: client.vkMetrics || ["spent", "goals"],
      spendMetric: client.vkSpendMetric || "spent",
      leadsMetric: client.vkLeadsMetric || "goals",
      ids: client.vkObjectIds || [],
    });
  }
  throw new Error(`VK source is not implemented yet: ${client.vkSource}`);
}

export async function syncClient({ sheets, config, client, date }) {
  const rawStats = await fetchStats(client, config, date);
  const metrics = calculateSheetMetrics({
    ...rawStats,
    vatRate: config.defaultVatRate,
    bonusMultiplier: config.defaultBonusMultiplier,
  });

  await sheets.ensureSheet(client.spreadsheetId, client.sheetName);
  const values = await sheets.readValues(
    client.spreadsheetId,
    `${client.sheetName}!${client.readRange || DEFAULT_READ_RANGE}`,
  );
  const updates = buildMetricUpdates({
    sheetName: client.sheetName,
    values,
    date,
    metrics,
  });
  const result = await sheets.batchUpdateValues(client.spreadsheetId, updates);

  return {
    clientName: client.clientName,
    spreadsheetId: client.spreadsheetId,
    sheetName: client.sheetName,
    date,
    metrics,
    updatedCells: result.totalUpdatedCells || 0,
  };
}

export async function runSync({ configPath, date = yesterdayMoscow() }) {
  const config = await loadConfig(configPath);
  const sheets = new GoogleSheetsClient({
    credentialsPath: config.googleCredentialsPath,
  });
  const results = [];
  for (const client of config.clients) {
    results.push(await syncClient({ sheets, config, client, date }));
  }
  return results;
}
