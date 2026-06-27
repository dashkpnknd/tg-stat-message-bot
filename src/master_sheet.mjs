import { GoogleDriveClient } from "./google_drive.mjs";
import { GoogleSheetsClient } from "./google_sheets.mjs";

const SHEET_NAMES = ["Сводка", "Проекты", "Кабинеты", "Последний запуск"];

function groupCabinetsByProject(cabinets) {
  const grouped = new Map();
  for (const cabinet of cabinets) {
    const key = cabinet.project_key;
    if (!key) continue;
    const current = grouped.get(key) || {
      active: 0,
      ignored: 0,
      spend: 0,
      leads: 0,
      lastChecked: "",
    };
    if (cabinet.status === "active") current.active += 1;
    if (cabinet.status === "zero_spend") current.ignored += 1;
    current.spend += Number(cabinet.last_spend) || 0;
    current.leads += Number(cabinet.last_leads) || 0;
    if (cabinet.last_seen_at > current.lastChecked) current.lastChecked = cabinet.last_seen_at;
    grouped.set(key, current);
  }
  return grouped;
}

function sheetRows({ projects, cabinets, accountReports, aggregation, writes, date }) {
  const byProject = groupCabinetsByProject(cabinets);
  const activeCabinets = cabinets.filter((cabinet) => cabinet.status === "active").length;
  const zeroSpendCabinets = cabinets.filter((cabinet) => cabinet.status === "zero_spend").length;
  const errors = accountReports.flatMap((account) => account.errors || []);

  const summary = [
    ["VK Реклама — Общая статистика", ""],
    ["Последняя дата статистики", date],
    ["Проектов в реестре", projects.length],
    ["Активных кабинетов", activeCabinets],
    ["Кабинетов с нулевым расходом", zeroSpendCabinets],
    ["VK-аккаунтов", accountReports.length],
    ["Ошибок последнего запуска", errors.length],
    ["Обновлено таблиц", writes.length],
  ];

  const projectRows = [
    ["Статус", "Проект", "Город", "Ключ проекта", "Google-таблица", "Лист", "Активных кабинетов", "Нулевой расход", "Последний расход", "Последние лиды", "Проверено"],
    ...projects.map((project) => {
      const stats = byProject.get(project.project_key) || {};
      return [
        project.status,
        project.project_name,
        project.city,
        project.project_key,
        project.google_spreadsheet_url,
        project.sheet_name,
        stats.active || 0,
        stats.ignored || 0,
        stats.spend || 0,
        stats.leads || 0,
        stats.lastChecked || "",
      ];
    }),
  ];

  const cabinetRows = [
    ["Статус", "VK-аккаунт", "ID кабинета", "Название кабинета", "Ключ проекта", "Последняя проверка", "Последний положительный расход", "Расход", "Лиды", "Примечание"],
    ...cabinets.map((cabinet) => [
      cabinet.status,
      cabinet.account_label,
      cabinet.cabinet_id,
      cabinet.cabinet_name,
      cabinet.project_key,
      cabinet.last_seen_at,
      cabinet.last_positive_spend_at,
      Number(cabinet.last_spend) || 0,
      Number(cabinet.last_leads) || 0,
      cabinet.notes,
    ]),
  ];

  const runRows = [
    ["Дата", "VK-аккаунт", "Найдено кабинетов", "Совпало с проектами", "Пропущено", "Проверено", "Ошибки"],
    ...accountReports.map((account) => [
      date,
      account.accountLabel,
      account.cabinetsFound,
      account.matched,
      account.ignored || 0,
      account.collected?.length || 0,
      (account.errors || []).map((error) => `${error.cabinetName}: ${error.error}`).join("; "),
    ]),
    [],
    ["Проект", "Расход", "Лиды", "Кабинеты"],
    ...aggregation.projects.map((project) => [
      project.projectKey,
      project.spend,
      project.leads,
      project.cabinetNames.join("; "),
    ]),
  ];

  return { summary, projectRows, cabinetRows, runRows };
}

function headerFormatRequests(sheetId, columnCount) {
  return [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.12, green: 0.16, blue: 0.19 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat",
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: columnCount },
      },
    },
  ];
}

export async function updateMasterSpreadsheet({ config, projects, cabinets, accountReports, aggregation, writes, date }) {
  if (!config.masterSpreadsheetId && !config.masterFolderId) return null;
  let file;
  if (config.masterSpreadsheetId) {
    file = {
      id: config.masterSpreadsheetId,
      webViewLink: `https://docs.google.com/spreadsheets/d/${config.masterSpreadsheetId}/edit`,
    };
  } else {
    const drive = new GoogleDriveClient({ credentialsPath: config.googleCredentialsPath });
    file = await drive.findOrCreateSpreadsheet(
      config.masterFolderId,
      config.masterSpreadsheetName || "VK Реклама — Общая статистика",
    );
  }
  const sheets = new GoogleSheetsClient({ credentialsPath: config.googleCredentialsPath });
  for (const sheetName of SHEET_NAMES) {
    await sheets.ensureSheet(file.id, sheetName);
  }
  const metadata = await sheets.getSpreadsheet(file.id);
  const sheetIdByName = new Map(metadata.sheets.map((sheet) => [sheet.properties.title, sheet.properties.sheetId]));
  const rows = sheetRows({ projects, cabinets, accountReports, aggregation, writes, date });

  await sheets.clearValues(file.id, SHEET_NAMES.map((name) => `${name}!A:Z`));
  await sheets.batchUpdateValues(file.id, [
    { range: "Сводка!A1", values: rows.summary },
    { range: "Проекты!A1", values: rows.projectRows },
    { range: "Кабинеты!A1", values: rows.cabinetRows },
    { range: "Последний запуск!A1", values: rows.runRows },
  ]);
  await sheets.batchUpdateSpreadsheet(file.id, [
    ...headerFormatRequests(sheetIdByName.get("Сводка"), 2),
    ...headerFormatRequests(sheetIdByName.get("Проекты"), 11),
    ...headerFormatRequests(sheetIdByName.get("Кабинеты"), 10),
    ...headerFormatRequests(sheetIdByName.get("Последний запуск"), 7),
  ]);

  return {
    spreadsheetId: file.id,
    url: `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
  };
}
