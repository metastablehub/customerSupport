const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  chatwoot: {
    baseUrl: required("CHATWOOT_BASE_URL").replace(/\/+$/, ""),
    apiToken: required("CHATWOOT_API_TOKEN"),
    accountId: null,
  },
  port: parseInt(process.env.PORT, 10) || 4000,
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 30_000,
  hookRefreshMs: parseInt(process.env.HOOK_REFRESH_MS, 10) || 300_000,
};

/**
 * Calls GET /api/v1/profile to discover the account ID for the
 * configured API token.  Caches the result on config.chatwoot.accountId.
 */
async function resolveAccountId() {
  if (config.chatwoot.accountId) return config.chatwoot.accountId;

  const url = `${config.chatwoot.baseUrl}/api/v1/profile`;
  const res = await fetch(url, {
    headers: { api_access_token: config.chatwoot.apiToken },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to resolve account ID from ${url}: HTTP ${res.status}`
    );
  }

  const profile = await res.json();
  const accounts = profile.available_accounts || profile.accounts || [];
  if (accounts.length === 0) {
    throw new Error(
      "No accounts found for the configured API token. " +
        "Ensure CHATWOOT_API_TOKEN belongs to a user with at least one account."
    );
  }

  config.chatwoot.accountId = String(accounts[0].id);
  console.log(
    `[config] Resolved account ID: ${config.chatwoot.accountId} ` +
      `(${accounts[0].name || "unnamed"})`
  );
  return config.chatwoot.accountId;
}

module.exports = config;
module.exports.resolveAccountId = resolveAccountId;
