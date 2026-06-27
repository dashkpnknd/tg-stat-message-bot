function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function projectKeyFromParts(projectName, city) {
  return `${normalizeText(projectName).toLowerCase()}|${normalizeText(city).toLowerCase()}`;
}

export function parseCabinetName(cabinetName) {
  const normalized = normalizeText(cabinetName);
  const match = normalized.match(/^(.+?)\s*\|\s*(.+?)(?:\s*\((\d+)\))?$/);
  if (!match) return null;

  const [, rawProjectName, rawCity, rawDuplicateNumber] = match;
  const projectName = normalizeText(rawProjectName);
  const city = normalizeText(rawCity);
  if (!projectName || !city) return null;

  return {
    projectName,
    city,
    duplicateNumber: rawDuplicateNumber ? Number(rawDuplicateNumber) : null,
    projectKey: projectKeyFromParts(projectName, city),
  };
}
