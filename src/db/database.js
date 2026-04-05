const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set. See /setup for instructions.');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    pool.on('error', (err) => {
      console.error('Unexpected DB pool error:', err.message);
      pool = null; // allow retry
    });
  }
  return pool;
}

async function initDb() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      language      TEXT NOT NULL DEFAULT 'en',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documents (
      id           SERIAL PRIMARY KEY,
      owner_id     INTEGER NOT NULL REFERENCES users(id),
      title        TEXT NOT NULL,
      filename     TEXT NOT NULL,
      stored_name  TEXT NOT NULL,
      file_data    BYTEA,
      signed_pdf   BYTEA,
      file_type    TEXT NOT NULL DEFAULT 'pdf',
      status       TEXT NOT NULL DEFAULT 'draft',
      page_count   INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS signers (
      id             SERIAL PRIMARY KEY,
      document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id        INTEGER REFERENCES users(id),
      name           TEXT NOT NULL,
      email          TEXT NOT NULL,
      signing_order  INTEGER NOT NULL DEFAULT 1,
      signing_token  TEXT UNIQUE,
      token_used_at  TIMESTAMPTZ,
      signed_at      TIMESTAMPTZ,
      status         TEXT NOT NULL DEFAULT 'pending',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS signature_fields (
      id             SERIAL PRIMARY KEY,
      document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      signer_id      INTEGER NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
      page_number    INTEGER NOT NULL,
      x_percent      FLOAT NOT NULL,
      y_percent      FLOAT NOT NULL,
      width_percent  FLOAT NOT NULL,
      height_percent FLOAT NOT NULL,
      field_type     TEXT NOT NULL DEFAULT 'signature',
      label          TEXT,
      is_required    BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS signatures (
      id             SERIAL PRIMARY KEY,
      field_id       INTEGER NOT NULL REFERENCES signature_fields(id),
      signer_id      INTEGER NOT NULL REFERENCES signers(id),
      document_id    INTEGER NOT NULL REFERENCES documents(id),
      signature_type TEXT NOT NULL,
      image_data     TEXT NOT NULL,
      ip_address     TEXT,
      user_agent     TEXT,
      signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id           SERIAL PRIMARY KEY,
      document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      actor_type   TEXT NOT NULL,
      actor_id     INTEGER,
      actor_name   TEXT,
      event_type   TEXT NOT NULL,
      event_detail JSONB,
      ip_address   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_documents_owner     ON documents(owner_id);
    CREATE INDEX IF NOT EXISTS idx_signers_document    ON signers(document_id);
    CREATE INDEX IF NOT EXISTS idx_signers_token       ON signers(signing_token);
    CREATE INDEX IF NOT EXISTS idx_fields_document     ON signature_fields(document_id);
    CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures(document_id);
    CREATE INDEX IF NOT EXISTS idx_audit_document      ON audit_events(document_id);
  `);
  console.log('Database schema ready');
}

module.exports = { getPool, initDb };
