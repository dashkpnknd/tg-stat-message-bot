import path from "node:path";

export const YANDEX_BROWSER_EXECUTABLE = "/Applications/Yandex.app/Contents/MacOS/Yandex";

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export function defaultProfileDir(accountLabel, cwd = process.cwd()) {
  return path.join(cwd, "profiles", slugify(accountLabel));
}

export function browserArgs({ profileDir, remoteDebuggingPort, url }) {
  return [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${remoteDebuggingPort}`,
    "--no-first-run",
    "--no-default-browser-check",
    url,
  ];
}
