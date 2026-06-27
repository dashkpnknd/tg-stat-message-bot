#!/usr/bin/env node
import fs from "node:fs/promises";

import { readCsvRecords } from "../src/csv.mjs";
import { GoogleSheetsClient } from "../src/google_sheets.mjs";
import {
  buildMasterRegistryRows,
  writeMasterRegistry,
} from "../src/master_registry_sheet.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const spreadsheetId = args.get("--spreadsheet-id");
const credentialsPath = args.get("--credentials");
const account1Path = args.get("--account-1");
const account2Path = args.get("--account-2");

if (!spreadsheetId || !credentialsPath || !account1Path || !account2Path) {
  console.error("Required: --spreadsheet-id --credentials --account-1 --account-2");
  process.exit(2);
}

const [account1, account2] = await Promise.all([
  fs.readFile(account1Path, "utf8").then(JSON.parse),
  fs.readFile(account2Path, "utf8").then(JSON.parse),
]);
const cabinets = [
  ...account1.cabinets.map((cabinet) => ({ ...cabinet, accountLabel: "vk-account-1" })),
  ...account2.cabinets.map((cabinet) => ({ ...cabinet, accountLabel: "vk-account-2" })),
];

let existingProjects = [];
let statuses = [];
try {
  existingProjects = await readCsvRecords("config/projects.local.csv");
} catch {}
try {
  statuses = await readCsvRecords("config/discovered_cabinets.local.csv");
} catch {}

const rows = buildMasterRegistryRows(cabinets, existingProjects, statuses);
const sheets = new GoogleSheetsClient({ credentialsPath });
await writeMasterRegistry({ sheets, spreadsheetId, ...rows });
console.log(JSON.stringify({
  ok: true,
  spreadsheetId,
  projects: rows.projectRows.length,
  cabinets: rows.cabinetRows.length,
}, null, 2));
