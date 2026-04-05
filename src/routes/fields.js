const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logEvent } = require('../services/auditService');

const router = express.Router();

// GET /api/documents/:id/fields
router.get('/:id/fields', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT id, owner_id FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || doc.owner_id !== req.user.id) return res.status(404).json({ error: 'Document not found' });

  const fields = db.prepare(`
    SELECT f.*, s.name as signer_name, s.email as signer_email
    FROM signature_fields f
    JOIN signers s ON s.id = f.signer_id
    WHERE f.document_id = ?
    ORDER BY f.page_number, f.y_percent
  `).all(doc.id);
  res.json(fields);
});

// POST /api/documents/:id/fields
router.post('/:id/fields', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!['draft', 'sent'].includes(doc.status)) {
      return res.status(409).json({ error: 'Cannot place fields on this document' });
    }

    const { signer_id, page_number, x_percent, y_percent, width_percent, height_percent,
            field_type = 'signature', label, is_required = 1 } = req.body;

    if (!signer_id || page_number == null || x_percent == null || y_percent == null) {
      return res.status(400).json({ error: 'signer_id, page_number, x_percent, y_percent are required' });
    }

    const signer = db.prepare('SELECT id FROM signers WHERE id = ? AND document_id = ?')
      .get(signer_id, doc.id);
    if (!signer) return res.status(400).json({ error: 'Signer not found on this document' });

    const result = db.prepare(`
      INSERT INTO signature_fields
        (document_id, signer_id, page_number, x_percent, y_percent,
         width_percent, height_percent, field_type, label, is_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(doc.id, signer_id, page_number, x_percent, y_percent,
           width_percent || 20, height_percent || 8, field_type, label || null, is_required ? 1 : 0);

    const field = db.prepare('SELECT * FROM signature_fields WHERE id = ?').get(result.lastInsertRowid);
    logEvent({
      documentId: doc.id, actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'field_placed',
      eventDetail: { fieldType: field_type, page: page_number }, ipAddress: req.ip
    });
    res.status(201).json(field);
  } catch (err) { next(err); }
});

// PUT /api/documents/:id/fields/:fieldId
router.put('/:id/fields/:fieldId', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { x_percent, y_percent, width_percent, height_percent, label } = req.body;
    db.prepare(`
      UPDATE signature_fields
      SET x_percent = COALESCE(?, x_percent),
          y_percent = COALESCE(?, y_percent),
          width_percent = COALESCE(?, width_percent),
          height_percent = COALESCE(?, height_percent),
          label = COALESCE(?, label)
      WHERE id = ? AND document_id = ?
    `).run(x_percent, y_percent, width_percent, height_percent, label, req.params.fieldId, doc.id);

    const field = db.prepare('SELECT * FROM signature_fields WHERE id = ?').get(req.params.fieldId);
    res.json(field);
  } catch (err) { next(err); }
});

// DELETE /api/documents/:id/fields/:fieldId
router.delete('/:id/fields/:fieldId', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT id, owner_id FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || doc.owner_id !== req.user.id) return res.status(404).json({ error: 'Document not found' });

  const result = db.prepare('DELETE FROM signature_fields WHERE id = ? AND document_id = ?')
    .run(req.params.fieldId, doc.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Field not found' });
  res.json({ deleted: true });
});

module.exports = router;
