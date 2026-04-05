const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/zemel_sign.db');
let db;

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      language      TEXT NOT NULL DEFAULT 'en',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL REFERENCES users(id),
      title        TEXT NOT NULL,
      filename     TEXT NOT NULL,
      stored_name  TEXT NOT NULL,
      file_type    TEXT NOT NULL DEFAULT 'pdf',
      status       TEXT NOT NULL DEFAULT 'draft',
      page_count   INTEGER,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS signers (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id        INTEGER REFERENCES users(id),
      name           TEXT NOT NULL,
      email          TEXT NOT NULL,
      signing_order  INTEGER NOT NULL DEFAULT 1,
      signing_token  TEXT UNIQUE,
      token_used_at  TEXT,
      signed_at      TEXT,
      status         TEXT NOT NULL DEFAULT 'pending',
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS signature_fields (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      signer_id      INTEGER NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
      page_number    INTEGER NOT NULL,
      x_percent      REAL NOT NULL,
      y_percent      REAL NOT NULL,
      width_percent  REAL NOT NULL,
      height_percent REAL NOT NULL,
      field_type     TEXT NOT NULL DEFAULT 'signature',
      label          TEXT,
      is_required    INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS signatures (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      field_id       INTEGER NOT NULL REFERENCES signature_fields(id),
      signer_id      INTEGER NOT NULL REFERENCES signers(id),
      document_id    INTEGER NOT NULL REFERENCES documents(id),
      signature_type TEXT NOT NULL,
      image_data     TEXT NOT NULL,
      ip_address     TEXT,
      user_agent     TEXT,
      signed_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      actor_type   TEXT NOT NULL,
      actor_id     INTEGER,
      actor_name   TEXT,
      event_type   TEXT NOT NULL,
      event_detail TEXT,
      ip_address   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_documents_owner    ON documents(owner_id);
    CREATE INDEX IF NOT EXISTS idx_signers_document   ON signers(document_id);
    CREATE INDEX IF NOT EXISTS idx_signers_token      ON signers(signing_token);
    CREATE INDEX IF NOT EXISTS idx_fields_document    ON signature_fields(document_id);
    CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures(document_id);
    CREATE INDEX IF NOT EXISTS idx_audit_document     ON audit_events(document_id);
  `);
}

module.exports = { initDb, getDb };
