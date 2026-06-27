export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function yesterdayLocalDate(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() - 1);
  return formatLocalDate(date);
}
