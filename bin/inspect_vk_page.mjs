#!/usr/bin/env node
import { withPage } from "../src/cdp_client.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const port = Number(args.get("--port") || 9223);

const result = await withPage(port, async (client, page) => {
  await client.send("Runtime.enable");
  const evaluation = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => ({
      title: document.title,
      url: location.href,
      bodyText: document.body?.innerText?.slice(0, 5000) || "",
      buttons: Array.from(document.querySelectorAll('button,[role="button"]')).slice(0, 80).map((el) => ({
        text: el.innerText || el.getAttribute('aria-label') || el.textContent || '',
        rect: (() => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()
      }))
    }))()`,
  });
  return { page, data: evaluation.result.value };
});

console.log(JSON.stringify(result, null, 2));
