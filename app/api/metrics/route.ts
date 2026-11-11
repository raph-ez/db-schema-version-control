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

    // 4. Fetch sequential scans (Suggest indexes for large tables)
    const sequentialScans = await pool.query(`
      SELECT relname AS table_name, seq_scan, seq_tup_read, idx_scan, n_live_tup
      FROM pg_stat_user_tables
      WHERE seq_scan > 0 AND n_live_tup > 1000
      ORDER BY seq_scan DESC;
    `);

    // 5. Fetch historical query monitoring
    // Note: requires pg_stat_statements extension enabled on the database
    const historicalQueries = await pool.query(`
      SELECT query, calls AS execution_count, total_exec_time AS total_time_ms, 
             mean_exec_time AS average_time_ms, rows AS total_rows_returned
      FROM pg_stat_statements
      ORDER BY mean_exec_time DESC
      LIMIT 15;
    `);

    return NextResponse.json({
      longRunningQueries: longRunningQueries.rows,
      unusedIndexes: unusedIndexes.rows,
      tableHealth: tableHealth.rows,
      sequentialScans: sequentialScans.rows,
      historicalQueries: historicalQueries.rows,
    });
  } catch (err: any) {
    console.error("METRICS API ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}