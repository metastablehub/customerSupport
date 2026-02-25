const { getOneUptimeConfig } = require("./hook-settings");

function unwrap(val) {
  if (val && typeof val === "object" && val.value !== undefined) {
    return val.value;
  }
  return val;
}

async function request(method, path, body) {
  const ouConfig = await getOneUptimeConfig();
  const url = `${ouConfig.baseUrl}/api${path}`;
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ApiKey: ouConfig.apiKey,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();

  if (!res.ok) {
    const err = new Error(`OneUptime ${method} ${path} → ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  return text ? JSON.parse(text) : {};
}

async function getProjectId() {
  const ouConfig = await getOneUptimeConfig();
  return ouConfig.projectId;
}

async function getBaseUrl() {
  const ouConfig = await getOneUptimeConfig();
  return ouConfig.baseUrl;
}

async function listIncidentSeverities() {
  const projectId = await getProjectId();
  const result = await request("POST", "/incident-severity/get-list?limit=50", {
    select: { name: true, color: true, order: true, projectId: true },
    query: { projectId },
    sort: { order: 1 },
  });
  return result.data || [];
}

async function listIncidentStates() {
  const projectId = await getProjectId();
  const result = await request("POST", "/incident-state/get-list?limit=50", {
    select: {
      name: true,
      isCreatedState: true,
      isAcknowledgedState: true,
      isResolvedState: true,
      color: true,
      order: true,
      projectId: true,
    },
    query: { projectId },
    sort: { order: 1 },
  });
  return result.data || [];
}

async function listOnCallPolicies() {
  const projectId = await getProjectId();
  const result = await request(
    "POST",
    "/on-call-duty-policy/get-list?limit=50",
    {
      select: { name: true, description: true, projectId: true },
      query: { projectId },
      sort: { createdAt: -1 },
    }
  );
  return result.data || [];
}

async function createIncident({
  title,
  description,
  incidentSeverityId,
  currentIncidentStateId,
  onCallDutyPolicyIds,
}) {
  const projectId = await getProjectId();
  const data = {
    projectId,
    title,
    description,
    incidentSeverityId,
    currentIncidentStateId,
    declaredAt: new Date().toISOString(),
  };

  if (onCallDutyPolicyIds && onCallDutyPolicyIds.length > 0) {
    data.onCallDutyPolicies = onCallDutyPolicyIds;
  }

  return request("POST", "/incident", { data });
}

async function getIncident(incidentId) {
  const raw = await request("POST", `/incident/${incidentId}/get-item`, {
    select: {
      title: true,
      currentIncidentStateId: true,
      incidentSeverityId: true,
      slug: true,
      projectId: true,
      incidentNumber: true,
      incidentNumberWithPrefix: true,
    },
  });

  raw.currentIncidentStateId = unwrap(raw.currentIncidentStateId);
  raw.incidentSeverityId = unwrap(raw.incidentSeverityId);
  raw.projectId = unwrap(raw.projectId);

  return raw;
}

module.exports = {
  listIncidentSeverities,
  listIncidentStates,
  listOnCallPolicies,
  createIncident,
  getIncident,
  getProjectId,
  getBaseUrl,
};
