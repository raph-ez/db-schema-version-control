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

export function createDatabasePool(
    environment: DatabaseEnvironment
): Pool
{
    const connectionString = databaseUrls[environment];

    if (!connectionString)
    {
        throw new Error(
            `Database connection is not configured for ${environment}.`
        );
    }

    return new Pool({
        connectionString,
        connectionTimeoutMillis: 5000,
        max: 5,
    });
}