import { NextResponse } from 'next/server';
import { getPool } from '@/lib/database';
import { initSystemTables, DEFAULT_DB_URL } from '@/lib/db';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');
if (!fs.existsSync(MIGRATIONS_DIR)) {
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
}

// GET: Fetch all saved migration versions and audit history
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionString = searchParams.get('connectionString') || DEFAULT_DB_URL;

    await initSystemTables(connectionString);
    const pool = getPool(connectionString);

    const migrationsRes = await pool.query(
      'SELECT * FROM schema_migrations ORDER BY id DESC'
    );
    const auditLogsRes = await pool.query(
      'SELECT * FROM audit_logs ORDER BY executed_at DESC'
    );

    return NextResponse.json({
      success: true,
      migrations: migrationsRes.rows,
      auditLogs: auditLogsRes.rows,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Save approved script as versioned migration file (Req 1, 2, 3)
export async function POST(req: Request) {
  try {
    const { sqlContent, userNotes, author, connectionString } = await req.json();
    const dbUrl = connectionString || DEFAULT_DB_URL;

    if (!sqlContent || !sqlContent.trim()) {
      return NextResponse.json({ success: false, error: 'SQL script cannot be empty' }, { status: 400 });
    }

    await initSystemTables(dbUrl);
    const pool = getPool(dbUrl);

    // Generate version number (V1, V2...)
    const countRes = await pool.query('SELECT COUNT(*) FROM schema_migrations');
    const nextVersion = `V${parseInt(countRes.rows[0].count) + 1}`;
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const filename = `${nextVersion}__${timestamp}.sql`;

    // Save physical .sql file (Req 2)
    const filePath = path.join(MIGRATIONS_DIR, filename);
    fs.writeFileSync(filePath, sqlContent, 'utf-8');

    // Save record into database (Req 2 & 3)
    const insertRes = await pool.query(
      `INSERT INTO schema_migrations (version, filename, sql_content, user_notes, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nextVersion, filename, sqlContent, userNotes || 'No notes provided', author || 'User']
    );

    return NextResponse.json({
      success: true,
      message: 'Migration file saved successfully',
      migration: insertRes.rows[0],
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}