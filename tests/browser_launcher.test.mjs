import assert from "node:assert/strict";
import { test } from "node:test";

import {
  browserArgs,
  defaultProfileDir,
} from "../src/browser_launcher.mjs";

test("builds a stable profile directory per VK account label", () => {
  assert.match(defaultProfileDir("vk account 1"), /profiles\/vk-account-1$/);
});

test("builds browser arguments for a persistent remote-debuggable profile", () => {
  assert.deepEqual(
    browserArgs({
      profileDir: "/tmp/profile",
      remoteDebuggingPort: 9223,
      url: "https://ads.vk.com",
    }),
    [
      "--user-data-dir=/tmp/profile",
      "--remote-debugging-port=9223",
      "--no-first-run",
      "--no-default-browser-check",
      "https://ads.vk.com",
    ],
  );
});
