import { getPool, ENVIRONMENT_DEFAULTS } from "./database";

export const DEFAULT_DB_URL = ENVIRONMENT_DEFAULTS.development;

/**
 * Initializes and safely migrates internal control-plane tables (SDD Section 4.1-4.3 & SRS FR2, FR9, FR15):
 * - users
 * - database_connections (stores AES-256-GCM encrypted connection URIs)
 * - schema_migrations (stores versioned forward/rollback DDL, changelog notes, and GitHub push status)
 * - query_history (stores captured query execution metrics)
 */
export async function initSystemTables(
  connectionString: string = DEFAULT_DB_URL
): Promise<void> {
  const pool = getPool(connectionString);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Users table (SDD Section 4.2)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        display_name VARCHAR(100),
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Registered Database Connections with encrypted URIs (SDD Section 4.2-4.3)
    await client.query(`
      CREATE TABLE IF NOT EXISTS database_connections (
        connection_id SERIAL PRIMARY KEY,
        user_email VARCHAR(255),
        environment_name VARCHAR(50) NOT NULL CHECK (environment_name IN ('Development', 'Staging', 'Production')),
        connection_uri TEXT NOT NULL,
        schema_name VARCHAR(100) DEFAULT 'public',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_email, environment_name)
      );
    `);

    // 3. Versioned Schema Migrations (SDD Section 4.2 & SRS FR7-FR10)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        change_type VARCHAR(20) DEFAULT 'Minor',
        filename VARCHAR(255) NOT NULL,
        sql_content TEXT NOT NULL,
        rollback_sql TEXT NOT NULL DEFAULT '',
        user_notes TEXT,
        status VARCHAR(20) DEFAULT 'APPROVED',
        github_status VARCHAR(30) DEFAULT 'LOCAL_ONLY',
        github_url TEXT,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Non-destructive column upgrades for existing installations
    await client.query(`
      ALTER TABLE schema_migrations
        ADD COLUMN IF NOT EXISTS change_type VARCHAR(20) DEFAULT 'Minor',
        ADD COLUMN IF NOT EXISTS rollback_sql TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS github_status VARCHAR(30) DEFAULT 'LOCAL_ONLY',
        ADD COLUMN IF NOT EXISTS github_url TEXT;
    `);

    // 4. Historical Query Performance Monitoring (SRS FR15)
    await client.query(`
      CREATE TABLE IF NOT EXISTS query_history (
        id SERIAL PRIMARY KEY,
        environment VARCHAR(50) DEFAULT 'Staging',
        query TEXT NOT NULL,
        exec_time_ms NUMERIC(10, 3) DEFAULT 0,
        rows_returned INT DEFAULT 0,
        performance_score INT DEFAULT 100,
        anti_pattern_count INT DEFAULT 0,
        capture_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to initialize system tables:", error);
    throw error;
  } finally {
    client.release();
  }
}
