const express = require('express');
const { getDb } = require('../db/database');
const { verifyToken } = require('../utils/token');
const { logEvent } = require('../services/auditService');
const { embedSignaturesAndFinalize } = require('../services/pdfService');

const router = express.Router();

// GET /api/sign/:token — validate token and return doc info + fields
router.get('/:token', (req, res, next) => {
  try {
    let payload;
    try {
      payload = verifyToken(req.params.token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired signing link' });
    }

    const db = getDb();
    const signer = db.prepare('SELECT * FROM signers WHERE id = ? AND signing_token = ?')
      .get(payload.signerId, req.params.token);
    if (!signer) return res.status(401).json({ error: 'Invalid signing token' });
    if (signer.status === 'signed') return res.status(409).json({ error: 'Already signed', signed: true });

    const doc = db.prepare('SELECT id, title, filename, status, page_count FROM documents WHERE id = ?')
      .get(signer.document_id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status === 'voided') return res.status(410).json({ error: 'Document has been voided' });

    const fields = db.prepare(`
      SELECT * FROM signature_fields WHERE document_id = ? AND signer_id = ?
      ORDER BY page_number, y_percent
    `).all(doc.id, signer.id);

    // Check if all signers before this one (by signing_order) have signed
    const blockers = db.prepare(`
      SELECT id FROM signers
      WHERE document_id = ? AND signing_order < ? AND status != 'signed'
    `).all(doc.id, signer.signing_order);

    if (blockers.length > 0) {
      return res.status(403).json({ error: 'Waiting for previous signers', waitingForOthers: true });
    }

    logEvent({
      documentId: doc.id, actorType: 'signer', actorId: signer.id,
      actorName: signer.name, eventType: 'signing_link_accessed', ipAddress: req.ip
    });

    res.json({ signer: { id: signer.id, name: signer.name, email: signer.email }, document: doc, fields });
  } catch (err) { next(err); }
});

// POST /api/sign/:token/submit
router.post('/:token/submit', async (req, res, next) => {
  try {
    let payload;
    try {
      payload = verifyToken(req.params.token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired signing link' });
    }

    const db = getDb();
    const signer = db.prepare('SELECT * FROM signers WHERE id = ? AND signing_token = ?')
      .get(payload.signerId, req.params.token);
    if (!signer) return res.status(401).json({ error: 'Invalid signing token' });
    if (signer.status === 'signed') return res.status(409).json({ error: 'Already signed' });

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(signer.document_id);
    if (!doc || doc.status === 'voided') return res.status(410).json({ error: 'Document unavailable' });

    const { signatures } = req.body; // [{field_id, signature_type, image_data}]
    if (!signatures || !Array.isArray(signatures)) {
      return res.status(400).json({ error: 'signatures array required' });
    }

    const requiredFields = db.prepare(
      'SELECT * FROM signature_fields WHERE document_id = ? AND signer_id = ? AND is_required = 1'
    ).all(doc.id, signer.id);

    const submittedFieldIds = new Set(signatures.map(s => String(s.field_id)));
    const missing = requiredFields.filter(f => !submittedFieldIds.has(String(f.id)));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.map(f => f.id).join(', ')}` });
    }

    // Save signatures in a transaction
    const insertSig = db.prepare(`
      INSERT INTO signatures (field_id, signer_id, document_id, signature_type, image_data, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const saveAll = db.transaction(() => {
      for (const sig of signatures) {
        if (!sig.image_data || !sig.image_data.startsWith('data:image/')) {
          throw new Error('Invalid signature image data');
        }
        insertSig.run(sig.field_id, signer.id, doc.id, sig.signature_type || 'drawn',
                      sig.image_data, req.ip, req.headers['user-agent'] || null);
      }
      db.prepare(`
        UPDATE signers SET status = 'signed', signed_at = datetime('now'), token_used_at = datetime('now')
        WHERE id = ?
      `).run(signer.id);
    });
    saveAll();

    logEvent({
      documentId: doc.id, actorType: 'signer', actorId: signer.id,
      actorName: signer.name, eventType: 'signature_submitted',
      eventDetail: { fieldCount: signatures.length }, ipAddress: req.ip
    });

    // Check if all signers done
    const pending = db.prepare(
      "SELECT id FROM signers WHERE document_id = ? AND status = 'pending'"
    ).all(doc.id);

    let newStatus = 'partially_signed';
    if (pending.length === 0) {
      newStatus = 'signed';
      try {
        await embedSignaturesAndFinalize(doc.id);
      } catch (e) {
        console.error('PDF finalization error:', e.message);
      }
      logEvent({
        documentId: doc.id, actorType: 'system', actorName: 'system',
        eventType: 'document_completed', ipAddress: req.ip
      });
    }

    db.prepare("UPDATE documents SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newStatus, doc.id);

    res.json({ success: true, documentStatus: newStatus });
  } catch (err) { next(err); }
});

// POST /api/sign/:token/decline
router.post('/:token/decline', (req, res, next) => {
  try {
    let payload;
    try { payload = verifyToken(req.params.token); } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const db = getDb();
    const signer = db.prepare('SELECT * FROM signers WHERE id = ?').get(payload.signerId);
    if (!signer) return res.status(404).json({ error: 'Signer not found' });

    db.prepare("UPDATE signers SET status = 'declined' WHERE id = ?").run(signer.id);
    db.prepare("UPDATE documents SET status = 'voided', updated_at = datetime('now') WHERE id = ?")
      .run(signer.document_id);
    logEvent({
      documentId: signer.document_id, actorType: 'signer', actorId: signer.id,
      actorName: signer.name, eventType: 'document_voided',
      eventDetail: { reason: 'declined_by_signer' }, ipAddress: req.ip
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/sign/:token/pdf — serve PDF file for viewing during signing
router.get('/:token/pdf', (req, res, next) => {
  try {
    let payload;
    try { payload = verifyToken(req.params.token); } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const db = getDb();
    const signer = db.prepare('SELECT * FROM signers WHERE id = ? AND signing_token = ?')
      .get(payload.signerId, req.params.token);
    if (!signer) return res.status(401).json({ error: 'Invalid token' });

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(signer.document_id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const path = require('path');
    const filePath = path.join(__dirname, '../../uploads', doc.stored_name);
    res.sendFile(filePath);
  } catch (err) { next(err); }
});

module.exports = router;
