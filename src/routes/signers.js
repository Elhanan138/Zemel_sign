const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logEvent } = require('../services/auditService');

const router = express.Router();

// GET /api/documents/:id/signers
router.get('/:id/signers', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT id, owner_id FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || doc.owner_id !== req.user.id) return res.status(404).json({ error: 'Document not found' });
  const signers = db.prepare('SELECT * FROM signers WHERE document_id = ? ORDER BY signing_order').all(doc.id);
  res.json(signers);
});

// POST /api/documents/:id/signers
router.post('/:id/signers', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!['draft', 'sent'].includes(doc.status)) {
      return res.status(409).json({ error: 'Cannot add signers to this document' });
    }

    const { name, email, signing_order = 1 } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

    const result = db.prepare(`
      INSERT INTO signers (document_id, name, email, signing_order)
      VALUES (?, ?, ?, ?)
    `).run(doc.id, name, email, signing_order);

    const signer = db.prepare('SELECT * FROM signers WHERE id = ?').get(result.lastInsertRowid);
    logEvent({
      documentId: doc.id, actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'signer_added',
      eventDetail: { signerName: name, signerEmail: email }, ipAddress: req.ip
    });
    res.status(201).json(signer);
  } catch (err) { next(err); }
});

// DELETE /api/documents/:id/signers/:signerId
router.delete('/:id/signers/:signerId', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (doc.status !== 'draft') return res.status(409).json({ error: 'Can only remove signers from drafts' });

  const result = db.prepare('DELETE FROM signers WHERE id = ? AND document_id = ?')
    .run(req.params.signerId, doc.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Signer not found' });
  res.json({ deleted: true });
});

module.exports = router;
