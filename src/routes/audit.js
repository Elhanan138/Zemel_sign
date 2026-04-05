const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/documents/:id/audit
router.get('/:id/audit', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT id, owner_id FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || doc.owner_id !== req.user.id) return res.status(404).json({ error: 'Document not found' });

  const events = db.prepare(
    'SELECT * FROM audit_events WHERE document_id = ? ORDER BY created_at ASC'
  ).all(doc.id);

  const parsed = events.map(e => ({
    ...e,
    event_detail: e.event_detail ? JSON.parse(e.event_detail) : null
  }));
  res.json(parsed);
});

module.exports = router;
