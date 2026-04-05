const { getPool } = require('../db/database');

async function logEvent({ documentId, actorType, actorId, actorName, eventType, eventDetail, ipAddress }) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_events (document_id, actor_type, actor_id, actor_name, event_type, event_detail, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [documentId, actorType, actorId || null, actorName || null, eventType,
       eventDetail ? JSON.stringify(eventDetail) : null, ipAddress || null]
    );
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

module.exports = { logEvent };
