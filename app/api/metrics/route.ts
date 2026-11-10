import { NextResponse } from "next/server";
import { getPool } from "@/lib/database";

export async function POST(request: Request) {
  try {
    const { connectionString } = await request.json();

    if (!connectionString) {
      return NextResponse.json({ error: "Missing connectionString" }, { status: 400 });
    }

    const pool = getPool(connectionString);

    // 1. Fetch long-running queries (> 2 seconds)
    const longRunningQueries = await pool.query(`
      SELECT pid, now() - query_start AS duration, query, state
      FROM pg_stat_activity
      WHERE state != 'idle' AND (now() - query_start) > interval '2 seconds'
      ORDER BY duration DESC;
    `);

    // 2. Fetch unused indexes
    const unusedIndexes = await pool.query(`
      SELECT relname AS table_name, indexrelname AS index_name, idx_scan
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0;
    `);

    // 3. Fetch table health (dead tuples)
    const tableHealth = await pool.query(`
      SELECT relname AS table_name, n_live_tup, n_dead_tup
      FROM pg_stat_user_tables;
    `);

    return NextResponse.json({
      longRunningQueries: longRunningQueries.rows,
      unusedIndexes: unusedIndexes.rows,
      tableHealth: tableHealth.rows,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}