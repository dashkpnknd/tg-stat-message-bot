#!/usr/bin/env node
import fs from "node:fs/promises";

import { fetchAgencyClients } from "../src/vk_ads_api.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const credentialsPath = args.get("--credentials");
const query = args.get("--query");

if (!credentialsPath) {
  console.error("Usage: bin/agency_clients.mjs --credentials config/vk-agency.local.json");
  process.exit(2);
}

try {
  const credentials = JSON.parse(await fs.readFile(credentialsPath, "utf8"));
  const clients = await fetchAgencyClients({
    credentials,
    limit: 100,
    query,
  });
  console.log(JSON.stringify({ ok: true, clients }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
