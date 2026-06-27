#!/usr/bin/env node
import fs from "node:fs/promises";

import {
  readCabinetRegistry,
  upsertCabinetRegistryRows,
  writeCabinetRegistry,
} from "../src/cabinet_registry.mjs";
import { parseAccessRightsCabinetText } from "../src/cabinet_list_parser.mjs";
import { parseCabinetName } from "../src/cabinet_parser.mjs";
import { withPage } from "../src/cdp_client.mjs";
import { readCsvRecords } from "../src/csv.mjs";
import { yesterdayLocalDate } from "../src/date_utils.mjs";
import { readProjectsFromMaster } from "../src/google_project_registry.mjs";
import { GoogleSheetsClient } from "../src/google_sheets.mjs";
import {
  buildMasterRegistryRows,
  writeMasterRegistry,
} from "../src/master_registry_sheet.mjs";
import { calculateSheetMetrics } from "../src/metrics.mjs";
import {
  expandProjectRecordsForMultiCity,
  splitMultiCityCabinetsStats,
} from "../src/multi_city_projects.mjs";
import {
  aggregateCabinetsByProject,
  decideCabinetStatus,
} from "../src/project_aggregator.mjs";
import {
  noteForSkippedProject,
  notesByProjectKeyFromResults,
} from "../src/sync_notes.mjs";
import { buildMetricUpdatePlan } from "../src/table_mapper.mjs";
import {
  buildAdPlansUrl,
  buildDashboardStatsUrl,
  normalizeDashboardStats,
  normalizeDashboardStatsItems,
  vkDate,
} from "../src/vk_rpa_stats.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const configPath = args.get("--config") || "config/rpa.local.json";
const date = args.get("--date") || yesterdayLocalDate();
const DEFAULT_BUSINESS_PROFILE_ID = "30710361";

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickByText(client, text, { exact = false } = {}) {
  const result = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const text = ${JSON.stringify(text)};
      const exact = ${JSON.stringify(exact)};
      const candidates = Array.from(document.querySelectorAll('body *'))
        .map((el) => {
          const value = (el.innerText || el.textContent || '').trim();
          const rect = el.getBoundingClientRect();
          return { value, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        })
        .filter((item) => item.value && item.width > 5 && item.height > 5)
        .filter((item) => exact ? item.value === text : item.value.includes(text))
        .sort((left, right) => (left.value.length - right.value.length) || (left.width * left.height - right.width * right.height));
      const target = candidates[0];
      if (!target) return null;
      return { x: target.x + Math.min(35, target.width / 2), y: target.y + target.height / 2 };
    })()`,
  });
  const point = result.result.value;
  if (!point) return false;
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  return true;
}

async function clickAccountRowById(client, accountId) {
  const result = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const id = ${JSON.stringify(String(accountId))};
      const candidates = Array.from(document.querySelectorAll('[role="button"], [class*="AccountSwitchListItem"], [class*="account"]'))
        .map((el) => {
          const text = el.innerText || '';
          const rect = el.getBoundingClientRect();
          return { text, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        })
        .filter((item) => item.text.includes('ID: ' + id) && item.width > 20 && item.height > 20)
        .sort((left, right) => (left.text.length - right.text.length) || (left.width * left.height - right.width * right.height));
      const target = candidates[0];
      if (!target) return null;
      return { x: target.x + Math.min(35, target.width / 2), y: target.y + target.height / 2 };
    })()`,
  });
  const point = result.result.value;
  if (!point) return false;
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  return true;
}

async function openAccountDropdown(client) {
  const result = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const dropdown = document.querySelector('[class*="accountsDropdown"]');
      if (dropdown) return true;
      const target = document.querySelector('[class*="changeAccountButton"]');
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`,
  });
  const value = result.result.value;
  if (value === true) return true;
  if (!value) return false;
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: value.x,
    y: value.y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: value.x,
    y: value.y,
    button: "left",
    clickCount: 1,
  });
  await sleep(500);
  return true;
}

async function ensureBusinessProfile(client, businessProfileId) {
  await client.send("Runtime.enable");
  const current = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => localStorage.getItem('user_id'))()`,
  });
  if (String(current.result.value) === String(businessProfileId)) return;
  await openAccountDropdown(client);
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('[class*="accountsDropdown"] input[type="search"], input[placeholder="Поиск"]');
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  });
  await sleep(700);
  if (!(await clickAccountRowById(client, businessProfileId))) {
    throw new Error(`Business profile not found: ${businessProfileId}`);
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const active = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => ({
        userId: localStorage.getItem('user_id'),
        accountId: localStorage.getItem('accountId'),
        name: document.querySelector('[class*="changeAccountName"]')?.innerText?.trim() || ''
      }))()`,
    });
    if (String(active.result.value.userId) === String(businessProfileId)) return active.result.value;
    await sleep(500);
  }
  throw new Error(`Business profile did not become active: ${businessProfileId}`);
}

async function openAccessRights(client) {
  await client.send("Page.enable");
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await client.send("Page.navigate", { url: "https://ads.vk.com/hq/settings" });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const ready = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => (document.body.innerText || '').includes('Права доступа'))()`,
    });
    if (ready.result.value) break;
    await sleep(500);
  }
  if (!(await clickByText(client, "Права доступа"))) {
    throw new Error("Access rights tab not found");
  }
  await sleep(1600);
}

async function getCabinets(client, businessProfileId) {
  await ensureBusinessProfile(client, businessProfileId);
  await openAccessRights(client);
  const evaluation = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => document.body.innerText || "")()`,
  });
  return parseAccessRightsCabinetText(evaluation.result.value);
}

async function selectCabinet(client, cabinet) {
  const cabinetId = cabinet.cabinetId;
  for (let selectAttempt = 0; selectAttempt < 3; selectAttempt += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await sleep(250);
    await openAccountDropdown(client);
    await sleep(700);
    await client.send("Runtime.evaluate", {
      expression: `(() => {
        const input = document.querySelector('[class*="accountsDropdown"] input[type="search"], input[placeholder="Поиск"]');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(input, ${JSON.stringify(String(cabinet.cabinetName))});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`,
    });
    await sleep(900);
    if (!(await clickAccountRowById(client, cabinetId))) {
      await client.send("Runtime.evaluate", {
        expression: `(() => {
          const input = document.querySelector('[class*="accountsDropdown"] input[type="search"], input[placeholder="Поиск"]');
          if (!input) return;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${JSON.stringify(String(cabinetId))});
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`,
      });
      await sleep(900);
      if (await clickAccountRowById(client, cabinetId)) {
        // continue to active-state polling below
      } else {
        continue;
      }
    }
    {
      const activeNow = await client.send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => ({
          userId: localStorage.getItem('user_id'),
          accountId: localStorage.getItem('accountId'),
          sudo: new URL(location.href).searchParams.get('sudo') || '',
          cabinetName: document.querySelector('[class*="changeAccountName"]')?.innerText?.trim() || ''
        }))()`,
      });
      if (String(activeNow.result.value.userId) === String(cabinetId) && activeNow.result.value.accountId) {
        return activeNow.result.value;
      }
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const active = await client.send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => ({
          userId: localStorage.getItem('user_id'),
          accountId: localStorage.getItem('accountId'),
          sudo: new URL(location.href).searchParams.get('sudo') || '',
          cabinetName: document.querySelector('[class*="changeAccountName"]')?.innerText?.trim() || ''
        }))()`,
      });
      if (String(active.result.value.userId) === String(cabinetId) && active.result.value.accountId) {
        return active.result.value;
      }
      await sleep(500);
    }
  }
  throw new Error(`Cabinet did not become active: ${cabinetId}`);
}

async function getStatsForCabinet(client, cabinet, date) {
  await client.send("Page.enable");
  const active = await selectCabinet(client, cabinet);
  const dateParam = vkDate(date);
  await client.send("Page.navigate", {
    url: `https://ads.vk.com/hq/dashboard/ad_plans?mode=ads&attribution=conversion&date_from=${dateParam}&date_to=${dateParam}&sort=-created`,
  });
  await sleep(2200);
  const accountId = active.accountId;
  const adPlansUrl = buildAdPlansUrl({ accountId, sudo: active.sudo });
  const plans = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const response = await fetch(${JSON.stringify(adPlansUrl)}, { credentials: 'include' });
      return { status: response.status, data: await response.json() };
    })()`,
  });
  if (plans.result.value.status !== 200) {
    throw new Error(`Ad plans failed for ${cabinet.cabinetName}: ${plans.result.value.status}`);
  }
  const adPlanIds = (plans.result.value.data.items || []).map((item) => String(item.id));
  if (!adPlanIds.length) {
    return { ...cabinet, stats: { spend: 0, leads: 0, shows: 0, clicks: 0 }, accountId, adPlanIds };
  }
  const adPlanNamesById = new Map((plans.result.value.data.items || []).map((item) => [String(item.id), item.name]));
  const statsUrl = buildDashboardStatsUrl({ accountId, date, adPlanIds, sudo: active.sudo });
  const stats = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const response = await fetch(${JSON.stringify(statsUrl)}, { credentials: 'include' });
      return { status: response.status, data: await response.json() };
    })()`,
  });
  if (stats.result.value.status !== 200) {
    throw new Error(`Stats failed for ${cabinet.cabinetName}: ${stats.result.value.status}`);
  }
  return {
    ...cabinet,
    stats: normalizeDashboardStats(stats.result.value.data),
    adPlanStats: normalizeDashboardStatsItems(stats.result.value.data).map((adPlan) => ({
      ...adPlan,
      name: adPlanNamesById.get(adPlan.id) || "",
    })),
    accountId,
    sudo: active.sudo,
    adPlanIds,
  };
}

async function main() {
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const sheets = new GoogleSheetsClient({ credentialsPath: config.googleCredentialsPath });
  const projects = config.masterSpreadsheetId
    ? await readProjectsFromMaster(sheets, config.masterSpreadsheetId)
    : (await readCsvRecords(config.projectsRegistryPath)).filter((row) => row.status === "active");
  const expandedProjects = expandProjectRecordsForMultiCity(projects, config.multiCityCabinets);
  const projectsByKey = new Map(expandedProjects.map((project) => [project.project_key, project]));
  const cabinetsRegistryPath = config.cabinetsRegistryPath || "config/discovered_cabinets.local.csv";
  const existingCabinetRows = await readCabinetRegistry(cabinetsRegistryPath);
  const scannedCabinets = [];
  const discoveredCabinets = [];
  const accountReports = [];

  for (const account of config.accounts) {
    const accountReport = await withPage(account.port, async (client) => {
      const cabinets = await getCabinets(
        client,
        account.businessProfileId || config.businessProfileId || DEFAULT_BUSINESS_PROFILE_ID,
      );
      discoveredCabinets.push(...cabinets.map((cabinet) => ({
        ...cabinet,
        accountLabel: account.accountLabel,
      })));
      const matched = cabinets
        .map((cabinet) => ({ ...cabinet, parsed: parseCabinetName(cabinet.cabinetName) }))
        .filter((cabinet) => cabinet.parsed);
      const scanTargets = matched;
      const collected = [];
      const errors = [];
      for (const cabinet of scanTargets) {
        try {
          collected.push(await getStatsForCabinet(client, { ...cabinet, accountLabel: account.accountLabel }, date));
        } catch (error) {
          errors.push({
            cabinetId: cabinet.cabinetId,
            cabinetName: cabinet.cabinetName,
            projectKey: cabinet.parsed.projectKey,
            error: error.message,
          });
        }
      }
      scannedCabinets.push(...collected);
      return {
        accountLabel: account.accountLabel,
        cabinetsFound: cabinets.length,
        matched: matched.length,
        ignored: 0,
        scanTargets: scanTargets.length,
        collected,
        errors,
      };
    });
    accountReports.push(accountReport);
  }

  const aggregationCabinets = splitMultiCityCabinetsStats(scannedCabinets, config.multiCityCabinets);
  const aggregation = aggregateCabinetsByProject(aggregationCabinets);
  const writes = [];
  const skipped = [];

  for (const project of aggregation.projects) {
    const registry = projectsByKey.get(project.projectKey);
    if (!registry) {
      skipped.push({ projectKey: project.projectKey, reason: "missing_project_record" });
      continue;
    }
    if (!registry.google_spreadsheet_id) {
      skipped.push({ projectKey: project.projectKey, reason: "missing_google_sheet" });
      continue;
    }
    try {
      let sheetName = registry.sheet_name;
      if (!sheetName) {
        const metadata = await sheets.getSpreadsheet(registry.google_spreadsheet_id);
        sheetName = metadata.sheets[0]?.properties?.title || "Лист1";
      }
      const metrics = calculateSheetMetrics({
        leads: project.leads,
        spend: project.spend,
        vatRate: config.defaultVatRate,
        bonusMultiplier: config.defaultBonusMultiplier,
      });
      const values = await sheets.readValues(
        registry.google_spreadsheet_id,
        `${sheetName}!A1:AF40`,
      );
      const { updates, missingMetricLabels } = buildMetricUpdatePlan({
        sheetName,
        values,
        date,
        metrics,
        sectionLabel: config.projectTableSections?.[project.projectKey] || "",
      });
      if (!updates.length) {
        throw new Error(`Metric rows not found: ${missingMetricLabels.join(", ")}`);
      }
      const result = await sheets.batchUpdateValues(registry.google_spreadsheet_id, updates);
      writes.push({
        projectKey: project.projectKey,
        spreadsheetId: registry.google_spreadsheet_id,
        sheetName,
        metrics,
        missingMetricLabels,
        updatedCells: result.totalUpdatedCells || 0,
      });
    } catch (error) {
      skipped.push({
        projectKey: project.projectKey,
        spreadsheetId: registry.google_spreadsheet_id,
        reason: "google_sheet_write_failed",
        error: error.message,
      });
    }
  }

  const registryUpdates = scannedCabinets.map((cabinet) => {
    const spend = Number(cabinet.stats?.spend) || 0;
    return {
      status: decideCabinetStatus({ spend }),
      account_label: cabinet.accountLabel,
      cabinet_id: cabinet.cabinetId,
      cabinet_name: cabinet.cabinetName,
      project_key: cabinet.parsed?.projectKey || "",
      last_seen_at: date,
      last_positive_spend_at: spend > 0 ? date : "",
      last_spend: String(spend),
      last_leads: String(Number(cabinet.stats?.leads) || 0),
      notes: "",
    };
  });
  const cabinetRegistryRows = upsertCabinetRegistryRows(existingCabinetRows, registryUpdates);
  await writeCabinetRegistry(cabinetsRegistryPath, cabinetRegistryRows);
  if (config.masterSpreadsheetId) {
    const runDate = new Date().toLocaleDateString("sv-SE");
    const cabinetReadFailures = accountReports.flatMap((report) =>
      report.errors
        .filter((error) => error.projectKey)
        .map((error) => ({
          projectKey: error.projectKey,
          reason: "vk_cabinet_read_failed",
          error: error.error,
        })),
    );
    const projectNotes = notesByProjectKeyFromResults({
      writes,
      skipped: [...skipped, ...cabinetReadFailures],
      projects: expandedProjects,
      runDate,
      targetDate: date,
    });
    const masterRows = buildMasterRegistryRows(
      discoveredCabinets,
      expandedProjects,
      cabinetRegistryRows,
      {
        multiCityCabinets: config.multiCityCabinets,
        notesByProjectKey: projectNotes,
        missingSheetNote: noteForSkippedProject({
          reason: "missing_google_sheet",
          runDate,
          targetDate: date,
        }),
        noActivityNote: noteForSkippedProject({
          reason: "no_project_activity",
          runDate,
          targetDate: date,
        }),
      },
    );
    await writeMasterRegistry({
      sheets,
      spreadsheetId: config.masterSpreadsheetId,
      projectRows: masterRows.projectRows,
      cabinetRows: masterRows.cabinetRows,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    date,
    accountReports,
    aggregation,
    writes,
    skipped,
    cabinetsRegistryPath,
    cabinetRegistryUpdates: registryUpdates.length,
    masterSpreadsheet: config.masterSpreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${config.masterSpreadsheetId}/edit`
      : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
