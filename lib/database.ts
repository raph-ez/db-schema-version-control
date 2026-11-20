import { Pool } from "pg";
import { decryptConnectionUri, validatePostgresUri } from "./crypto";

export type EnvironmentKey = "development" | "staging" | "production";

export const ENVIRONMENT_DEFAULTS: Record<EnvironmentKey, string> = {
  development:
    process.env.DEV_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://root:password@127.0.0.1:5432/dev_schema",
  staging:
    process.env.STAGING_DATABASE_URL ||
    "postgresql://root:password@127.0.0.1:5433/staging_schema",
  production:
    process.env.PROD_DATABASE_URL ||
    "postgresql://root:password@127.0.0.1:5434/prod_schema",
};

const pools = new Map<string, Pool>();

/**
 * Resolves either an environment alias ("dev", "staging", "prod"), an encrypted URI,
 * or a raw PostgreSQL URI into a usable connection string.
 */
export function resolveConnectionString(input?: string): string {
  if (!input || !input.trim()) {
    return ENVIRONMENT_DEFAULTS.development;
  }

  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized === "dev" || normalized === "development") {
    return ENVIRONMENT_DEFAULTS.development;
  }
  if (normalized === "staging") {
    return ENVIRONMENT_DEFAULTS.staging;
  }
  if (normalized === "prod" || normalized === "production") {
    return ENVIRONMENT_DEFAULTS.production;
  }

  return decryptConnectionUri(trimmed);
}

/**
 * Returns a cached PostgreSQL connection pool for the given URI or environment alias.
 */
export function getPool(connectionStringOrEnv: string): Pool {
  const resolvedUri = resolveConnectionString(connectionStringOrEnv);
  const validation = validatePostgresUri(resolvedUri);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid PostgreSQL connection URI.");
  }

  let pool = pools.get(resolvedUri);
  if (!pool) {
    pool = new Pool({
      connectionString: resolvedUri,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 4000,
    });

    pool.on("error", (err) => {
      console.error("Unexpected idle PostgreSQL client error:", err.message);
      pools.delete(resolvedUri);
    });

    pools.set(resolvedUri, pool);
  }

  return pool;
}

// Backward-compatible alias
export const createDatabasePool = getPool;

export interface ConnectionTestResult {
  connected: boolean;
  latencyMs: number;
  serverVersion?: string;
  database?: string;
  error?: string;
}

/**
 * Verifies live TCP/IP connectivity and catalog accessibility on a PostgreSQL instance.
 */
export async function testConnection(
  connectionStringOrEnv: string
): Promise<ConnectionTestResult> {
  const start = Date.now();
  try {
    const pool = getPool(connectionStringOrEnv);
    const client = await pool.connect();
    try {
      const res = await client.query(
        "SELECT version() AS version, current_database() AS database;"
      );
      const latencyMs = Date.now() - start;
      const fullVersion: string = res.rows[0]?.version || "PostgreSQL";
      const shortVersion = fullVersion.split(",")[0];
      return {
        connected: true,
        latencyMs,
        serverVersion: shortVersion,
        database: res.rows[0]?.database,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      connected: false,
      latencyMs,
      error: error instanceof Error ? error.message : "Database connection failed.",
    };
  }
}
