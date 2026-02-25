const config = require("../config");

const BASE = `${config.chatwoot.baseUrl}/api/v1/accounts/${config.chatwoot.accountId}`;
const HEADERS = {
  "Content-Type": "application/json",
  api_access_token: config.chatwoot.apiToken,
};

async function request(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();

  if (!res.ok) {
    const err = new Error(`Chatwoot ${method} ${path} → ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  return text ? JSON.parse(text) : {};
}

/**
 * Fetch full conversation details including messages.
 */
async function getConversation(conversationId) {
  return request("GET", `/conversations/${conversationId}`);
}

/**
 * Send a private note (visible only to agents) or an outgoing message
 * in a conversation.
 */
async function sendMessage(conversationId, content, { isPrivate = true } = {}) {
  return request("POST", `/conversations/${conversationId}/messages`, {
    content,
    message_type: "outgoing",
    private: isPrivate,
  });
}

/**
 * Update custom attributes on a conversation. Existing attributes are
 * merged — only the keys provided are overwritten.
 */
async function updateCustomAttributes(conversationId, customAttributes) {
  return request(
    "POST",
    `/conversations/${conversationId}/custom_attributes`,
    { custom_attributes: customAttributes }
  );
}

module.exports = {
  getConversation,
  sendMessage,
  updateCustomAttributes,
};
