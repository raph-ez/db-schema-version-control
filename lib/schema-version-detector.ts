import { getPool } from "./database";

// Defines the information returned when checking a database's schema version.
export interface SchemaVersionResult
{
    environment: string;
    hasVersionTable: boolean;
    version: string | null;
}

// Detects the schema version stored in a database.
export async function detectSchemaVersion(
    connectionString: string,
    environment: string
): Promise<SchemaVersionResult>
{
    // Create or retrieve the database connection pool.
    const pool = getPool(connectionString);

    // Check whether the schema_version table exists.
    const tableResult = await pool.query(
        `
        SELECT EXISTS
        (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'schema_version'
        ) AS table_exists;
        `
    );

    const hasVersionTable = tableResult.rows[0].table_exists;

    // Return if the version table does not exist.
    if (!hasVersionTable)
    {
        return {
            environment,
            hasVersionTable: false,
            version: null
        };
    }

    // Retrieve the latest version number from the version table.
    const versionResult = await pool.query(
        `
        SELECT version
        FROM public.schema_version
        ORDER BY id DESC
        LIMIT 1;
        `
    );

    // Return if the table exists but contains no records.
    if (versionResult.rows.length === 0)
    {
        return {
            environment,
            hasVersionTable: true,
            version: null
        };
    }

    // Return the detected version together with the environment name.
    return {
        environment,
        hasVersionTable: true,
        version: versionResult.rows[0].version
    };
}