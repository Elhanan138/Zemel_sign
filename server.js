require('dotenv').config();
const express = require('express');
const path = require('path');

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

// DB state
let dbReady = false;
let dbInitPromise = null;

function ensureDb() {
  if (dbReady) return Promise.resolve();
  if (!dbInitPromise) {
    dbInitPromise = initDb()
      .then(() => { dbReady = true; })
      .catch(err => {
        dbInitPromise = null;
        throw err;
      });
  }
  return dbInitPromise;
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Lazy DB init on first API request
app.use('/api', async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    console.error('DB connection failed:', err.message);
    res.status(503).json({
      error: 'Database not configured. Please set DATABASE_URL environment variable.',
      hint: 'Add a Neon Postgres database in your Vercel project Storage tab.'
    });
  }
});

// Health check (no DB required)
app.get('/api/health', (req, res) => res.json({ ok: true, dbReady }));

// Redirect to setup if DB not available on page load
app.get('/', async (req, res, next) => {
  try {
    await ensureDb();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } catch {
    res.sendFile(path.join(__dirname, 'public', 'setup.html'));
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents', signerRoutes);
app.use('/api/documents', fieldRoutes);
app.use('/api/sign', signatureRoutes);
app.use('/api/documents', auditRoutes);

// HTML pages (index handled above with DB check)
const pages = ['upload', 'place-fields', 'sign', 'audit', 'login', 'register', 'setup'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

app.use(errorHandler);

// Start server when run directly
if (require.main === module) {
  ensureDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`\n✍  Zemel Sign running at http://localhost:${PORT}\n`);
      });
    })
    .catch(err => {
      console.error('Failed to start:', err.message);
      process.exit(1);
    });
}

// Vercel serverless export
module.exports = app;
