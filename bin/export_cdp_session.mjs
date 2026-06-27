#!/usr/bin/env node
import fs from "node:fs/promises";

import { withPage } from "../src/cdp_client.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}
const port = Number(args.get("--port"));
const output = args.get("--output");
if (!port || !output) {
  console.error("Required: --port --output");
  process.exit(2);
}

const session = await withPage(port, async (client) => {
  await client.send("Network.enable");
  const cookies = await client.send("Network.getAllCookies");
  const storage = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => ({
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
      url: location.href
    }))()`,
  });
  return { cookies: cookies.cookies, ...storage.result.value };
});
await fs.writeFile(output, JSON.stringify(session, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ ok: true, output, cookies: session.cookies.length }));
