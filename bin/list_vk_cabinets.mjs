#!/usr/bin/env node
import { parseCabinetListText } from "../src/cabinet_list_parser.mjs";
import { withPage } from "../src/cdp_client.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const port = Number(args.get("--port") || 9223);

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const result = await withPage(port, async (client) => {
  await client.send("Runtime.enable");
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      if (document.querySelector('[class*="accountsDropdown"]')) return;
      document.querySelector('.AccountSwitch\\\\.module_changeAccountButton__XzJiZ, [class*="changeAccountButton"]')?.click();
    })()`,
  });
  await sleep(700);

  const evaluation = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const dropdown = document.querySelector('[class*="accountsDropdown"]');
      const source = dropdown || document.body;
      return {
        url: location.href,
        title: document.title,
        text: source.innerText || ""
      };
    })()`,
  });
  const data = evaluation.result.value;
  return {
    url: data.url,
    title: data.title,
    cabinets: parseCabinetListText(data.text),
    rawTextSample: data.text.slice(0, 1000),
  };
});

console.log(JSON.stringify(result, null, 2));
