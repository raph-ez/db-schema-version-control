
import { NextResponse } from "next/server";
import { getPool } from "@/lib/database";
import { detectSchemaVersion } from "@/lib/schema-version-detector";
import { compareSchemaVersions } from "@/lib/schema-version-comparator";
import { extractSchema } from "@/lib/schema-extractor";
import { compareSchemas } from "@/lib/schema-comparator";

// Handles requests to detect and compare schema versions across environments.
export async function POST()
{
    try
    {
        // Retrieve the database connection strings from environment variables.
        const developmentUrl = process.env.DATABASE_URL;
        const stagingUrl = process.env.STAGING_DATABASE_URL;

        // Ensure both database connection strings are configured.
        if (!developmentUrl || !stagingUrl)
        {
            return NextResponse.json(
                {
                    success: false,
                    message: "Database connection strings are missing."
                },
                { status: 500 }
            );
        }

        // Detect the current schema version in Development.
        const development = await detectSchemaVersion(
            developmentUrl,
            "Development"
        );

        // Detect the current schema version in Staging.
        const staging = await detectSchemaVersion(
            stagingUrl,
            "Staging"
        );

        // Compare the retrieved versions using Semantic Versioning.
        const comparison = compareSchemaVersions(
            development.version,
            staging.version
        );

        // Run structural comparison if version information is missing.
        if (comparison.status === "structural_comparison_required")
        {
            // Create database connection pools for structural comparison.
            const developmentPool = getPool(developmentUrl);
            const stagingPool = getPool(stagingUrl);

            // Extract the actual database schemas from both environments.
            const developmentSchema = await extractSchema(developmentPool);
            const stagingSchema = await extractSchema(stagingPool);

            // Compare the extracted schemas to identify structural differences.
            const differences = compareSchemas(
                developmentSchema,
                stagingSchema
            );

            // Return the version information and structural comparison results.
            return NextResponse.json({
                success: true,
                development,
                staging,
                comparison,
                structuralComparison: {
                    performed: true,
                    differenceCount: differences.length,
                    differences
                }
            });
        }

        // Return version comparison results when both environments have valid versions.
        return NextResponse.json({
            success: true,
            development,
            staging,
            comparison,
            structuralComparison: {
                performed: false,
                message: "Both environments have version information."
            }
        });
    }
    catch (error)
    {
        // Log the error for debugging if version detection or comparison fails.
        console.error("Schema version comparison error:", error);

        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error
                    ? error.message
                    : "Failed to compare schema versions."
            },
            { status: 500 }
        );
    }
}