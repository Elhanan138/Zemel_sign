const express = require('express');
const { getPool } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logEvent } = require('../services/auditService');

const router = express.Router();

// GET /api/documents/:id/fields
router.get('/:id/fields', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: [doc] } = await pool.query(
      'SELECT id, owner_id FROM documents WHERE id = $1', [req.params.id]
    );
    if (!doc || doc.owner_id !== req.user.id) return res.status(404).json({ error: 'Document not found' });

    const { rows } = await pool.query(`
      SELECT f.*, s.name as signer_name, s.email as signer_email
      FROM signature_fields f
      JOIN signers s ON s.id = f.signer_id
      WHERE f.document_id = $1
      ORDER BY f.page_number, f.y_percent
    `, [doc.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/documents/:id/fields
router.post('/:id/fields', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: [doc] } = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!['draft', 'sent'].includes(doc.status)) {
      return res.status(409).json({ error: 'Cannot place fields on this document' });
    }

    const { signer_id, page_number, x_percent, y_percent,
            width_percent = 20, height_percent = 8,
            field_type = 'signature', label, is_required = true } = req.body;

    if (!signer_id || page_number == null || x_percent == null || y_percent == null) {
      return res.status(400).json({ error: 'signer_id, page_number, x_percent, y_percent are required' });
    }

    const { rows: [signer] } = await pool.query(
      'SELECT id FROM signers WHERE id = $1 AND document_id = $2', [signer_id, doc.id]
    );
    if (!signer) return res.status(400).json({ error: 'Signer not found on this document' });

    const { rows: [field] } = await pool.query(`
      INSERT INTO signature_fields
        (document_id, signer_id, page_number, x_percent, y_percent, width_percent, height_percent, field_type, label, is_required)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [doc.id, signer_id, page_number, x_percent, y_percent, width_percent, height_percent, field_type, label || null, !!is_required]);

    await logEvent({
      documentId: doc.id, actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'field_placed',
      eventDetail: { fieldType: field_type, page: page_number }, ipAddress: req.ip
    });
    res.status(201).json(field);
  } catch (err) { next(err); }
});

// PUT /api/documents/:id/fields/:fieldId
router.put('/:id/fields/:fieldId', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: [doc] } = await pool.query(
      'SELECT id, owner_id FROM documents WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { x_percent, y_percent, width_percent, height_percent, label } = req.body;
    await pool.query(`
      UPDATE signature_fields SET
        x_percent      = COALESCE($1, x_percent),
        y_percent      = COALESCE($2, y_percent),
        width_percent  = COALESCE($3, width_percent),
        height_percent = COALESCE($4, height_percent),
        label          = COALESCE($5, label)
      WHERE id = $6 AND document_id = $7
    `, [x_percent, y_percent, width_percent, height_percent, label, req.params.fieldId, doc.id]);

    const { rows: [field] } = await pool.query('SELECT * FROM signature_fields WHERE id = $1', [req.params.fieldId]);
    res.json(field);
  } catch (err) { next(err); }
});

// DELETE /api/documents/:id/fields/:fieldId
router.delete('/:id/fields/:fieldId', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: [doc] } = await pool.query(
      'SELECT id, owner_id FROM documents WHERE id = $1', [req.params.id]
    );
    if (!doc || doc.owner_id !== req.user.id) return res.status(404).json({ error: 'Document not found' });

    const result = await pool.query(
      'DELETE FROM signature_fields WHERE id = $1 AND document_id = $2', [req.params.fieldId, doc.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Field not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
