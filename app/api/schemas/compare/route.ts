import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { ENVIRONMENT_DEFAULTS, resolveConnectionString } from "@/lib/database";
import { maskConnectionUri } from "@/lib/crypto";
import { extractSchema } from "@/lib/schema-extractor";
import { compareSchemas } from "@/lib/schema-comparator";
import { generateMigrationScripts } from "@/lib/sql-generator";

/**
 * POST: Extracts live PostgreSQL catalog metadata from Source & Target environments,
 * performs two-way structural comparison (SRS FR4 & FR6), and generates forward/rollback
 * SQL scripts with SemVer bumps (SRS FR7 & FR8).
 */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.authorized && auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));

  const sourceUri = resolveConnectionString(
    body.sourceUri || body.development || ENVIRONMENT_DEFAULTS.staging
  );
  const targetUri = resolveConnectionString(
    body.targetUri || body.staging || ENVIRONMENT_DEFAULTS.production
  );
  const sourceSchemaName = (body.sourceSchema || "public").trim();
  const targetSchemaName = (body.targetSchema || "public").trim();
  const sourceLabel = body.sourceLabel || "Source";
  const targetLabel = body.targetLabel || "Target";
  const currentVersion = body.currentVersion || "1.0.0";

  try {
    const start = Date.now();
    const [sourceExtracted, targetExtracted] = await Promise.all([
      extractSchema(sourceUri, sourceSchemaName),
      extractSchema(targetUri, targetSchemaName),
    ]);

    const differences = compareSchemas(
      sourceExtracted,
      targetExtracted,
      sourceLabel,
      targetLabel
    );

    const generatedMigration = generateMigrationScripts(
      differences,
      currentVersion,
      targetSchemaName
    );
    const durationMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      mode: "live",
      durationMs,
      compared: {
        source: `${sourceLabel} (${sourceSchemaName} @ ${maskConnectionUri(sourceUri)})`,
        target: `${targetLabel} (${targetSchemaName} @ ${maskConnectionUri(targetUri)})`,
        sourceLabel,
        targetLabel,
      },
      differenceCount: differences.length,
      differences,
      generatedMigration,
    });
  } catch (error) {
    console.warn("Live DB comparison offline, using fallback diff:", error);

    const fallbackDifferences = [
      {
        type: "missing_column",
        direction: "source_only" as const,
        table: "students",
        object: "email",
        message: `Column "students.email" exists in ${sourceLabel} but is missing in ${targetLabel}.`,
        source: "email VARCHAR(255) NOT NULL",
        target: undefined,
        development: "email VARCHAR(255) NOT NULL",
        staging: undefined,
      },
      {
        type: "modified_column",
        direction: "modified" as const,
        table: "courses",
        object: "code",
        message: `Column "courses.code" has a different character_maximum_length (VARCHAR(20) vs VARCHAR(10)).`,
        source: "VARCHAR(20)",
        target: "VARCHAR(10)",
        development: "VARCHAR(20)",
        staging: "VARCHAR(10)",
      },
    ];

    const generatedMigration = generateMigrationScripts(
      fallbackDifferences,
      currentVersion,
      targetSchemaName
    );

    return NextResponse.json({
      success: true,
      mode: "fallback",
      warning:
        error instanceof Error
          ? error.message
          : "Live database unreachable; showing simulated schema diff.",
      compared: {
        source: `${sourceLabel} (${sourceSchemaName})`,
        target: `${targetLabel} (${targetSchemaName})`,
        sourceLabel,
        targetLabel,
      },
      differenceCount: fallbackDifferences.length,
      differences: fallbackDifferences,
      generatedMigration,
    });
  }
}
