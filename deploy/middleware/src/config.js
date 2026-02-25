const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  chatwoot: {
    baseUrl: required("CHATWOOT_BASE_URL").replace(/\/+$/, ""),
    apiToken: required("CHATWOOT_API_TOKEN"),
    accountId: required("CHATWOOT_ACCOUNT_ID"),
  },
  port: parseInt(process.env.PORT, 10) || 4000,
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 30_000,
  hookRefreshMs: parseInt(process.env.HOOK_REFRESH_MS, 10) || 300_000,
};
