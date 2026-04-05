/**
 * Vercel build-time DB initializer.
 * Runs during `vercel build`. If DATABASE_URL is set, creates all tables.
 * If not set, exits gracefully (tables will be created on first request via server.js).
 */

require('dotenv').config();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[vercel-db-init] No DATABASE_URL found — skipping build-time init.');
    console.log('[vercel-db-init] Tables will be created automatically on first request.');
    return;
  }

  console.log('[vercel-db-init] DATABASE_URL found. Initializing schema...');
  try {
    const { initDb } = require('../src/db/database');
    await initDb();
    console.log('[vercel-db-init] Schema ready.');
  } catch (err) {
    console.error('[vercel-db-init] Warning:', err.message);
    // Don't fail the build — schema will be created at runtime
  }
  process.exit(0);
}

main();
