const express = require('express');
const { getPool } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/documents/:id/audit
router.get('/:id/audit', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: [doc] } = await pool.query(
      'SELECT id, owner_id FROM documents WHERE id = $1', [req.params.id]
    );
    if (!doc || doc.owner_id !== req.user.id) return res.status(404).json({ error: 'Document not found' });

    const { rows } = await pool.query(
      'SELECT * FROM audit_events WHERE document_id = $1 ORDER BY created_at ASC', [doc.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
