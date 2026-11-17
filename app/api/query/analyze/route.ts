import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getPool, ENVIRONMENT_DEFAULTS, resolveConnectionString } from "@/lib/database";
import { initSystemTables } from "@/lib/db";
import {
  detectAntiPatterns,
  validateReadOnlySelectQuery,
  analyzeExplainPlan,
} from "@/lib/query-analyzer";

/**
 * POST: Analyzes SQL anti-patterns (SRS FR12), executes a read-only EXPLAIN (FORMAT JSON)
 * plan against PostgreSQL (SRS FR11), recommends indexes on sequential scans (SRS FR13),
 * and logs historical performance captures (SRS FR15).
 */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const query: string = body.query || "";
    const environment: string = body.environment || "Staging";
    const connectionString = resolveConnectionString(
      body.connectionString || ENVIRONMENT_DEFAULTS.staging
    );

    if (!query.trim()) {
      return NextResponse.json(
        { success: false, error: "SQL query is required." },
        { status: 400 }
      );
    }

    // 1. Static SQL anti-pattern detection (runs on all SQL inputs)
    const antiPatterns = detectAntiPatterns(query);

    // 2. Enforce strict read-only single SELECT guard before EXPLAIN
    const safetyCheck = validateReadOnlySelectQuery(query);
    let explainPlan: unknown = null;
    let mode: "live" | "fallback" | "blocked_non_select" = "live";
    let notice: string | undefined;

    if (!safetyCheck.isReadOnlySelect) {
      mode = "blocked_non_select";
      notice = safetyCheck.reason;
      explainPlan = [
        {
          SafetyNotice: safetyCheck.reason,
          AnalyzedStatement: query.trim(),
        },
      ];
    } else {
      try {
        const pool = getPool(connectionString);
        const client = await pool.connect();
        try {
          await client.query("BEGIN READ ONLY;");
          const res = await client.query(
            `EXPLAIN (FORMAT JSON) ${safetyCheck.sanitizedQuery}`
          );
          await client.query("ROLLBACK;");
          explainPlan = res.rows[0]?.["QUERY PLAN"];
        } catch (dbErr) {
          await client.query("ROLLBACK;").catch(() => {});
          throw dbErr;
        } finally {
          client.release();
        }
      } catch (dbError) {
        mode = "fallback";
        notice =
          dbError instanceof Error
            ? `Live EXPLAIN unavailable (${dbError.message}); generated estimated plan.`
            : "Live database offline; generated estimated plan.";

        const relation =
          query.match(/\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i)?.[1] || "students";

        explainPlan = [
          {
            Plan: {
              "Node Type": "Seq Scan",
              "Parallel Aware": false,
              "Async Capable": false,
              "Relation Name": relation,
              Alias: relation,
              "Startup Cost": 0.0,
              "Total Cost": 18.5,
              "Plan Rows": 120,
              "Plan Width": 244,
              Output: ["id", "name", "email", "created_at"],
              Filter: query.toLowerCase().includes("where")
                ? "(filtered_predicate)"
                : undefined,
            },
            "Planning Time": 0.112,
            "Execution Time": 0.425,
          },
        ];
      }
    }

    // 3. Parse EXPLAIN JSON into human-readable summary + index suggestions
    const summary = analyzeExplainPlan(explainPlan, query);

    // 4. Record historical query capture in query_history (SRS FR15)
    const queryScore = Math.max(
      10,
      100 - antiPatterns.length * 15 - (summary.hasSeqScan ? 15 : 0)
    );
    try {
      await initSystemTables(ENVIRONMENT_DEFAULTS.development);
      const metaPool = getPool(ENVIRONMENT_DEFAULTS.development);
      await metaPool.query(
        `INSERT INTO query_history
          (environment, query, exec_time_ms, rows_returned, performance_score, anti_pattern_count)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [
          environment,
          query.trim(),
          summary.executionTimeMs ?? summary.totalCost,
          summary.estimatedRows,
          queryScore,
          antiPatterns.length,
        ]
      );
    } catch {
      // Non-fatal if metadata DB is offline
    }

    return NextResponse.json({
      success: true,
      mode,
      notice,
      query,
      antiPatterns,
      explainPlan,
      summary,
      performanceScore: queryScore,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Query analysis failed.",
      },
      { status: 500 }
    );
  }
}
