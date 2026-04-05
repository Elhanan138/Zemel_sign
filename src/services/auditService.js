const { getDb } = require('../db/database');

function logEvent({ documentId, actorType, actorId, actorName, eventType, eventDetail, ipAddress }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_events (document_id, actor_type, actor_id, actor_name, event_type, event_detail, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    documentId,
    actorType,
    actorId || null,
    actorName || null,
    eventType,
    eventDetail ? JSON.stringify(eventDetail) : null,
    ipAddress || null
  );
}

module.exports = { logEvent };
