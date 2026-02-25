/**
 * In-memory store of conversations linked to OneUptime incidents.
 * In production this would be backed by a database or Redis.
 *
 * Map shape:  incidentId -> { conversationId, lastKnownStateId, stateMap }
 */
const tracked = new Map();

function track(conversationId, incidentId, initialStateId, stateMap) {
  tracked.set(incidentId, {
    conversationId,
    lastKnownStateId: initialStateId,
    stateMap,
  });
}

function untrack(incidentId) {
  tracked.delete(incidentId);
}

function entries() {
  return tracked.entries();
}

function size() {
  return tracked.size;
}

module.exports = { track, untrack, entries, size };
