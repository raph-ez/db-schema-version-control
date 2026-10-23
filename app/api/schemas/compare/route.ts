import { Pool } from "pg";
import { createDatabasePool } from "@/lib/database";
import { extractSchema } from "@/lib/schema-extractor";
import {
    compareSchemas,
    type ExtractedSchema,
} from "@/lib/schema-comparator";

type Environment = "development" | "staging" | "production";

function isEnvironment(value: unknown): value is Environment {
    return (
        value === "development" ||
        value === "staging" ||
        value === "production"
    );
}

// Helper to resolve either a URI string or environment name to a Pool instance
function getPool(input: string) {
    if (input.startsWith("postgres://") || input.startsWith("postgresql://")) {
        return new Pool({
            connectionString: input,
            connectionTimeoutMillis: 5000,
            ssl: false,
        });
    }
    if (isEnvironment(input)) {
        return createDatabasePool(input);
    }
    throw new Error(`Invalid connection target: ${input}`);
}

export async function POST(request: Request) {
    let sourcePool: Pool | undefined;
    let targetPool: Pool | undefined;

    try {
        const body = await request.json();

        // Extract connection targets from either sourceUri/targetUri OR development/staging
        const sourceTarget = body.sourceUri || body.development;
        const targetTarget = body.targetUri || body.staging;

        if (!sourceTarget || !targetTarget) {
            return Response.json(
                {
                    success: false,
                    message: "Please provide valid database URIs or environments.",
                },
                { status: 400 }
            );
        }

        // Initialize connection pools
        sourcePool = getPool(sourceTarget);
        targetPool = getPool(targetTarget);

        // Extract schemas live
        const sourceSchema: ExtractedSchema = await extractSchema(sourcePool);
        const targetSchema: ExtractedSchema = await extractSchema(targetPool);

        // Calculate differences
        const differences = compareSchemas(sourceSchema, targetSchema);

        return Response.json({
            success: true,
            compared: {
                source: sourceTarget,
                target: targetTarget,
            },
            differenceCount: differences.length,
            differences,
            // Format expected by frontend UI
            semver: differences.length > 0 ? "v1.1.0" : "v1.0.0",
            changes: differences,
            sqlUp: `-- Migration Script\n-- Diffs detected: ${differences.length}`,
            sqlDown: `-- Rollback Script`,
        });
    } catch (error: any) {
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
        if (sourcePool) {
            await sourcePool.end();
        }
        if (targetPool) {
            await targetPool.end();
        }
    }
}