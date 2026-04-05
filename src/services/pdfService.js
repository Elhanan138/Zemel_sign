const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { getPool } = require('../db/database');

async function embedSignaturesAndFinalize(documentId) {
  const pool = getPool();
  const { rows: [doc] } = await pool.query(
    'SELECT id, title, file_data FROM documents WHERE id = $1', [documentId]
  );
  if (!doc) throw new Error('Document not found');

  const pdfDoc = await PDFDocument.load(doc.file_data);
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { rows: signatures } = await pool.query(`
    SELECT s.*, f.page_number, f.x_percent, f.y_percent, f.width_percent, f.height_percent, f.field_type
    FROM signatures s
    JOIN signature_fields f ON f.id = s.field_id
    WHERE s.document_id = $1
  `, [documentId]);

  for (const sig of signatures) {
    const pageIndex = (sig.page_number || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    const { width: pageW, height: pageH } = page.getSize();

    const x = (sig.x_percent / 100) * pageW;
    const y = pageH - ((sig.y_percent / 100) * pageH) - ((sig.height_percent / 100) * pageH);
    const w = (sig.width_percent / 100) * pageW;
    const h = (sig.height_percent / 100) * pageH;

    if (sig.field_type === 'date') {
      const dateStr = new Date(sig.signed_at).toLocaleDateString();
      page.drawText(dateStr, {
        x: x + 2, y: y + h / 2 - 5,
        size: Math.min(h * 0.5, 12),
        font: helvetica, color: rgb(0.1, 0.1, 0.7)
      });
    } else {
      try {
        const imgData = sig.image_data;
        const base64Data = imgData.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        const imgBytes = Buffer.from(base64Data, 'base64');
        const embeddedImg = imgData.includes('image/png')
          ? await pdfDoc.embedPng(imgBytes)
          : await pdfDoc.embedJpg(imgBytes);
        page.drawImage(embeddedImg, { x, y, width: w, height: h });
      } catch (e) {
        page.drawText('[Signature]', {
          x: x + 2, y: y + h / 2 - 5, size: 10,
          font: helvetica, color: rgb(0, 0, 0)
        });
      }
    }

    page.drawRectangle({
      x, y, width: w, height: h,
      borderColor: rgb(0.2, 0.4, 0.8), borderWidth: 0.5, opacity: 0.8
    });
  }

  // Audit stamp on last page
  const lastPage = pages[pages.length - 1];
  const { width: lw, height: lh } = lastPage.getSize();
  const { rows: allSigners } = await pool.query('SELECT * FROM signers WHERE document_id = $1', [documentId]);
  const stampLines = [
    `Signed via Zemel Sign`,
    `Document: ${doc.title}`,
    ...allSigners.map(s => `${s.name} <${s.email}> — ${s.signed_at ? new Date(s.signed_at).toISOString() : 'pending'}`),
    `Finalized: ${new Date().toISOString()}`
  ];

  const stampHeight = stampLines.length * 12 + 16;
  lastPage.drawRectangle({
    x: 20, y: 20, width: lw - 40, height: stampHeight,
    color: rgb(0.97, 0.97, 1), borderColor: rgb(0.6, 0.6, 0.9), borderWidth: 0.5
  });
  stampLines.forEach((line, i) => {
    lastPage.drawText(line, {
      x: 28, y: 20 + stampHeight - 14 - i * 12,
      size: 7, font: helvetica, color: rgb(0.3, 0.3, 0.5)
    });
  });

  const finalBytes = await pdfDoc.save();
  return Buffer.from(finalBytes);
}

module.exports = { embedSignaturesAndFinalize };
