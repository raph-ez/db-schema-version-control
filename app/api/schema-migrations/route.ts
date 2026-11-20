import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireApiSession } from "@/lib/auth";
import { getPool, ENVIRONMENT_DEFAULTS, resolveConnectionString } from "@/lib/database";
import { initSystemTables } from "@/lib/db";
import { pushMigrationToGitHub, isGitHubConfigured } from "@/lib/github";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

function ensureMigrationsDir() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }
}

function computeNextSemVer(
  latestVersion: string | null,
  versionType: "MAJOR" | "MINOR" | "PATCH"
): string {
  if (!latestVersion) {
    if (versionType === "MAJOR") return "v1.0.0";
    if (versionType === "MINOR") return "v0.1.0";
    return "v0.0.1";
  }

  const semverMatch = latestVersion.replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (semverMatch) {
    const major = Number(semverMatch[1]);
    const minor = Number(semverMatch[2]);
    const patch = Number(semverMatch[3]);
    if (versionType === "MAJOR") return `v${major + 1}.0.0`;
    if (versionType === "MINOR") return `v${major}.${minor + 1}.0`;
    return `v${major}.${minor}.${patch + 1}`;
  }

  const legacyVMatch = latestVersion.match(/^V(\d+)$/i);
  const nextNum = legacyVMatch ? Number(legacyVMatch[1]) + 1 : 1;
  return `v${nextNum}.0.0`;
}

/**
 * GET: Retrieves approved versioned migration scripts and governance history (SRS FR9).
 */
export async function GET(req: Request) {
  const auth = await requireApiSession();
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const dbUrl = resolveConnectionString(
      searchParams.get("connectionString") || ENVIRONMENT_DEFAULTS.development
    );

    await initSystemTables(dbUrl);
    const pool = getPool(dbUrl);

    const migrationsRes = await pool.query(
      "SELECT * FROM schema_migrations ORDER BY id DESC;"
    );

    return NextResponse.json({
      success: true,
      githubConfigured: isGitHubConfigured(),
      migrations: migrationsRes.rows,
    });
  } catch (error) {
    // Graceful local filesystem fallback if PostgreSQL metadata DB is offline
    ensureMigrationsDir();
    const localFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".rollback.sql"))
      .sort()
      .reverse()
      .map((filename, idx) => ({
        id: idx + 1,
        version: filename.split("__")[0] || `v1.0.${idx}`,
        change_type: "Minor",
        filename,
        sql_content: fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8"),
        rollback_sql: fs.existsSync(
          path.join(MIGRATIONS_DIR, filename.replace(/\.sql$/i, ".rollback.sql"))
        )
          ? fs.readFileSync(
              path.join(MIGRATIONS_DIR, filename.replace(/\.sql$/i, ".rollback.sql")),
              "utf8"
            )
          : "",
        user_notes: "Loaded from local /migrations directory",
        status: "APPROVED",
        github_status: "LOCAL_ONLY",
        github_url: null,
        created_by: "Local Developer",
        created_at: new Date().toISOString(),
      }));

    return NextResponse.json({
      success: true,
      mode: "filesystem_fallback",
      githubConfigured: isGitHubConfigured(),
      migrations: localFiles,
      warning:
        error instanceof Error
          ? error.message
          : "Metadata database offline; reading local migration files.",
    });
  }
}

/**
 * POST: Saves an explicitly user-reviewed & approved SQL migration + rollback script,
 * writes versioned .sql files locally, and pushes to GitHub REST API (SRS FR7, FR8, FR9, FR10).
 * Enforces Zero Auto-Execution: never executes DDL on live target databases.
 */
export async function POST(req: Request) {
  const auth = await requireApiSession();
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await req.json();
    const sqlContent: string = body.sqlContent || "";
    const rollbackSql: string = body.rollbackSql || "";
    const versionType: "MAJOR" | "MINOR" | "PATCH" =
      body.versionType === "MAJOR" || body.versionType === "PATCH"
        ? body.versionType
        : "MINOR";
    const userNotes: string = (body.userNotes || "").trim();
    const author: string = (body.author || auth.user.name || "Developer").trim();
    const dbUrl = resolveConnectionString(
      body.connectionString || ENVIRONMENT_DEFAULTS.development
    );

    if (!sqlContent.trim()) {
      return NextResponse.json(
        { success: false, error: "SQL script content cannot be empty." },
        { status: 400 }
      );
    }

    ensureMigrationsDir();

    let latestVersion: string | null = null;
    let dbAvailable = true;

    try {
      await initSystemTables(dbUrl);
      const pool = getPool(dbUrl);
      const latestRes = await pool.query(
        "SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1;"
      );
      latestVersion = latestRes.rows[0]?.version || null;
    } catch {
      dbAvailable = false;
      const existing = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql") && !f.endsWith(".rollback.sql"))
        .sort();
      if (existing.length > 0) {
        latestVersion = existing[existing.length - 1].split("__")[0];
      }
    }

    const nextVersion = body.explicitVersion
      ? String(body.explicitVersion).startsWith("v")
        ? String(body.explicitVersion)
        : `v${body.explicitVersion}`
      : computeNextSemVer(latestVersion, versionType);

    const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
    const filename = `${nextVersion}__${timestamp}.sql`;
    const rollbackFilename = `${nextVersion}__${timestamp}.rollback.sql`;

    // 1. Write physical versioned SQL files locally (SRS FR9)
    fs.writeFileSync(path.join(MIGRATIONS_DIR, filename), sqlContent, "utf8");
    if (rollbackSql.trim()) {
      fs.writeFileSync(
        path.join(MIGRATIONS_DIR, rollbackFilename),
        rollbackSql,
        "utf8"
      );
    }

    // 2. Push approved migration & rollback files to GitHub repository (SRS FR10)
    const githubResult = await pushMigrationToGitHub({
      filename,
      sqlContent,
      rollbackSql,
      version: nextVersion,
      changeType:
        versionType === "MAJOR"
          ? "Major"
          : versionType === "PATCH"
            ? "Patch"
            : "Minor",
      userNotes: userNotes || "Approved schema migration",
      author,
    });

    // 3. Persist metadata record in PostgreSQL if online
    let savedRecord = {
      id: Date.now(),
      version: nextVersion,
      change_type:
        versionType === "MAJOR"
          ? "Major"
          : versionType === "PATCH"
            ? "Patch"
            : "Minor",
      filename,
      sql_content: sqlContent,
      rollback_sql: rollbackSql,
      user_notes: userNotes || "No changelog notes provided",
      status: "APPROVED",
      github_status: githubResult.status,
      github_url: githubResult.commitUrl || null,
      created_by: author,
      created_at: new Date().toISOString(),
    };

    if (dbAvailable) {
      const pool = getPool(dbUrl);
      const insertRes = await pool.query(
        `INSERT INTO schema_migrations
          (version, change_type, filename, sql_content, rollback_sql, user_notes, status, github_status, github_url, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'APPROVED', $7, $8, $9)
         RETURNING *;`,
        [
          nextVersion,
          savedRecord.change_type,
          filename,
          sqlContent,
          rollbackSql,
          savedRecord.user_notes,
          githubResult.status,
          githubResult.commitUrl || null,
          author,
        ]
      );
      savedRecord = insertRes.rows[0];
    }

    return NextResponse.json({
      success: true,
      message: `Approved migration ${nextVersion} saved (${filename}). ${githubResult.message}`,
      github: githubResult,
      migration: savedRecord,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save approved migration.",
      },
      { status: 500 }
    );
  }
}
