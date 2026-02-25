const express = require("express");
const config = require("./config");
const { handleWebhook } = require("./handlers/webhook");
const poller = require("./workers/incident-poller");
const tracker = require("./workers/incident-tracker");
const hookSettings = require("./services/hook-settings");

const app = express();

app.use(express.json({ limit: "1mb" }));

app.post("/webhook", handleWebhook);

app.get("/health", async (_req, res) => {
  let oneuptimeConnected = false;
  try {
    await hookSettings.getOneUptimeConfig();
    oneuptimeConnected = true;
  } catch {
    oneuptimeConnected = false;
  }

  res.json({
    status: "ok",
    oneuptime_connected: oneuptimeConnected,
    tracked_incidents: tracker.size(),
    uptime: process.uptime(),
  });
});

async function boot() {
  try {
    await hookSettings.getOneUptimeConfig();
    console.log("[integration] OneUptime credentials loaded from Chatwoot integration settings");
  } catch (err) {
    console.warn(
      "[integration] OneUptime not yet connected in Chatwoot:", err.message
    );
    console.warn(
      "[integration] The service will start but /oncall commands will fail until " +
        "OneUptime is connected in Chatwoot Settings > Integrations > OneUptime"
    );
  }

  hookSettings.startAutoRefresh();
  poller.start();

  app.listen(config.port, () => {
    console.log(
      "[integration] Chatwoot-OneUptime integration listening on port " +
        config.port
    );
    console.log(
      "[integration] OneUptime credentials are sourced from Chatwoot integration settings"
    );
  });
}

boot();
