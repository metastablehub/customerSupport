const config = require("../config");

let cached = null;
let lastFetch = 0;
let refreshTimer = null;

async function fetchFromChatwoot() {
  if (!config.chatwoot.accountId) {
    throw new Error(
      "Account ID has not been resolved yet. Call resolveAccountId() first."
    );
  }
  const base = config.chatwoot.baseUrl;
  const acctId = config.chatwoot.accountId;
  const url = `${base}/api/v1/accounts/${acctId}/integrations/apps/oneuptime`;

  const res = await fetch(url, {
    headers: { api_access_token: config.chatwoot.apiToken },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch OneUptime hook settings from Chatwoot: ${res.status}`
    );
  }

  const data = await res.json();
  const hooks = data.hooks || [];

  if (hooks.length === 0) {
    throw new Error(
      "OneUptime integration is not connected in Chatwoot. " +
        "Go to Settings > Integrations > OneUptime and connect it first."
    );
  }

  const settings = hooks[0].settings;
  if (!settings || !settings.base_url || !settings.project_id || !settings.api_key) {
    throw new Error(
      "OneUptime hook settings are incomplete. " +
        "Ensure base_url, project_id, and api_key are configured."
    );
  }

  let baseUrl = settings.base_url.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = "http://" + baseUrl;
  }

  return {
    baseUrl,
    projectId: settings.project_id,
    apiKey: settings.api_key,
  };
}

async function getOneUptimeConfig() {
  const now = Date.now();
  if (cached && now - lastFetch < config.hookRefreshMs) {
    return cached;
  }

  try {
    cached = await fetchFromChatwoot();
    lastFetch = Date.now();
    console.log(
      "[hook-settings] loaded OneUptime config from Chatwoot " +
        "(project: " + cached.projectId + ", base: " + cached.baseUrl + ")"
    );
  } catch (err) {
    if (cached) {
      console.warn(
        "[hook-settings] failed to refresh, using cached config:", err.message
      );
    } else {
      throw err;
    }
  }

  return cached;
}

function startAutoRefresh() {
  if (refreshTimer) return;
  refreshTimer = setInterval(async () => {
    try {
      await getOneUptimeConfig();
    } catch (err) {
      console.error("[hook-settings] auto-refresh failed:", err.message);
    }
  }, config.hookRefreshMs);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

module.exports = { getOneUptimeConfig, startAutoRefresh, stopAutoRefresh };
