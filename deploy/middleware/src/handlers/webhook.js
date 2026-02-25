const oneuptime = require("../services/oneuptime");
const chatwoot = require("../services/chatwoot");
const config = require("../config");
const tracker = require("../workers/incident-tracker");

const COMMAND_PREFIX = "/oncall";

/**
 * Chatwoot wraps webhook content in HTML (e.g. <p>...</p>).
 * Strip tags and decode common entities to recover plain text.
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseCommand(text) {
  const lines = text.split("\n").map((l) => l.trim());
  if (!lines[0].toLowerCase().startsWith(COMMAND_PREFIX)) return null;

  const fields = {};
  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(/^(\w[\w\s]*):\s*(.+)$/);
    if (match) {
      fields[match[1].trim().toLowerCase()] = match[2].trim();
    }
  }

  if (!fields.severity) return null;

  return {
    severity: fields.severity,
    team: fields.team || null,
    title: fields.title || null,
  };
}

function matchSeverity(severities, requested) {
  const lower = requested.toLowerCase();
  return (
    severities.find((s) => s.name.toLowerCase() === lower) ||
    severities.find((s) => s.name.toLowerCase().startsWith(lower)) ||
    null
  );
}

function matchOnCallPolicy(policies, requested) {
  const lower = requested.toLowerCase();
  return (
    policies.find((p) => p.name.toLowerCase() === lower) ||
    policies.find((p) => p.name.toLowerCase().includes(lower)) ||
    null
  );
}

function buildIncidentDescription(conversation, messages) {
  const cwBase = config.chatwoot.baseUrl;
  const acctId = config.chatwoot.accountId;
  const convId = conversation.id;
  const conversationUrl = cwBase + "/app/accounts/" + acctId + "/conversations/" + convId;

  const recentMessages = (messages || [])
    .filter((m) => !m.private && m.content)
    .slice(-5)
    .map((m) => {
      const who = m.message_type === 0 ? "Customer" : "Agent";
      return "> **" + who + ":** " + m.content;
    })
    .join("\n>\n");

  let md = "### Incident created from Chatwoot conversation #" + convId + "\n\n";
  md += "**Conversation link:** [Open in Chatwoot](" + conversationUrl + ")\n\n";

  if (conversation.meta && conversation.meta.sender) {
    const sender = conversation.meta.sender;
    md += "**Customer:** " + (sender.name || "Unknown");
    if (sender.email) {
      md += " (" + sender.email + ")";
    }
    md += "\n\n";
  }

  if (recentMessages) {
    md += "#### Recent conversation\n\n" + recentMessages + "\n";
  }

  return md;
}

async function handleWebhook(req, res) {
  const payload = req.body;

  if (payload.event !== "message_created") {
    return res.status(200).json({ ignored: true, reason: "not message_created" });
  }

  if (!payload.private) {
    return res.status(200).json({ ignored: true, reason: "not a private note" });
  }

  const rawContent = (payload.content || "").trim();
  const content = stripHtml(rawContent);
  if (!content.toLowerCase().startsWith(COMMAND_PREFIX)) {
    return res.status(200).json({ ignored: true, reason: "no /oncall command" });
  }

  const command = parseCommand(content);
  if (!command) {
    return res.status(200).json({
      ignored: true,
      reason: "could not parse command - severity is required",
    });
  }

  const conv = payload.conversation;
  const conversationId = conv ? (conv.id || conv.display_id) : null;
  if (!conversationId) {
    return res.status(400).json({ error: "missing conversation id" });
  }

  res.status(202).json({ status: "processing" });

  try {
    await processIncidentCreation(conversationId, command);
  } catch (err) {
    console.error(
      "[webhook] failed to create incident for conversation " + conversationId + ":",
      err
    );
    try {
      await chatwoot.sendMessage(
        conversationId,
        "**OneUptime Integration Error**\n\nFailed to create incident: " + err.message
      );
    } catch (notifyErr) {
      console.error("[webhook] could not notify agent of failure:", notifyErr);
    }
  }
}

async function processIncidentCreation(conversationId, command) {
  const [severities, states, policies, conversation] = await Promise.all([
    oneuptime.listIncidentSeverities(),
    oneuptime.listIncidentStates(),
    oneuptime.listOnCallPolicies(),
    chatwoot.getConversation(conversationId),
  ]);

  const severity = matchSeverity(severities, command.severity);
  if (!severity) {
    const available = severities.map((s) => s.name).join(", ");
    await chatwoot.sendMessage(
      conversationId,
      '**OneUptime:** Unknown severity "' + command.severity + '". Available: ' + available
    );
    return;
  }

  const createdState = states.find((s) => s.isCreatedState);
  if (!createdState) {
    await chatwoot.sendMessage(
      conversationId,
      "**OneUptime:** Could not find the Created incident state. " +
        "Check your OneUptime project configuration."
    );
    return;
  }

  let matchedPolicy = null;
  if (command.team) {
    matchedPolicy = matchOnCallPolicy(policies, command.team);
    if (!matchedPolicy) {
      const available = policies.map((p) => p.name).join(", ");
      await chatwoot.sendMessage(
        conversationId,
        '**OneUptime:** Unknown team/on-call policy "' + command.team + '". ' +
          "Available: " + available
      );
      return;
    }
  }

  const title =
    command.title ||
    "[Chatwoot #" + conversationId + "] Support escalation - " + severity.name;

  const description = buildIncidentDescription(
    conversation,
    conversation.messages
  );

  const incident = await oneuptime.createIncident({
    title,
    description,
    incidentSeverityId: severity._id,
    currentIncidentStateId: createdState._id,
    onCallDutyPolicyIds: matchedPolicy ? [matchedPolicy._id] : undefined,
  });

  const incidentId = incident._id;
  const projectId = await oneuptime.getProjectId();
  const ouBase = await oneuptime.getBaseUrl();
  const incidentUrl = ouBase + "/dashboard/" + projectId + "/incidents/" + incidentId;

  const tableLines = [
    "**Incident Created in OneUptime**",
    "",
    "| Field | Value |",
    "|-------|-------|",
    "| **Incident ID** | `" + incidentId + "` |",
    "| **Severity** | " + severity.name + " |",
    "| **Status** | " + createdState.name + " |",
  ];
  if (matchedPolicy) {
    tableLines.push("| **On-Call Team** | " + matchedPolicy.name + " |");
  }
  tableLines.push("| **Link** | [View in OneUptime](" + incidentUrl + ") |");

  await Promise.all([
    chatwoot.updateCustomAttributes(conversationId, {
      oneuptime_incident_id: incidentId,
      oneuptime_incident_status: createdState.name,
      oneuptime_incident_severity: severity.name,
      oneuptime_incident_url: incidentUrl,
    }),
    chatwoot.sendMessage(conversationId, tableLines.join("\n")),
  ]);

  const stateMap = {};
  for (const s of states) {
    stateMap[s._id] = s.name;
  }
  tracker.track(conversationId, incidentId, createdState._id, stateMap);

  console.log(
    "[webhook] created incident " + incidentId + " for conversation " + conversationId
  );
}

module.exports = { handleWebhook, parseCommand };
