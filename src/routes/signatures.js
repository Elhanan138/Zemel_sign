const express = require('express');
const { getPool } = require('../db/database');
const { verifyToken } = require('../utils/token');
const { logEvent } = require('../services/auditService');
const { embedSignaturesAndFinalize } = require('../services/pdfService');

const router = express.Router();

// GET /api/sign/:token
router.get('/:token', async (req, res, next) => {
  try {
    let payload;
    try { payload = verifyToken(req.params.token); } catch {
      return res.status(401).json({ error: 'Invalid or expired signing link' });
    }

    const pool = getPool();
    const { rows: [signer] } = await pool.query(
      'SELECT * FROM signers WHERE id = $1 AND signing_token = $2', [payload.signerId, req.params.token]
    );
    if (!signer) return res.status(401).json({ error: 'Invalid signing token' });
    if (signer.status === 'signed') return res.status(409).json({ error: 'Already signed', signed: true });

    const { rows: [doc] } = await pool.query(
      'SELECT id, title, filename, status, page_count FROM documents WHERE id = $1', [signer.document_id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status === 'voided') return res.status(410).json({ error: 'Document has been voided' });

    const { rows: fields } = await pool.query(
      'SELECT * FROM signature_fields WHERE document_id = $1 AND signer_id = $2 ORDER BY page_number, y_percent',
      [doc.id, signer.id]
    );

    const { rows: blockers } = await pool.query(
      "SELECT id FROM signers WHERE document_id = $1 AND signing_order < $2 AND status != 'signed'",
      [doc.id, signer.signing_order]
    );
    if (blockers.length > 0) {
      return res.status(403).json({ error: 'Waiting for previous signers', waitingForOthers: true });
    }

    await logEvent({
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
    try { payload = verifyToken(req.params.token); } catch {
      return res.status(401).json({ error: 'Invalid or expired signing link' });
    }

    const pool = getPool();
    const { rows: [signer] } = await pool.query(
      'SELECT * FROM signers WHERE id = $1 AND signing_token = $2', [payload.signerId, req.params.token]
    );
    if (!signer) return res.status(401).json({ error: 'Invalid signing token' });
    if (signer.status === 'signed') return res.status(409).json({ error: 'Already signed' });

    const { rows: [doc] } = await pool.query('SELECT * FROM documents WHERE id = $1', [signer.document_id]);
    if (!doc || doc.status === 'voided') return res.status(410).json({ error: 'Document unavailable' });

    const { signatures } = req.body;
    if (!signatures || !Array.isArray(signatures)) {
      return res.status(400).json({ error: 'signatures array required' });
    }

    const { rows: requiredFields } = await pool.query(
      'SELECT * FROM signature_fields WHERE document_id = $1 AND signer_id = $2 AND is_required = TRUE',
      [doc.id, signer.id]
    );

    const submittedIds = new Set(signatures.map(s => String(s.field_id)));
    const missing = requiredFields.filter(f => !submittedIds.has(String(f.id)));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.map(f => f.id).join(', ')}` });
    }

    // Insert all signatures
    for (const sig of signatures) {
      if (!sig.image_data || !sig.image_data.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Invalid signature image data' });
      }
      await pool.query(
        `INSERT INTO signatures (field_id, signer_id, document_id, signature_type, image_data, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [sig.field_id, signer.id, doc.id, sig.signature_type || 'drawn',
         sig.image_data, req.ip, req.headers['user-agent'] || null]
      );
    }

    await pool.query(
      "UPDATE signers SET status = 'signed', signed_at = NOW(), token_used_at = NOW() WHERE id = $1",
      [signer.id]
    );

    await logEvent({
      documentId: doc.id, actorType: 'signer', actorId: signer.id,
      actorName: signer.name, eventType: 'signature_submitted',
      eventDetail: { fieldCount: signatures.length }, ipAddress: req.ip
    });

    const { rows: pending } = await pool.query(
      "SELECT id FROM signers WHERE document_id = $1 AND status = 'pending'", [doc.id]
    );

    let newStatus = 'partially_signed';
    if (pending.length === 0) {
      newStatus = 'signed';
      try {
        const signedPdf = await embedSignaturesAndFinalize(doc.id);
        await pool.query('UPDATE documents SET signed_pdf = $1 WHERE id = $2', [signedPdf, doc.id]);
      } catch (e) { console.error('PDF finalization error:', e.message); }
      await logEvent({
        documentId: doc.id, actorType: 'system', actorName: 'system',
        eventType: 'document_completed', ipAddress: req.ip
      });
    }

    await pool.query("UPDATE documents SET status = $1, updated_at = NOW() WHERE id = $2", [newStatus, doc.id]);

    res.json({ success: true, documentStatus: newStatus });
  } catch (err) { next(err); }
});

// POST /api/sign/:token/decline
router.post('/:token/decline', async (req, res, next) => {
  try {
    let payload;
    try { payload = verifyToken(req.params.token); } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const pool = getPool();
    const { rows: [signer] } = await pool.query('SELECT * FROM signers WHERE id = $1', [payload.signerId]);
    if (!signer) return res.status(404).json({ error: 'Signer not found' });

    await pool.query("UPDATE signers SET status = 'declined' WHERE id = $1", [signer.id]);
    await pool.query("UPDATE documents SET status = 'voided', updated_at = NOW() WHERE id = $1", [signer.document_id]);
    await logEvent({
      documentId: signer.document_id, actorType: 'signer', actorId: signer.id,
      actorName: signer.name, eventType: 'document_voided',
      eventDetail: { reason: 'declined_by_signer' }, ipAddress: req.ip
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/sign/:token/pdf — serve PDF from database
router.get('/:token/pdf', async (req, res, next) => {
  try {
    let payload;
    try { payload = verifyToken(req.params.token); } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const pool = getPool();
    const { rows: [signer] } = await pool.query(
      'SELECT * FROM signers WHERE id = $1 AND signing_token = $2', [payload.signerId, req.params.token]
    );
    if (!signer) return res.status(401).json({ error: 'Invalid token' });

    const { rows: [doc] } = await pool.query(
      'SELECT filename, file_data FROM documents WHERE id = $1', [signer.document_id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${doc.filename}"`);
    res.send(doc.file_data);
  } catch (err) { next(err); }
});

module.exports = router;
