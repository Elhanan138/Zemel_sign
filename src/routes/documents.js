const express = require('express');
const { getPool } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { logEvent } = require('../services/auditService');
const { embedSignaturesAndFinalize } = require('../services/pdfService');

const router = express.Router();

// GET /api/documents
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const pool = getPool();
    let query = 'SELECT id, owner_id, title, filename, stored_name, file_type, status, page_count, created_at, updated_at FROM documents WHERE owner_id = $1';
    const params = [req.user.id];
    if (status) { query += ' AND status = $2'; params.push(status); }
    query += ' ORDER BY updated_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/documents — upload document
router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const pool = getPool();
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    let pageCount = null;

    if (ext === 'pdf') {
      try {
        const { PDFDocument } = require('pdf-lib');
        const pdf = await PDFDocument.load(req.file.buffer);
        pageCount = pdf.getPageCount();
      } catch { pageCount = 1; }
    }

    const { rows: [doc] } = await pool.query(
      `INSERT INTO documents (owner_id, title, filename, stored_name, file_data, file_type, page_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, owner_id, title, filename, stored_name, file_type, status, page_count, created_at, updated_at`,
      [req.user.id, title, req.file.originalname, storedName, req.file.buffer, ext, pageCount]
    );

    await logEvent({
      documentId: doc.id, actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'document_created',
      eventDetail: { title, filename: req.file.originalname }, ipAddress: req.ip
    });

    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// GET /api/documents/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, owner_id, title, filename, stored_name, file_type, status, page_count, created_at, updated_at FROM documents WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    const doc = rows[0];

    const [{ rows: signers }, { rows: fields }] = await Promise.all([
      pool.query('SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order', [doc.id]),
      pool.query('SELECT * FROM signature_fields WHERE document_id = $1', [doc.id])
    ]);

    res.json({ ...doc, signers, fields });
  } catch (err) { next(err); }
});

// PATCH /api/documents/:id/send
router.patch('/:id/send', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]
    );
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status !== 'draft') return res.status(409).json({ error: 'Only draft documents can be sent' });

    const { rows: signers } = await pool.query('SELECT * FROM signers WHERE document_id = $1', [doc.id]);
    if (!signers.length) return res.status(400).json({ error: 'Add at least one signer before sending' });

    const { signSignerToken } = require('../utils/token');
    for (const signer of signers) {
      const token = signSignerToken(signer, doc.id);
      await pool.query('UPDATE signers SET signing_token = $1 WHERE id = $2', [token, signer.id]);
    }

    await pool.query("UPDATE documents SET status = 'sent', updated_at = NOW() WHERE id = $1", [doc.id]);

    await logEvent({
      documentId: doc.id, actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'document_sent',
      eventDetail: { signerCount: signers.length }, ipAddress: req.ip
    });

    const { rows: updatedSigners } = await pool.query('SELECT * FROM signers WHERE document_id = $1', [doc.id]);
    res.json({ status: 'sent', signers: updatedSigners });
  } catch (err) { next(err); }
});

// PATCH /api/documents/:id/void
router.patch('/:id/void', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, status FROM documents WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    if (rows[0].status === 'voided') return res.status(409).json({ error: 'Already voided' });

    await pool.query("UPDATE documents SET status = 'voided', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await logEvent({
      documentId: Number(req.params.id), actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'document_voided', ipAddress: req.ip
    });
    res.json({ status: 'voided' });
  } catch (err) { next(err); }
});

// GET /api/documents/:id/download — serve original file
router.get('/:id/download', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await getPool().query(
      'SELECT filename, file_data, file_type FROM documents WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    const { filename, file_data, file_type } = rows[0];
    const mime = file_type === 'pdf' ? 'application/pdf' : 'application/octet-stream';
    res.set('Content-Type', mime);
    res.set('Content-Disposition', `inline; filename="${filename}"`);
    res.send(file_data);
  } catch (err) { next(err); }
});

// GET /api/documents/:id/finalized — signed PDF
router.get('/:id/finalized', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, title, filename, status, signed_pdf FROM documents WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    const doc = rows[0];

    let pdfBuffer = doc.signed_pdf;
    if (!pdfBuffer) {
      if (!['signed', 'completed'].includes(doc.status)) {
        return res.status(400).json({ error: 'Document is not fully signed yet' });
      }
      pdfBuffer = await embedSignaturesAndFinalize(doc.id);
    }

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="signed_${doc.filename}"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// DELETE /api/documents/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id FROM documents WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
