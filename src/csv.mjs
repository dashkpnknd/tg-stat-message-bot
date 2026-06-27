import fs from "node:fs/promises";

export async function readCsvRecords(path) {
  const text = await fs.readFile(path, "utf8");
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));
  const headers = rows.shift() || [];
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])),
  );
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function writeCsvRecords(path, headers, records) {
  const lines = [
    headers.join(","),
    ...records.map((record) => headers.map((header) => escapeCsvCell(record[header])).join(",")),
  ];
  await fs.writeFile(path, `${lines.join("\n")}\n`, "utf8");
}
