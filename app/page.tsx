"use client";

import React, { useState } from "react";
import DashboardShell, { type DashboardTab } from "./components/DashboardShell";
import SchemaComparisonPanel from "./SchemaComparisonPanel";

type AntiPattern = {
  id?: string;
  severity?: "critical" | "warning" | "info";
  title?: string;
  rule?: string;
  desc?: string;
  message?: string;
  suggestion?: string;
};

type ExplainSummary = {
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
};

type QueryResult = {
  mode?: "live" | "fallback" | "blocked_non_select";
  notice?: string;
  antiPatterns: AntiPattern[];
  explainPlan: unknown;
  summary?: ExplainSummary;
  performanceScore?: number;
};

type MetricsTable = {
  name: string;
  live: string | number;
  dead: string | number;
  health: string;
};

type UnusedIndexItem = {
  table_name: string;
  index_name: string;
  scans: number;
  index_size?: string;
};

type QueryHistoryItem = {
  id: number;
  environment: string;
  query: string;
  exec_time_ms: number;
  rows_returned: number;
  performance_score: number;
  capture_time: string;
};

type MetricsData = {
  mode?: "live" | "fallback";
  warning?: string;
  performanceScore?: number;
  deadTuples: string | number;
  unusedIndexes: string | number;
  activeQueries: string | number;
  longestQuery: string | number;
  tables: MetricsTable[];
  unusedIndexList?: UnusedIndexItem[];
  queryHistory?: QueryHistoryItem[];
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("compare");
  const [annotationsOn, setAnnotationsOn] = useState(true);
  const [gridModeOn, setGridModeOn] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  // Connection State aligned with docker-compose.yml (FR2)
  const [devUri, setDevUri] = useState(
    "postgresql://root:password@127.0.0.1:5432/dev_schema"
  );
  const [stagingUri, setStagingUri] = useState(
    "postgresql://root:password@127.0.0.1:5433/staging_schema"
  );
  const [prodUri, setProdUri] = useState(
    "postgresql://root:password@127.0.0.1:5434/prod_schema"
  );
  const [connStatus, setConnStatus] = useState<{
    tone: "success" | "warning" | "info";
    text: string;
  } | null>(null);
  const [testingEnv, setTestingEnv] = useState<string | null>(null);

  // Cross-Environment Schema Selection State (FR3)
  const [sourceEnv, setSourceEnv] = useState<"dev" | "staging" | "prod">("staging");
  const [targetEnv, setTargetEnv] = useState<"dev" | "staging" | "prod">("prod");
  const [sourceSchema, setSourceSchema] = useState("public");
  const [targetSchema, setTargetSchema] = useState("public");

  // Query Studio State (FR11, FR12, FR13)
  const [queryInput, setQueryInput] = useState(
    "SELECT * FROM students WHERE name LIKE '%John%' ORDER BY created_at DESC;"
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult>({
    mode: "fallback",
    antiPatterns: [
      {
        title: "Wildcard SELECT Detected",
        desc: "`SELECT *` retrieves all columns, increasing memory overhead and network payload.",
        suggestion: "Replace `SELECT *` with an explicit column list.",
      },
      {
        title: "Leading Wildcard Pattern (`LIKE '%...'`)",
        desc: "Leading wildcard in `LIKE '%John%'` prevents B-tree index usage, causing full sequential scans.",
        suggestion: "Use prefix matching or a GIN trigram index.",
      },
    ],
    summary: {
      primaryNodeType: "Seq Scan",
      targetRelation: "students",
      startupCost: 0.0,
      totalCost: 18.5,
      estimatedRows: 12,
      planningTimeMs: 0.112,
      executionTimeMs: 0.425,
      hasSeqScan: true,
      indexSuggestions: [
        'CREATE INDEX idx_students_name_created_at ON "students" (name, created_at);',
      ],
      humanSummary:
        'PostgreSQL performed a Sequential Scan (Seq Scan) on "students" (estimated 12 rows, cost 0.00..18.50). Adding a targeted index can eliminate full-table reads as data grows.',
    },
    explainPlan: [
      {
        Plan: {
          "Node Type": "Seq Scan",
          "Relation Name": "students",
          Alias: "students",
          "Startup Cost": 0.0,
          "Total Cost": 18.5,
          "Plan Rows": 12,
          "Plan Width": 244,
          Filter: "(name ~~ '%John%'::text)",
          Output: ["id", "name", "email", "created_at"],
        },
        "Planning Time": 0.112,
        "Execution Time": 0.425,
      },
    ],
  });

  // Health Metrics State (FR13, FR14, FR15)
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsEnv, setMetricsEnv] = useState<"dev" | "staging" | "prod">("staging");
  const [metrics, setMetrics] = useState<MetricsData>({
    performanceScore: 91,
    deadTuples: "1,240",
    unusedIndexes: "2",
    activeQueries: "4",
    longestQuery: "0.42s",
    tables: [
      { name: "students", live: "14,250", dead: "1,120", health: "92%" },
      { name: "courses", live: "850", dead: "12", health: "99%" },
      { name: "enrollments", live: "42,100", dead: "108", health: "98%" },
    ],
    unusedIndexList: [
      {
        table_name: "students",
        index_name: "idx_students_phone",
        scans: 0,
        index_size: "64 kB",
      },
      {
        table_name: "courses",
        index_name: "idx_courses_deprecated_code",
        scans: 0,
        index_size: "32 kB",
      },
    ],
    queryHistory: [],
  });

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3200);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied ${label} to clipboard!`);
    } catch {
      notify("Clipboard access blocked by browser.");
    }
  };

  const getUriForEnv = (env: "dev" | "staging" | "prod") => {
    if (env === "dev") return devUri;
    if (env === "staging") return stagingUri;
    return prodUri;
  };

  const getLabelForEnv = (env: "dev" | "staging" | "prod") => {
    if (env === "dev") return "Development";
    if (env === "staging") return "Staging";
    return "Production";
  };

  const handleTestConnection = async (
    env: "Development" | "Staging" | "Production",
    includeSchema: boolean = false
  ) => {
    const uri =
      env === "Development"
        ? devUri
        : env === "Production"
          ? prodUri
          : stagingUri;

    setTestingEnv(env);
    setConnStatus({
      tone: "info",
      text: `Testing ${env} connection handshake...`,
    });

    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environmentName: env,
          connectionUri: uri,
          schemaName: "public",
          includeSchema,
          save: true,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const schemaInfo = data.schemaSummary
          ? ` | Schema "${data.schemaSummary.schemaName}": ${data.schemaSummary.tableCount} tables, ${data.schemaSummary.columnCount} columns, ${data.schemaSummary.constraintCount} constraints`
          : "";
        setConnStatus({
          tone: "success",
          text: `Connected: ${data.message} (${data.maskedUri})${schemaInfo}`,
        });
        notify(
          includeSchema
            ? `Refreshed ${env} schema metadata (${data.schemaSummary?.tableCount ?? 0} tables).`
            : `${env} database connection verified (${data.latencyMs}ms).`
        );
      } else {
        setConnStatus({
          tone: "warning",
          text: `${env} offline (${data.message || "Connection refused"}). Fallback mode remains available.`,
        });
        notify(`${env} database offline - fallback mode ready.`);
      }
    } catch {
      setConnStatus({
        tone: "warning",
        text: `${env} offline. Fallback mode remains available.`,
      });
      notify(`${env} database offline - fallback mode ready.`);
    } finally {
      setTestingEnv(null);
    }
  };

  const handleAnalyzeQuery = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/query/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString: getUriForEnv(sourceEnv),
          environment: getLabelForEnv(sourceEnv),
          query: queryInput,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setQueryResult(data);
        notify(
          data.mode === "blocked_non_select"
            ? "Non-SELECT query safely analyzed statically only."
            : "EXPLAIN execution plan updated!"
        );
      } else {
        notify(data.error || "Unable to analyze query.");
      }
    } catch {
      notify("Network error while analyzing query.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleLoadSampleQuery = (type: "wildcard" | "missingWhere" | "clean") => {
    if (type === "wildcard") {
      setQueryInput(
        "SELECT * FROM students WHERE name LIKE '%John%' ORDER BY created_at DESC;"
      );
      notify("Loaded Wildcard SELECT anti-pattern sample.");
    } else if (type === "missingWhere") {
      setQueryInput("UPDATE students SET status = 'inactive';");
      notify("Loaded Unbounded UPDATE anti-pattern sample.");
    } else {
      setQueryInput(
        "SELECT id, name, email FROM students WHERE status = 'active' LIMIT 50;"
      );
      notify("Loaded optimized SELECT query sample.");
    }
  };

  const handleFetchMetrics = async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString: getUriForEnv(metricsEnv),
        }),
      });
      const data: MetricsData = await res.json();
      if (res.ok) {
        setMetrics(data);
        notify(
          data.mode === "live"
            ? `Live metrics polled from ${getLabelForEnv(metricsEnv)}!`
            : "Loaded baseline catalog metrics (live DB offline)."
        );
      }
    } catch {
      notify("Failed to poll catalog metrics.");
    } finally {
      setMetricsLoading(false);
    }
  };

  return (
    <DashboardShell
      activeTab={activeTab}
      onSelectTab={(tab) => setActiveTab(tab)}
      annotationsOn={annotationsOn}
      onToggleAnnotations={() => {
        setAnnotationsOn(!annotationsOn);
        notify(`Blueprint Notes turned ${!annotationsOn ? "ON" : "OFF"}.`);
      }}
      gridModeOn={gridModeOn}
      onToggleGridMode={() => setGridModeOn(!gridModeOn)}
      onTestActiveConnection={() =>
        handleTestConnection(getLabelForEnv(sourceEnv), false)
      }
      notification={notification}
    >
      {/* TAB 1: CONNECTIONS (FR2 & FR3) */}
      {activeTab === "connections" && (
        <section className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-100">
                Database Connection Entry &amp; Environment Manager
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Configure, encrypt, and verify PostgreSQL connection strings across Development, Staging, and Production containers.
              </p>
            </div>
            {annotationsOn && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 max-w-sm text-xs text-amber-200">
                <strong>Blueprint Note (FR2 &amp; SDD 4.3):</strong> Verifies live TCP/IP PostgreSQL connectivity via <code>/api/connections/test</code> and encrypts saved URIs at rest using AES-256-GCM.
              </div>
            )}
          </div>

          {connStatus && (
            <div
              className={`border text-xs p-3.5 rounded-lg flex items-center justify-between gap-3 ${
                connStatus.tone === "success"
                  ? "bg-emerald-950/50 border-emerald-800/60 text-emerald-300"
                  : connStatus.tone === "warning"
                    ? "bg-amber-950/50 border-amber-800/60 text-amber-300"
                    : "bg-indigo-950/50 border-indigo-800/60 text-indigo-300"
              }`}
            >
              <span>{connStatus.text}</span>
              <button
                type="button"
                onClick={() => setConnStatus(null)}
                className="text-slate-400 hover:text-white text-xs shrink-0"
              >
                Clear
              </button>
            </div>
          )}

          {/* 3-Tier Environment Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Development DB */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-200 text-sm">
                  Development DB
                </h3>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-mono">
                  Port 5432
                </span>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Connection String (URI)
                </label>
                <input
                  type="password"
                  value={devUri}
                  onChange={(e) => setDevUri(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  type="button"
                  disabled={testingEnv === "Development"}
                  onClick={() => handleTestConnection("Development", false)}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
                >
                  {testingEnv === "Development"
                    ? "Verifying..."
                    : "Test & Save Dev Connection"}
                </button>
                <button
                  type="button"
                  disabled={testingEnv === "Development"}
                  onClick={() => handleTestConnection("Development", true)}
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                >
                  Refresh Schema Metadata
                </button>
              </div>
            </div>

            {/* Staging DB */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-200 text-sm">
                  Source / Staging DB
                </h3>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded font-mono">
                  Port 5433
                </span>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Connection String (URI)
                </label>
                <input
                  type="password"
                  value={stagingUri}
                  onChange={(e) => setStagingUri(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  type="button"
                  disabled={testingEnv === "Staging"}
                  onClick={() => handleTestConnection("Staging", false)}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
                >
                  {testingEnv === "Staging"
                    ? "Verifying..."
                    : "Test & Save Staging Connection"}
                </button>
                <button
                  type="button"
                  disabled={testingEnv === "Staging"}
                  onClick={() => handleTestConnection("Staging", true)}
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                >
                  Refresh Schema Metadata
                </button>
              </div>
            </div>

            {/* Production DB */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-200 text-sm">
                  Target / Production DB
                </h3>
                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono">
                  Port 5434
                </span>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Connection String (URI)
                </label>
                <input
                  type="password"
                  value={prodUri}
                  onChange={(e) => setProdUri(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  type="button"
                  disabled={testingEnv === "Production"}
                  onClick={() => handleTestConnection("Production", false)}
                  className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
                >
                  {testingEnv === "Production"
                    ? "Verifying..."
                    : "Test & Save Production Connection"}
                </button>
                <button
                  type="button"
                  disabled={testingEnv === "Production"}
                  onClick={() => handleTestConnection("Production", true)}
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                >
                  Refresh Schema Metadata
                </button>
              </div>
            </div>
          </div>

          {/* FR3: Cross-Environment Schema Selection Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-semibold text-slate-200 text-sm">
                Schema Selection &amp; Environment Bridge Controls (FR3)
              </h3>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                Dynamic Schema Selection
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Source Selector */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                <label className="text-xs font-semibold text-indigo-400 block">
                  Source Environment (Baseline)
                </label>
                <select
                  value={sourceEnv}
                  onChange={(e) =>
                    setSourceEnv(e.target.value as "dev" | "staging" | "prod")
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="dev">
                    Development Database (Port 5432 / dev_schema)
                  </option>
                  <option value="staging">
                    Staging Database (Port 5433 / staging_schema)
                  </option>
                  <option value="prod">
                    Production Database (Port 5434 / prod_schema)
                  </option>
                </select>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Source Schema Name
                  </label>
                  <input
                    type="text"
                    value={sourceSchema}
                    onChange={(e) => setSourceSchema(e.target.value)}
                    placeholder="e.g. public"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>

              {/* Target Selector */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                <label className="text-xs font-semibold text-amber-400 block">
                  Target Environment (Compare Target)
                </label>
                <select
                  value={targetEnv}
                  onChange={(e) =>
                    setTargetEnv(e.target.value as "dev" | "staging" | "prod")
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="prod">
                    Production Database (Port 5434 / prod_schema)
                  </option>
                  <option value="staging">
                    Staging Database (Port 5433 / staging_schema)
                  </option>
                  <option value="dev">
                    Development Database (Port 5432 / dev_schema)
                  </option>
                </select>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Target Schema Name
                  </label>
                  <input
                    type="text"
                    value={targetSchema}
                    onChange={(e) => setTargetSchema(e.target.value)}
                    placeholder="e.g. public"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("compare");
                  notify(
                    `Active bridge: ${getLabelForEnv(sourceEnv)} (${sourceSchema}) -> ${getLabelForEnv(targetEnv)} (${targetSchema})`
                  );
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium text-xs transition"
              >
                Apply Selection to Comparison Engine -&gt;
              </button>
              <span className="text-xs text-slate-400 font-mono">
                Active Bridge:{" "}
                <span className="text-indigo-400 font-bold">
                  {getLabelForEnv(sourceEnv)}
                </span>{" "}
                ({sourceSchema}) -&gt;{" "}
                <span className="text-amber-400 font-bold">
                  {getLabelForEnv(targetEnv)}
                </span>{" "}
                ({targetSchema})
              </span>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: SCHEMA COMPARISON (FR4, FR5, FR6, FR7, FR8) */}
      {activeTab === "compare" && (
        <SchemaComparisonPanel
          sourceUri={getUriForEnv(sourceEnv)}
          targetUri={getUriForEnv(targetEnv)}
          sourceSchema={sourceSchema}
          targetSchema={targetSchema}
          sourceLabel={getLabelForEnv(sourceEnv)}
          targetLabel={getLabelForEnv(targetEnv)}
          onNotify={notify}
        />
      )}

      {/* TAB 4: QUERY EXECUTION STUDIO (FR11, FR12, FR13) */}
      {activeTab === "query" && (
        <section className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-100">
                Query Execution Studio &amp; Anti-Pattern Detector
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Analyze SQL execution plans (<code>EXPLAIN FORMAT JSON</code>), detect anti-patterns, and generate index recommendations.
              </p>
            </div>
            {annotationsOn && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 max-w-sm text-xs text-amber-200">
                <strong>Blueprint Note (FR11-FR13):</strong> Enforces read-only <code>SELECT</code> validation before running <code>EXPLAIN (FORMAT JSON)</code> and recommends indexes on sequential scans.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <label className="text-xs font-semibold text-slate-300">
                  SQL Input Editor ({getLabelForEnv(sourceEnv)})
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadSampleQuery("wildcard")}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                  >
                    Sample: Wildcard
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleQuery("missingWhere")}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                  >
                    Sample: Unbounded UPDATE
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleQuery("clean")}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                  >
                    Sample: Optimized
                  </button>
                </div>
              </div>

              <textarea
                rows={5}
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />

              <div className="flex flex-wrap justify-between items-center gap-3">
                <button
                  type="button"
                  onClick={handleAnalyzeQuery}
                  disabled={analyzing}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-xs font-medium transition"
                >
                  {analyzing ? "Analyzing Plan..." : "Analyze Execution Plan"}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(queryInput, "Query Input")}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Copy SQL Query
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-200 text-sm">
                  Anti-Pattern Diagnostics
                </h3>
                {typeof queryResult.performanceScore === "number" && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    Score: {queryResult.performanceScore}/100
                  </span>
                )}
              </div>

              {queryResult.antiPatterns?.length > 0 ? (
                <div className="space-y-3">
                  {queryResult.antiPatterns.map((ap, i) => (
                    <div
                      key={ap.id || i}
                      className={`p-3 rounded-lg text-xs space-y-1 border ${
                        ap.severity === "critical"
                          ? "bg-rose-950/40 border-rose-800/60"
                          : "bg-amber-950/40 border-amber-800/60"
                      }`}
                    >
                      <span
                        className={`font-semibold block ${
                          ap.severity === "critical"
                            ? "text-rose-400"
                            : "text-amber-400"
                        }`}
                      >
                        {ap.title || ap.rule}
                      </span>
                      <p className="text-slate-300 text-[11px]">
                        {ap.desc || ap.message}
                      </p>
                      {ap.suggestion && (
                        <p className="text-[10px] font-mono text-indigo-300 pt-0.5">
                          Fix: {ap.suggestion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-emerald-950/40 border border-emerald-800/60 p-3 rounded-lg text-xs text-emerald-300">
                  No SQL anti-patterns detected in this query.
                </div>
              )}
            </div>
          </div>

          {/* Human-Readable Execution Plan Summary & Index Advisor (SRS FR11 & FR13) */}
          {queryResult.summary && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-200 text-sm">
                  Human-Readable Execution Summary &amp; Index Advisor
                </h3>
                <span className="text-xs font-mono text-emerald-400">
                  Node: {queryResult.summary.primaryNodeType} | Cost:{" "}
                  {queryResult.summary.startupCost.toFixed(2)}..
                  {queryResult.summary.totalCost.toFixed(2)}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {queryResult.summary.humanSummary}
              </p>

              {queryResult.summary.indexSuggestions?.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                    Recommended Index Actions
                  </p>
                  {queryResult.summary.indexSuggestions.map((sug, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-indigo-300"
                    >
                      <span className="truncate">{sug}</span>
                      {sug.startsWith("CREATE INDEX") && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(sug, "CREATE INDEX SQL")}
                          className="shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded text-[11px]"
                        >
                          Copy SQL
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Raw EXPLAIN Plan Output Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-200 text-sm">
                PostgreSQL EXPLAIN (FORMAT JSON) Output
              </h3>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    JSON.stringify(queryResult.explainPlan, null, 2),
                    "EXPLAIN JSON"
                  )
                }
                className="text-[10px] text-indigo-400 hover:underline"
              >
                Copy JSON
              </button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-lg text-xs font-mono text-sky-400 overflow-x-auto border border-slate-800">
              {JSON.stringify(queryResult.explainPlan, null, 2)}
            </pre>
          </div>
        </section>
      )}

      {/* TAB 5: HEALTH & METRICS (FR13, FR14, FR15) */}
      {activeTab === "metrics" && (
        <section className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-100">
                Database Health &amp; Performance Monitoring
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                System catalog diagnostics (<code>pg_stat_user_tables</code>,{" "}
                <code>pg_stat_user_indexes</code>, <code>pg_stat_activity</code>) and historical query logs.
              </p>
            </div>
            {annotationsOn && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 max-w-sm text-xs text-amber-200">
                <strong>Blueprint Note (FR14-FR15):</strong> Computes a live Query Performance Score and inspects unused indexes, dead tuple bloat, and historical query captures.
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <label className="text-xs text-slate-400">Target Database:</label>
              <select
                value={metricsEnv}
                onChange={(e) =>
                  setMetricsEnv(e.target.value as "dev" | "staging" | "prod")
                }
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="dev">Development (5432)</option>
                <option value="staging">Staging (5433)</option>
                <option value="prod">Production (5434)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleFetchMetrics}
              disabled={metricsLoading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-medium transition"
            >
              {metricsLoading ? "Polling Catalog..." : "Fetch Live Health Metrics"}
            </button>
          </div>

          {/* KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-slate-900 border border-indigo-500/30 p-4 rounded-xl space-y-1">
              <span className="text-xs text-indigo-300 block">Performance Score</span>
              <span className="text-2xl font-bold text-slate-100 font-mono">
                {metrics.performanceScore ?? 91}/100
              </span>
              <span className="text-[10px] text-emerald-400 block">
                Catalog Health Index
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-xs text-slate-400 block">Dead Tuples</span>
              <span className="text-2xl font-bold text-slate-100 font-mono">
                {metrics.deadTuples}
              </span>
              <span className="text-[10px] text-amber-400 block">
                VACUUM Monitor
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-xs text-slate-400 block">Unused Indexes</span>
              <span className="text-2xl font-bold text-slate-100 font-mono">
                {metrics.unusedIndexes}
              </span>
              <span className="text-[10px] text-slate-400 block">
                0-Scan Candidates
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-xs text-slate-400 block">Active Queries</span>
              <span className="text-2xl font-bold text-slate-100 font-mono">
                {metrics.activeQueries}
              </span>
              <span className="text-[10px] text-emerald-400 block">
                Live Connections
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-xs text-slate-400 block">Longest Query</span>
              <span className="text-2xl font-bold text-slate-100 font-mono">
                {metrics.longestQuery}
              </span>
              <span className="text-[10px] text-slate-400 block">
                Threshold: 2.00s
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Table Health */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-slate-200 text-sm">
                Table Health &amp; Tuple Bloat Statistics
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="pb-2">Table Name</th>
                      <th className="pb-2">Live Tuples</th>
                      <th className="pb-2">Dead Tuples</th>
                      <th className="pb-2">Health</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-slate-300 font-mono">
                    {metrics.tables?.length ? (
                      metrics.tables.map((t, i) => (
                        <tr key={i}>
                          <td className="py-2.5">{t.name}</td>
                          <td>{t.live}</td>
                          <td className="text-amber-400">{t.dead}</td>
                          <td>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">
                              {t.health}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-500">
                          No user tables found in selected database.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dynamic Unused Index Candidates */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-slate-200 text-sm">
                Unused Index Candidates
              </h3>
              <div className="space-y-3 text-xs">
                {metrics.unusedIndexList && metrics.unusedIndexList.length > 0 ? (
                  metrics.unusedIndexList.map((idxItem) => (
                    <div
                      key={idxItem.index_name}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-indigo-400 font-semibold truncate">
                          {idxItem.index_name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Table: {idxItem.table_name} | Scans: {idxItem.scans}
                          {idxItem.index_size ? ` | Size: ${idxItem.index_size}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            `DROP INDEX IF EXISTS "${idxItem.index_name}";`,
                            `Drop statement for ${idxItem.index_name}`
                          )
                        }
                        className="shrink-0 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded transition"
                      >
                        Copy Drop SQL
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 text-center">
                    No unused indexes detected.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Historical Query Performance Captures (SRS FR15) */}
          {metrics.queryHistory && metrics.queryHistory.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-slate-200 text-sm">
                Historical Query Performance Captures (FR15)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="pb-2">Env</th>
                      <th className="pb-2">Captured Query</th>
                      <th className="pb-2">Exec Time</th>
                      <th className="pb-2">Est. Rows</th>
                      <th className="pb-2">Score</th>
                      <th className="pb-2">Captured At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-slate-300 font-mono">
                    {metrics.queryHistory.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2">{item.environment}</td>
                        <td className="py-2 max-w-md truncate">{item.query}</td>
                        <td className="py-2">{item.exec_time_ms} ms</td>
                        <td className="py-2">{item.rows_returned}</td>
                        <td className="py-2 text-indigo-300">
                          {item.performance_score}/100
                        </td>
                        <td className="py-2 text-slate-400">
                          {new Date(item.capture_time).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </DashboardShell>
  );
}
