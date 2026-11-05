
import { Pool } from "pg";
import { createDatabasePool } from "@/lib/database";
import { extractSchema } from "@/lib/schema-extractor";
import {
    compareSchemas,
    type ExtractedSchema,
} from "@/lib/schema-comparator";

// Defines the database environments supported by the comparison API.
type Environment = "development" | "staging" | "production";

// Checks whether a value matches one of the supported environments.
function isEnvironment(value: unknown): value is Environment {
    return (
        value === "development" ||
        value === "staging" ||
        value === "production"
    );
}

// Helper to resolve either a URI string or environment name to a Pool instance.
function getPool(input: string) {
    // Create a connection pool when a PostgreSQL connection URI is provided.
    if (input.startsWith("postgres://") || input.startsWith("postgresql://")) {
        return new Pool({
            connectionString: input,
            connectionTimeoutMillis: 5000,
            ssl: false,
        });
    }

    // Use the existing database connection manager for named environments.
    if (isEnvironment(input)) {
        return createDatabasePool(input);
    }

    // Reject connection targets that are not valid URIs or environment names.
    throw new Error(`Invalid connection target: ${input}`);
}

// Handles requests to compare two database schemas.
export async function POST(request: Request) {
    let sourcePool: Pool | undefined;
    let targetPool: Pool | undefined;

    try {
        // Read the source and target database information from the request.
        const body = await request.json();

        // Extract connection targets from either sourceUri/targetUri OR development/staging.
        const sourceTarget = body.sourceUri || body.development;
        const targetTarget = body.targetUri || body.staging;

        // Ensure both database connection targets have been provided.
        if (!sourceTarget || !targetTarget) {
            return Response.json(
                {
                    success: false,
                    message: "Please provide valid database URIs or environments.",
                },
                { status: 400 }
            );
        }

        // Initialize connection pools for both databases.
        sourcePool = getPool(sourceTarget);
        targetPool = getPool(targetTarget);

        // Extract the schema information from both databases.
        const sourceSchema: ExtractedSchema = await extractSchema(sourcePool);
        const targetSchema: ExtractedSchema = await extractSchema(targetPool);

        // Compare both extracted schemas and collect their differences.
        const differences = compareSchemas(sourceSchema, targetSchema);

        // Return the comparison results in the format expected by the frontend.
        return Response.json({
            success: true,
            compared: {
                source: sourceTarget,
                target: targetTarget,
            },
            differenceCount: differences.length,
            differences,
            // Placeholder version and migration information for the frontend UI.
            semver: differences.length > 0 ? "v1.1.0" : "v1.0.0",
            changes: differences,
            sqlUp: `-- Migration Script\n-- Diffs detected: ${differences.length}`,
            sqlDown: `-- Rollback Script`,
        });
    } catch (error: any) {
        // Log the error for debugging if schema comparison fails.
        console.error("Schema comparison failed:", error);

        return Response.json(
            {
                success: false,
                message: "Could not compare the database schemas.",
                details: error.message,
            },
            { status: 500 }
        );
    } finally {
        // Close both database connection pools after comparison is completed.
        if (sourcePool) {
            await sourcePool.end();
        }
        if (targetPool) {
            await targetPool.end();
        }
    }
}