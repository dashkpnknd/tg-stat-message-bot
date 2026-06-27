import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStatisticsUrl,
  fetchAgencyClients,
  normalizeStatisticsResponse,
  requestAccessToken,
} from "../src/vk_ads_api.mjs";

test("builds VK Ads statistics URL for direct cabinet credentials", () => {
  const url = buildStatisticsUrl({
    host: "https://ads.vk.com",
    level: "ad_groups",
    period: "day",
    dateFrom: "2026-06-18",
    dateTo: "2026-06-18",
    metrics: ["spent", "goals"],
    ids: ["123", "456"],
  });

  assert.equal(
    url,
    "https://ads.vk.com/api/v2/statistics/ad_groups/day.json?date_from=2026-06-18&date_to=2026-06-18&metrics=spent%2Cgoals&id__in=123%2C456",
  );
});

test("requests access token with client credentials", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: "token-1" }),
    };
  };

  const token = await requestAccessToken({
    host: "https://ads.vk.com",
    clientId: "id-1",
    clientSecret: "secret-1",
    fetchImpl,
  });

  assert.equal(token, "token-1");
  assert.equal(calls[0].url, "https://ads.vk.com/api/v2/oauth2/token.json");
  assert.equal(calls[0].options.method, "POST");
  assert.match(String(calls[0].options.body), /client_id=id-1/);
  assert.match(String(calls[0].options.body), /client_secret=secret-1/);
});

test("normalizes statistics rows into sheet stats", () => {
  const response = {
    items: [
      { rows: [{ metrics: { spent: "100.50", goals: 2 } }] },
      { rows: [{ metrics: { spent: 50, goals: 3 } }] },
    ],
  };

  assert.deepEqual(
    normalizeStatisticsResponse(response, {
      spendMetric: "spent",
      leadsMetric: "goals",
    }),
    {
      spend: 150.5,
      leads: 5,
    },
  );
});

test("fetches agency clients with access token", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith("/api/v2/oauth2/token.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "token-1" }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            access_type: "full_access",
            status: "active",
            user: {
              id: 17668,
              username: "client_username",
              additional_info: { client_name: "Клиент 1" },
              status: "active",
            },
          },
        ],
      }),
    };
  };

  const clients = await fetchAgencyClients({
    credentials: { clientId: "id-1", clientSecret: "secret-1" },
    fetchImpl,
  });

  assert.deepEqual(clients, [
    {
      id: 17668,
      username: "client_username",
      clientName: "Клиент 1",
      accessType: "full_access",
      relationStatus: "active",
      userStatus: "active",
    },
  ]);
  assert.equal(calls[1].url, "https://ads.vk.com/api/v2/agency/clients.json");
  assert.equal(calls[1].options.headers.authorization, "Bearer token-1");
});
