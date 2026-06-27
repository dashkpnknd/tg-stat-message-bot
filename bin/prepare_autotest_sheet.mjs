#!/usr/bin/env node
import { GoogleSheetsClient } from "../src/google_sheets.mjs";
import { loadConfig } from "../src/sync_runner.mjs";

const configPath = process.argv[2] || "config/clients.local.json";
const config = await loadConfig(configPath);
const sheets = new GoogleSheetsClient({ credentialsPath: config.googleCredentialsPath });
const client = config.clients[0];

const headers = [""];
for (let day = 1; day <= 31; day += 1) {
  headers.push(`${day} июня`);
}

await sheets.ensureSheet(client.spreadsheetId, client.sheetName);
await sheets.batchUpdateValues(client.spreadsheetId, [
  {
    range: `${client.sheetName}!A1:AF11`,
    values: [
      headers,
      ["Кол-во лидов"],
      ["Цена за лид"],
      ["Цена за лид\nс учетом бонусов"],
      ["Конверсия"],
      ["Кол-во продаж"],
      ["Выручка"],
      ["Средний чек"],
      ["Расходы"],
      ["Расходы + НДС"],
      ["ДРР"],
    ],
  },
]);

console.log(JSON.stringify({ ok: true, sheetName: client.sheetName }, null, 2));
