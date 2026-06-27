#!/usr/bin/env node
import fs from "node:fs/promises";

import { withPage } from "../src/cdp_client.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}
const port = Number(args.get("--port"));
const input = args.get("--input");
if (!port || !input) {
  console.error("Required: --port --input");
  process.exit(2);
}

const session = JSON.parse(await fs.readFile(input, "utf8"));
const cookies = session.cookies.map((cookie) => ({
  name: cookie.name,
  value: cookie.value,
  domain: cookie.domain,
  path: cookie.path,
  secure: cookie.secure,
  httpOnly: cookie.httpOnly,
  sameSite: cookie.sameSite,
  expires: cookie.expires,
  priority: cookie.priority,
  sourceScheme: cookie.sourceScheme,
  sourcePort: cookie.sourcePort,
}));

const result = await withPage(port, async (client) => {
  await client.send("Network.enable");
  await client.send("Page.enable");
  await client.send("Network.setCookies", { cookies });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      if (location.origin !== 'https://ads.vk.com') return;
      const localValues = ${JSON.stringify(session.localStorage || {})};
      const sessionValues = ${JSON.stringify(session.sessionStorage || {})};
      for (const [key, value] of Object.entries(localValues)) localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(sessionValues)) sessionStorage.setItem(key, value);
    })()`,
  });
  await client.send("Page.navigate", { url: "https://ads.vk.com" });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      const localValues = ${JSON.stringify(session.localStorage || {})};
      const sessionValues = ${JSON.stringify(session.sessionStorage || {})};
      for (const [key, value] of Object.entries(localValues)) localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(sessionValues)) sessionStorage.setItem(key, value);
      location.href = 'https://ads.vk.com/hq/overview';
    })()`,
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const evaluation = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => ({ title: document.title, url: location.href, body: document.body?.innerText?.slice(0, 300) || '' }))()`,
  });
  return evaluation.result.value;
});
console.log(JSON.stringify({ ok: true, result }, null, 2));
