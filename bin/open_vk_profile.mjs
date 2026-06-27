#!/usr/bin/env node
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

import {
  browserArgs,
  defaultProfileDir,
  YANDEX_BROWSER_EXECUTABLE,
} from "../src/browser_launcher.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const accountLabel = args.get("--account") || "vk-account-1";
const port = Number(args.get("--port") || 9223);
const url = args.get("--url") || "https://ads.vk.com";
const profileDir = args.get("--profile-dir") || defaultProfileDir(accountLabel);

await fs.mkdir(profileDir, { recursive: true });

const child = spawn(
  YANDEX_BROWSER_EXECUTABLE,
  browserArgs({ profileDir, remoteDebuggingPort: port, url }),
  {
    detached: true,
    stdio: "ignore",
  },
);
child.unref();

console.log(
  JSON.stringify(
    {
      ok: true,
      accountLabel,
      profileDir,
      remoteDebuggingPort: port,
      url,
      message: "Yandex profile opened. Log in to VK Ads in that browser window and keep it open until login is complete.",
    },
    null,
    2,
  ),
);
