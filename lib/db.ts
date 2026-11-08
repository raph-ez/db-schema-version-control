import { getPool } from './database';

// Default database connection string from environment or localhost fallback
export const DEFAULT_DB_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

/**
 * Initialize system tables for schema migration tracking and audit logging
 */
export async function initSystemTables(connectionString: string = DEFAULT_DB_URL) {
  const pool = getPool(connectionString);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Table for versioned schema migrations (Req 2 & 3)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        filename VARCHAR(255) NOT NULL,
        sql_content TEXT NOT NULL,
        user_notes TEXT,
        status VARCHAR(20) DEFAULT 'APPROVED',
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Table for execution history auditing (Req 4)
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        migration_id INT REFERENCES schema_migrations(id) ON DELETE CASCADE,
        version VARCHAR(50) NOT NULL,
        executed_by VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        execution_time_ms INT,
        error_message TEXT,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('COMMIT');
    console.log('✅ System tables initialized successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to initialize system tables:', error);
    throw error;
  } finally {
    client.release();
  }
}