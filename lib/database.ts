
import { Pool } from "pg";

export type DatabaseEnvironment =
    | "development"
    | "staging"
    | "production";

const databaseUrls: Record<DatabaseEnvironment, string | undefined> = {
    development: process.env.DATABASE_URL,
    staging: process.env.STAGING_DATABASE_URL,
    production: process.env.PRODUCTION_DATABASE_URL,
};

const pools: Record<string, Pool> = {};

export function createDatabasePool(
    environment: DatabaseEnvironment
): Pool {
    const connectionString = databaseUrls[environment];

    if (!connectionString) {
        throw new Error(
            `Database connection is not configured for ${environment}.`
        );
    }

    if (!pools[connectionString]) {
        pools[connectionString] = new Pool({
            connectionString,
            connectionTimeoutMillis: 5000,
            max: 5,
        });
    }

    return pools[connectionString];
}

export async function testConnection(
    connectionString: string
): Promise<boolean> {
    const pool = new Pool({
        connectionString,
        connectionTimeoutMillis: 5000,
        max: 5,
    });

    try {
        const client = await pool.connect();
        client.release();
        return true;
    } catch (error) {
        console.error("Database connection error:", error);
        return false;
    } finally {
        await pool.end();
    }
}
