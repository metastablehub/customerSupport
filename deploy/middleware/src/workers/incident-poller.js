const oneuptime = require("../services/oneuptime");
const chatwoot = require("../services/chatwoot");
const tracker = require("./incident-tracker");
const config = require("../config");

let timerId = null;

async function poll() {
  if (tracker.size() === 0) return;

  for (const [incidentId, entry] of tracker.entries()) {
    try {
      const incident = await oneuptime.getIncident(incidentId);
      const newStateId = incident.currentIncidentStateId;

      if (newStateId && newStateId !== entry.lastKnownStateId) {
        const stateName = entry.stateMap[newStateId] || newStateId;
        const oldName = entry.stateMap[entry.lastKnownStateId] || "Unknown";

        const ouBase = await oneuptime.getBaseUrl();
        const projectId = await oneuptime.getProjectId();
        const url =
          ouBase + "/dashboard/" + projectId + "/incidents/" + incidentId;

        await Promise.all([
          chatwoot.updateCustomAttributes(entry.conversationId, {
            oneuptime_incident_status: stateName,
          }),
          chatwoot.sendMessage(
            entry.conversationId,
            "**OneUptime Incident Update**\n\n" +
              "Status changed: **" + oldName + "** -> **" + stateName + "**\n\n" +
              "[View incident](" + url + ")"
          ),
        ]);

        entry.lastKnownStateId = newStateId;

        const isResolved = entry.stateMap[newStateId]
          ? entry.stateMap[newStateId].toLowerCase().includes("resolved")
          : false;

        if (isResolved) {
          console.log(
            "[poller] incident " + incidentId + " resolved, untracking"
          );
          tracker.untrack(incidentId);
        }

        console.log(
          "[poller] incident " +
            incidentId +
            " state: " +
            oldName +
            " -> " +
            stateName
        );
      }
    } catch (err) {
      console.error(
        "[poller] error checking incident " + incidentId + ":",
        err.message
      );
    }
  }
}

function start() {
  if (timerId) return;
  const interval = config.pollIntervalMs;
  console.log("[poller] starting incident status poller (every " + interval + "ms)");
  timerId = setInterval(poll, interval);
}

function stop() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

module.exports = { start, stop };
