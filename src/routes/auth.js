const express = require('express');
const bcrypt = require('bcrypt');
const { getDb } = require('../db/database');
const { signUserToken } = require('../utils/token');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, name, password, language = 'en' } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'email, name and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!['en', 'he'].includes(language)) {
      return res.status(400).json({ error: 'Invalid language' });
    }
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (email, name, password_hash, language) VALUES (?, ?, ?, ?)'
    ).run(email.toLowerCase(), name, hash, language);

    const user = { id: result.lastInsertRowid, email: email.toLowerCase(), name };
    res.status(201).json({ token: signUserToken(user), user });
  } catch (err) { next(err); }
});

// POST /api/auth/logout  (stateless JWT — client drops the token; endpoint exists for future blocklist support)
router.post('/logout', requireAuth, (req, res) => {
  res.json({ message: 'Logged out' });
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address' });

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { password_hash, ...safeUser } = user;
    res.json({ token: signUserToken(safeUser), user: safeUser });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, name, language, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// PATCH /api/auth/language
router.patch('/language', requireAuth, (req, res) => {
  const { language } = req.body;
  if (!['en', 'he'].includes(language)) return res.status(400).json({ error: 'Invalid language' });
  getDb().prepare('UPDATE users SET language = ? WHERE id = ?').run(language, req.user.id);
  res.json({ language });
});

module.exports = router;
