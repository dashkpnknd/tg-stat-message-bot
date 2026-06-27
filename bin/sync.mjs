#!/usr/bin/env node
import { runSync, yesterdayMoscow } from "../src/sync_runner.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const configPath = args.get("--config") || "config/clients.local.json";
const date = args.get("--date") || yesterdayMoscow();

try {
  const results = await runSync({ configPath, date });
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
