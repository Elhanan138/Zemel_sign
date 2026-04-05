const express = require('express');
const bcrypt = require('bcrypt');
const { getPool } = require('../db/database');
const { signUserToken } = require('../utils/token');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, name, password, language = 'en' } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'email, name and password are required' });
    }
    const pool = getPool();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await pool.query(
      'INSERT INTO users (email, name, password_hash, language) VALUES ($1, $2, $3, $4) RETURNING id, email, name, language',
      [email.toLowerCase(), name, hash, language]
    );
    res.status(201).json({ token: signUserToken(user), user });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { password_hash, ...safeUser } = user;
    res.json({ token: signUserToken(safeUser), user: safeUser });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await getPool().query(
      'SELECT id, email, name, language, created_at FROM users WHERE id = $1', [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/auth/language
router.patch('/language', requireAuth, async (req, res, next) => {
  try {
    const { language } = req.body;
    if (!['en', 'he'].includes(language)) return res.status(400).json({ error: 'Invalid language' });
    await getPool().query('UPDATE users SET language = $1 WHERE id = $2', [language, req.user.id]);
    res.json({ language });
  } catch (err) { next(err); }
});

module.exports = router;
