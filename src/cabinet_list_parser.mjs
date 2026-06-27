export function parseCabinetListText(text) {
  const lines = String(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const cabinets = [];
  for (let index = 0; index < lines.length; index += 1) {
    const idMatch = lines[index].match(/^ID:\s*(\d+)/);
    if (!idMatch) continue;

    let name = null;
    for (let back = index - 1; back >= 0; back -= 1) {
      if (["Готово!", "Скопировать ID", "Поиск", "Очистить"].includes(lines[back])) {
        continue;
      }
      name = lines[back];
      break;
    }

    if (name) {
      cabinets.push({
        cabinetName: name,
        cabinetId: idMatch[1],
      });
    }
  }
  return cabinets;
}

export function parseAccessRightsCabinetText(text) {
  const lines = String(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const cabinets = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const name = lines[index];
    const id = lines[index + 1];
    if (!/^\d{7,12}$/.test(id)) continue;
    if (!name.includes("|")) continue;
    cabinets.push({ cabinetName: name, cabinetId: id });
  }
  return cabinets;
}
