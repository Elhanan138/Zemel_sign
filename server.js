require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const { initDb } = require('./src/db/database');
const authRoutes = require('./src/routes/auth');
const documentRoutes = require('./src/routes/documents');
const signerRoutes = require('./src/routes/signers');
const fieldRoutes = require('./src/routes/fields');
const signatureRoutes = require('./src/routes/signatures');
const auditRoutes = require('./src/routes/audit');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure required directories exist
['uploads', 'processed', 'data'].forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// Init database
initDb();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents', signerRoutes);
app.use('/api/documents', fieldRoutes);
app.use('/api/sign', signatureRoutes);
app.use('/api/documents', auditRoutes);

// Serve HTML pages
const pages = ['index', 'upload', 'place-fields', 'sign', 'audit', 'login', 'register'];
pages.forEach(page => {
  app.get(`/${page === 'index' ? '' : page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🖊️  Zemel Sign running at http://localhost:${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}/`);
  console.log(`   Press Ctrl+C to stop\n`);
});
