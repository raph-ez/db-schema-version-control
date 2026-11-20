-- Internal System Metadata Schema (SDD Section 4.1 - 4.3)
-- Automatically executed by lib/db.ts on startup/API calls, or can be run manually.

CREATE TABLE IF NOT EXISTS public.users (
  user_id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(100),
  last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.database_connections (
  connection_id SERIAL PRIMARY KEY,
  user_email VARCHAR(255),
  environment_name VARCHAR(50) NOT NULL CHECK (environment_name IN ('Development', 'Staging', 'Production')),
  connection_uri TEXT NOT NULL,
  schema_name VARCHAR(100) DEFAULT 'public',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_email, environment_name)
);

CREATE TABLE IF NOT EXISTS public.schema_migrations (
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

CREATE TABLE IF NOT EXISTS public.query_history (
  id SERIAL PRIMARY KEY,
  environment VARCHAR(50) DEFAULT 'Staging',
  query TEXT NOT NULL,
  exec_time_ms NUMERIC(10, 3) DEFAULT 0,
  rows_returned INT DEFAULT 0,
  performance_score INT DEFAULT 100,
  anti_pattern_count INT DEFAULT 0,
  capture_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
