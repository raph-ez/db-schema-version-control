export interface AntiPatternFinding {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  rule: string;
  desc: string;
  message: string;
  suggestion: string;
}

export interface ExplainSummary {
  primaryNodeType: string;
  targetRelation: string;
  startupCost: number;
  totalCost: number;
  estimatedRows: number;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  hasSeqScan: boolean;
  indexSuggestions: string[];
  humanSummary: string;
}

/**
 * Validates that user SQL is a single read-only SELECT/WITH statement before running EXPLAIN.
 * Prevents stacked queries or mutating DDL/DML from ever reaching PostgreSQL.
 */
export function validateReadOnlySelectQuery(query: string): {
  isReadOnlySelect: boolean;
  sanitizedQuery: string;
  reason?: string;
} {
  const withoutTrailingSemicolons = query.trim().replace(/;+\s*$/, "");

  if (!withoutTrailingSemicolons) {
    return {
      isReadOnlySelect: false,
      sanitizedQuery: "",
      reason: "SQL query input cannot be empty.",
    };
  }

  // Block stacked queries containing internal semicolons
  if (withoutTrailingSemicolons.includes(";")) {
    return {
      isReadOnlySelect: false,
      sanitizedQuery: withoutTrailingSemicolons,
      reason: "Multiple stacked SQL statements are blocked for safety.",
    };
  }

  // Strip leading SQL comments before inspecting the command verb
  const stripped = withoutTrailingSemicolons
    .replace(/^(--[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)+/, "")
    .trim();

  if (!/^(SELECT|WITH)\b/i.test(stripped)) {
    return {
      isReadOnlySelect: false,
      sanitizedQuery: withoutTrailingSemicolons,
      reason:
        "Only read-only SELECT queries can be executed via EXPLAIN. Non-SELECT statements were statically analyzed only.",
    };
  }

  const forbiddenKeywords =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|EXECUTE|CALL)\b/i;
  if (forbiddenKeywords.test(stripped)) {
    return {
      isReadOnlySelect: false,
      sanitizedQuery: withoutTrailingSemicolons,
      reason:
        "Mutating or administrative SQL keywords are prohibited in EXPLAIN analysis.",
    };
  }

  return {
    isReadOnlySelect: true,
    sanitizedQuery: withoutTrailingSemicolons,
  };
}

/**
 * Detects common SQL anti-patterns required by SRS FR12:
 * 1. SELECT * wildcard usage
 * 2. Missing WHERE clause
 * 3. Excessive JOIN operations (>= 3 joins)
 * 4. Unnecessary DISTINCT keyword
 * 5. Leading-wildcard LIKE patterns
 */
export function detectAntiPatterns(query: string): AntiPatternFinding[] {
  const findings: AntiPatternFinding[] = [];
  const normalized = query.replace(/\s+/g, " ").trim();
  const upper = normalized.toUpperCase();

  if (!normalized) return findings;

  // 1. Wildcard SELECT *
  if (/\bSELECT\s+\*/i.test(normalized)) {
    findings.push({
      id: "wildcard-select",
      severity: "warning",
      title: "Wildcard SELECT Detected",
      rule: "Avoid SELECT *",
      desc: "`SELECT *` retrieves every column from the table, increasing network payload, memory usage, and preventing index-only scans.",
      message: "Specify only the required columns explicitly (e.g., SELECT id, name).",
      suggestion: "Replace `SELECT *` with an explicit column list.",
    });
  }

  // 2. Missing WHERE clause
  if (!/\bWHERE\b/i.test(normalized)) {
    if (/\b(UPDATE|DELETE)\b/i.test(normalized)) {
      findings.push({
        id: "unbounded-mutation",
        severity: "critical",
        title: "Unbounded UPDATE/DELETE (Missing WHERE)",
        rule: "Missing WHERE Clause",
        desc: "Executing an UPDATE or DELETE without a WHERE filter modifies or deletes every row in the target table.",
        message: "Critical safety risk: add a selective WHERE predicate immediately.",
        suggestion: "Add a specific `WHERE id = ...` filter before running.",
      });
    } else if (/\bSELECT\b/i.test(normalized) && !/\bLIMIT\b/i.test(normalized)) {
      findings.push({
        id: "missing-where-select",
        severity: "warning",
        title: "Missing WHERE / LIMIT Clause",
        rule: "Unfiltered Table Scan",
        desc: "A SELECT query without a WHERE filter or LIMIT forces PostgreSQL to scan all rows in the table.",
        message: "Add a selective WHERE filter or pagination LIMIT on large tables.",
        suggestion: "Filter results with `WHERE <indexed_column> = ...` or add `LIMIT`.",
      });
    }
  }

  // 3. Excessive JOINs (>= 3 joins)
  const joinMatches = upper.match(/\bJOIN\b/g) || [];
  if (joinMatches.length >= 3) {
    findings.push({
      id: "excessive-joins",
      severity: "warning",
      title: `Excessive JOIN Operations (${joinMatches.length} Joins)`,
      rule: "Excessive Joins",
      desc: `Joining ${joinMatches.length} or more tables increases query planner complexity, join buffer memory, and execution latency.`,
      message: "Ensure all join foreign keys are indexed or break the query into smaller CTEs.",
      suggestion: "Verify indexes exist on all JOIN foreign key columns.",
    });
  }

  // 4. Unnecessary DISTINCT
  if (/\bSELECT\s+DISTINCT\b/i.test(normalized)) {
    findings.push({
      id: "unnecessary-distinct",
      severity: "info",
      title: "Unnecessary DISTINCT Sort/Hash Overhead",
      rule: "Unnecessary DISTINCT",
      desc: "`SELECT DISTINCT` triggers an expensive Sort or HashAggregate pass to deduplicate rows, often masking missing join predicates.",
      message: "Verify whether duplicate rows are caused by an incomplete JOIN condition.",
      suggestion: "Remove `DISTINCT` if primary keys already guarantee row uniqueness.",
    });
  }

  // 5. Leading wildcard LIKE '%...'
  if (/\bLIKE\s+'%/i.test(normalized) || /\bILIKE\s+'%/i.test(normalized)) {
    findings.push({
      id: "leading-wildcard-like",
      severity: "warning",
      title: "Leading Wildcard Pattern (`LIKE '%...'`)",
      rule: "Non-Sargable Predicate",
      desc: "A leading `%` wildcard prevents standard B-tree index lookups and forces a full sequential table scan.",
      message: "Use prefix matching (`LIKE 'term%'`) or a GIN trigram index (`pg_trgm`).",
      suggestion: "Consider `CREATE INDEX ... USING gin (col gin_trgm_ops)` for substring search.",
    });
  }

  return findings;
}

/**
 * Parses PostgreSQL EXPLAIN (FORMAT JSON) output into a human-readable summary
 * and generates index suggestions for sequential scans (SRS FR11 & FR13).
 */
export function analyzeExplainPlan(
  explainPlan: unknown,
  query: string
): ExplainSummary {
  const planArray = Array.isArray(explainPlan) ? explainPlan : [];
  const root = (planArray[0] as Record<string, unknown>) || {};
  const planNode = (root.Plan as Record<string, unknown>) || {};

  const primaryNodeType = String(planNode["Node Type"] || "Seq Scan");
  const targetRelation = String(
    planNode["Relation Name"] ||
      query.match(/\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i)?.[1] ||
      "target_table"
  );
  const startupCost = Number(planNode["Startup Cost"] ?? 0);
  const totalCost = Number(planNode["Total Cost"] ?? 0);
  const estimatedRows = Number(planNode["Plan Rows"] ?? 0);
  const planningTimeMs =
    root["Planning Time"] !== undefined ? Number(root["Planning Time"]) : null;
  const executionTimeMs =
    root["Execution Time"] !== undefined ? Number(root["Execution Time"]) : null;

  // Walk plan tree to check for any Seq Scan nodes
  let hasSeqScan = false;
  const seqScanTables = new Set<string>();

  function walkNode(node: Record<string, unknown> | undefined) {
    if (!node || typeof node !== "object") return;
    if (node["Node Type"] === "Seq Scan") {
      hasSeqScan = true;
      if (node["Relation Name"]) {
        seqScanTables.add(String(node["Relation Name"]));
      }
    }
    if (Array.isArray(node.Plans)) {
      for (const child of node.Plans) {
        walkNode(child as Record<string, unknown>);
      }
    }
  }

  walkNode(planNode);

  // Suggest indexes when sequential scans occur with WHERE/ORDER BY predicates (SRS FR13)
  const indexSuggestions: string[] = [];
  if (hasSeqScan) {
    const whereCols = [
      ...query.matchAll(
        /\bWHERE\b[\s\S]*?\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|IN|>|<|>=|<=|LIKE|ILIKE)/gi
      ),
    ].map((m) => m[1]);

    const orderCols = [
      ...query.matchAll(/\bORDER\s+BY\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
    ].map((m) => m[1]);

    const candidateCols = Array.from(new Set([...whereCols, ...orderCols])).filter(
      (col) => !["and", "or", "not", "null", "true", "false"].includes(col.toLowerCase())
    );

    const tables =
      seqScanTables.size > 0 ? Array.from(seqScanTables) : [targetRelation];

    for (const tbl of tables) {
      if (candidateCols.length > 0) {
        const colList = candidateCols.slice(0, 2).join(", ");
        const idxSuffix = candidateCols.slice(0, 2).join("_");
        indexSuggestions.push(
          `CREATE INDEX idx_${tbl}_${idxSuffix} ON "${tbl}" (${colList});`
        );
      } else {
        indexSuggestions.push(
          `Sequential scan detected on "${tbl}". Add a selective WHERE predicate and index the filtered column.`
        );
      }
    }
  }

  const humanSummary = hasSeqScan
    ? `PostgreSQL performed a Sequential Scan (${primaryNodeType}) on "${targetRelation}" (estimated ${estimatedRows} rows, cost ${startupCost.toFixed(2)}..${totalCost.toFixed(2)}). Adding a targeted index can eliminate full-table reads as data grows.`
    : `PostgreSQL used an optimized ${primaryNodeType} plan on "${targetRelation}" (estimated ${estimatedRows} rows, cost ${startupCost.toFixed(2)}..${totalCost.toFixed(2)}).`;

  return {
    primaryNodeType,
    targetRelation,
    startupCost,
    totalCost,
    estimatedRows,
    planningTimeMs,
    executionTimeMs,
    hasSeqScan,
    indexSuggestions,
    humanSummary,
  };
}
