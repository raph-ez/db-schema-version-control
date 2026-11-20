import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  ENVIRONMENT_DEFAULTS,
  resolveConnectionString,
  testConnection,
  getPool,
} from "@/lib/database";
import { encryptConnectionUri, maskConnectionUri } from "@/lib/crypto";
import { initSystemTables } from "@/lib/db";
import { extractSchema } from "@/lib/schema-extractor";

/**
 * GET: Lists saved environment connections with masked URIs (SDD Section 4.3 & 5.3).
 */
export async function GET() {
  const auth = await requireApiSession();
  if (!auth.authorized && auth.response) return auth.response;

  try {
    await initSystemTables(ENVIRONMENT_DEFAULTS.development);
    const pool = getPool(ENVIRONMENT_DEFAULTS.development);
    const res = await pool.query(
      `SELECT connection_id, environment_name, connection_uri, schema_name, updated_at
       FROM database_connections
       ORDER BY connection_id ASC;`
    );

    const connections = res.rows.map((row) => ({
      connectionId: row.connection_id,
      environmentName: row.environment_name,
      maskedUri: maskConnectionUri(row.connection_uri),
      schemaName: row.schema_name,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({
      success: true,
      defaults: {
        development: maskConnectionUri(ENVIRONMENT_DEFAULTS.development),
        staging: maskConnectionUri(ENVIRONMENT_DEFAULTS.staging),
        production: maskConnectionUri(ENVIRONMENT_DEFAULTS.production),
      },
      connections,
    });
  } catch (error) {
    return NextResponse.json({
      success: true,
      defaults: {
        development: maskConnectionUri(ENVIRONMENT_DEFAULTS.development),
        staging: maskConnectionUri(ENVIRONMENT_DEFAULTS.staging),
        production: maskConnectionUri(ENVIRONMENT_DEFAULTS.production),
      },
      connections: [],
      warning:
        error instanceof Error
          ? error.message
          : "Metadata database offline; showing default environment endpoints.",
    });
  }
}

/**
 * POST: Tests live PostgreSQL connectivity, optionally extracts schema counts,
 * and optionally saves AES-256-GCM encrypted connection strings (SRS FR2).
 */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const rawTarget: string =
      body.connectionUri || body.connectionString || body.environment || "development";
    const environmentName: "Development" | "Staging" | "Production" =
      body.environmentName === "Production" ||
      String(body.environment).toLowerCase().startsWith("prod")
        ? "Production"
        : body.environmentName === "Staging" ||
            String(body.environment).toLowerCase() === "staging"
          ? "Staging"
          : "Development";
    const schemaName: string = body.schemaName || "public";
    const includeSchemaSummary = Boolean(body.includeSchema);
    const saveConnection = Boolean(body.save);

    const resolvedUri = resolveConnectionString(rawTarget);
    const status = await testConnection(resolvedUri);

    if (!status.connected) {
      return NextResponse.json(
        {
          success: false,
          environment: environmentName,
          maskedUri: maskConnectionUri(resolvedUri),
          latencyMs: status.latencyMs,
          message: status.error || "Unable to connect to PostgreSQL instance.",
        },
        { status: 503 }
      );
    }

    let schemaSummary:
      | {
          schemaName: string;
          tableCount: number;
          columnCount: number;
          constraintCount: number;
          indexCount: number;
          tables: string[];
        }
      | undefined;

    if (includeSchemaSummary) {
      const extracted = await extractSchema(resolvedUri, schemaName);
      schemaSummary = {
        schemaName: extracted.schemaName,
        tableCount: extracted.tables.length,
        columnCount: extracted.columns.length,
        constraintCount: extracted.constraints.length,
        indexCount: extracted.indexes.length,
        tables: extracted.tables.map((t) => t.table_name),
      };
    }

    if (saveConnection) {
      try {
        await initSystemTables(ENVIRONMENT_DEFAULTS.development);
        const metaPool = getPool(ENVIRONMENT_DEFAULTS.development);
        const encrypted = encryptConnectionUri(resolvedUri);
        await metaPool.query(
          `INSERT INTO database_connections (user_email, environment_name, connection_uri, schema_name, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (user_email, environment_name)
           DO UPDATE SET connection_uri = EXCLUDED.connection_uri,
                         schema_name = EXCLUDED.schema_name,
                         updated_at = CURRENT_TIMESTAMP;`,
          [auth.user.email, environmentName, encrypted, schemaName]
        );
      } catch (saveErr) {
        console.warn("Could not persist encrypted connection URI:", saveErr);
      }
    }

    return NextResponse.json({
      success: true,
      environment: environmentName,
      maskedUri: maskConnectionUri(resolvedUri),
      latencyMs: status.latencyMs,
      serverVersion: status.serverVersion,
      database: status.database,
      schemaSummary,
      message: `${environmentName} (${status.database}) connected in ${status.latencyMs}ms.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Connection verification failed.",
      },
      { status: 400 }
    );
  }
}
