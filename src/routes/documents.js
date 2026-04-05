const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { logEvent } = require('../services/auditService');
const { embedSignaturesAndFinalize } = require('../services/pdfService');

const router = express.Router();

// GET /api/documents — list user's documents
router.get('/', requireAuth, (req, res) => {
  const { status } = req.query;
  const db = getDb();
  let query = 'SELECT * FROM documents WHERE owner_id = ?';
  const params = [req.user.id];
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY updated_at DESC';
  const docs = db.prepare(query).all(...params);
  res.json(docs);
});

// POST /api/documents — upload document
router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const db = getDb();
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    let pageCount = null;

    if (ext === 'pdf') {
      try {
        const { PDFDocument } = require('pdf-lib');
        const bytes = fs.readFileSync(req.file.path);
        const pdf = await PDFDocument.load(bytes);
        pageCount = pdf.getPageCount();
      } catch { pageCount = 1; }
    }

    const result = db.prepare(`
      INSERT INTO documents (owner_id, title, filename, stored_name, file_type, page_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, title, req.file.originalname, req.file.filename, ext, pageCount);

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);

    logEvent({
      documentId: doc.id, actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'document_created',
      eventDetail: { title, filename: req.file.originalname },
      ipAddress: req.ip
    });

    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// GET /api/documents/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const signers = db.prepare('SELECT * FROM signers WHERE document_id = ? ORDER BY signing_order').all(doc.id);
  const fields = db.prepare('SELECT * FROM signature_fields WHERE document_id = ?').all(doc.id);
  res.json({ ...doc, signers, fields });
});

// PATCH /api/documents/:id/send — transition to 'sent'
router.patch('/:id/send', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status !== 'draft') return res.status(409).json({ error: 'Only draft documents can be sent' });

    const signers = db.prepare('SELECT * FROM signers WHERE document_id = ?').all(doc.id);
    if (signers.length === 0) return res.status(400).json({ error: 'Add at least one signer before sending' });

    const { signSignerToken } = require('../utils/token');
    const updateSigner = db.prepare('UPDATE signers SET signing_token = ? WHERE id = ?');

    for (const signer of signers) {
      const token = signSignerToken(signer, doc.id);
      updateSigner.run(token, signer.id);
    }

    db.prepare("UPDATE documents SET status = 'sent', updated_at = datetime('now') WHERE id = ?").run(doc.id);

    logEvent({
      documentId: doc.id, actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'document_sent',
      eventDetail: { signerCount: signers.length }, ipAddress: req.ip
    });

    const updatedSigners = db.prepare('SELECT * FROM signers WHERE document_id = ?').all(doc.id);
    res.json({ status: 'sent', signers: updatedSigners });
  } catch (err) { next(err); }
});

// PATCH /api/documents/:id/void
router.patch('/:id/void', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status === 'voided') return res.status(409).json({ error: 'Already voided' });

    db.prepare("UPDATE documents SET status = 'voided', updated_at = datetime('now') WHERE id = ?").run(doc.id);
    logEvent({
      documentId: doc.id, actorType: 'user', actorId: req.user.id,
      actorName: req.user.name, eventType: 'document_voided', ipAddress: req.ip
    });
    res.json({ status: 'voided' });
  } catch (err) { next(err); }
});

// GET /api/documents/:id/download — original file
router.get('/:id/download', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const filePath = path.join(__dirname, '../../uploads', doc.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath, doc.filename);
});

// GET /api/documents/:id/finalized — signed PDF
router.get('/:id/finalized', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const processedPath = path.join(__dirname, '../../processed', `${doc.stored_name}_signed.pdf`);
    if (fs.existsSync(processedPath)) {
      return res.download(processedPath, `signed_${doc.filename}`);
    }

    if (!['signed', 'completed'].includes(doc.status)) {
      return res.status(400).json({ error: 'Document is not fully signed yet' });
    }

    const pdfPath = await embedSignaturesAndFinalize(doc.id);
    res.download(pdfPath, `signed_${doc.filename}`);
  } catch (err) { next(err); }
});

// DELETE /api/documents/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  res.json({ deleted: true });
});

module.exports = router;
