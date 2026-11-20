import { getPool } from "./database";

export interface SchemaVersionResult {
  environment: string;
  schemaName: string;
  hasVersionTable: boolean;
  version: string | null;
}

function validateIdentifier(name: string): string {
  const trimmed = (name || "public").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new Error(`Invalid schema identifier: "${name}"`);
  }
  return trimmed;
}

/**
 * Checks whether <schemaName>.schema_version exists and retrieves the latest SemVer string (SRS FR5).
 */
export async function detectSchemaVersion(
  connectionString: string,
  environment: string,
  schemaName: string = "public"
): Promise<SchemaVersionResult> {
  const pool = getPool(connectionString);
  const safeSchema = validateIdentifier(schemaName);

  const tableResult = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = 'schema_version'
    ) AS table_exists;
    `,
    [safeSchema]
  );

  const hasVersionTable = Boolean(tableResult.rows[0]?.table_exists);

  if (!hasVersionTable) {
    return {
      environment,
      schemaName: safeSchema,
      hasVersionTable: false,
      version: null,
    };
  }

  const versionResult = await pool.query(
    `
    SELECT version
    FROM "${safeSchema}"."schema_version"
    ORDER BY id DESC
    LIMIT 1;
    `
  );

  if (versionResult.rows.length === 0) {
    return {
      environment,
      schemaName: safeSchema,
      hasVersionTable: true,
      version: null,
    };
  }

  return {
    environment,
    schemaName: safeSchema,
    hasVersionTable: true,
    version: versionResult.rows[0].version,
  };
}
