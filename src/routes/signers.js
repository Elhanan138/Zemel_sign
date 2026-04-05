const express = require('express');
const { getPool } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logEvent } = require('../services/auditService');

const router = express.Router();

// GET /api/documents/:id/signers
router.get('/:id/signers', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: [doc] } = await pool.query(
      'SELECT id, owner_id FROM documents WHERE id = $1', [req.params.id]
    );
    if (!doc || doc.owner_id !== req.user.id) return res.status(404).json({ error: 'Document not found' });
    const { rows } = await pool.query('SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order', [doc.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/documents/:id/signers
router.post('/:id/signers', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: [doc] } = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!['draft', 'sent'].includes(doc.status)) {
      return res.status(409).json({ error: 'Cannot add signers to this document' });
    }

    const { name, email, signing_order = 1 } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

    const { rows: [signer] } = await pool.query(
      'INSERT INTO signers (document_id, name, email, signing_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [doc.id, name, email, signing_order]
    );

    await logEvent({
      documentId: doc.id, actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'signer_added',
      eventDetail: { signerName: name, signerEmail: email }, ipAddress: req.ip
    });
    res.status(201).json(signer);
  } catch (err) { next(err); }
});

// DELETE /api/documents/:id/signers/:signerId
router.delete('/:id/signers/:signerId', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: [doc] } = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status !== 'draft') return res.status(409).json({ error: 'Can only remove signers from drafts' });

    const result = await pool.query(
      'DELETE FROM signers WHERE id = $1 AND document_id = $2', [req.params.signerId, doc.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Signer not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
