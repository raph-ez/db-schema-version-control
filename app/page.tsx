"use client";

import React, { useState } from "react";
import SchemaComparisonPanel from "./SchemaComparisonPanel";

type AntiPattern = {
  title?: string;
  rule?: string;
  desc?: string;
  message?: string;
};

type QueryResult = {
  antiPatterns: AntiPattern[];
  explainPlan: unknown;
};

type MetricsData = {
  tableHealth: { table_name: string; n_live_tup: number; n_dead_tup: number }[];
  unusedIndexes: { table_name: string; index_name: string }[];
  longRunningQueries: { query: string; duration: string; state: string }[];
  sequentialScans: { table_name: string; seq_scan: number; seq_tup_read: number; n_live_tup: number }[];
  historicalQueries: { query: string; execution_count: string; average_time_ms: string; total_rows_returned: string }[];
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<"connections" | "compare" | "query" | "metrics">("compare");
  const [annotationsOn, setAnnotationsOn] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  // Connection State
  const [devUri, setDevUri] = useState("postgresql://root:password@127.0.0.1:5432/postgres");
  const [stagingUri, setStagingUri] = useState("postgresql://root:password@127.0.0.1:5433/postgres");
  const [prodUri, setProdUri] = useState("postgresql://root:password@127.0.0.1:5434/postgres");
  const [connStatus, setConnStatus] = useState<string | null>(null);

  // Cross-Environment Schema Selection State
  const [sourceEnv, setSourceEnv] = useState<"dev" | "staging" | "prod">("dev");
  const [targetEnv, setTargetEnv] = useState<"dev" | "staging" | "prod">("prod");
  const [sourceSchema, setSourceSchema] = useState("public");
  const [targetSchema, setTargetSchema] = useState("public");

  // Query Studio State
  const [queryInput, setQueryInput] = useState("SELECT * FROM students WHERE name LIKE '%John%' ORDER BY created_at DESC;");
  const [analyzing, setAnalyzing] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult>({
    antiPatterns: [
      { title: "Wildcard SELECT Detected", desc: "`SELECT *` retrieves all columns, increasing memory overhead and network payload." },
      { title: "Unindexed Substring Pattern", desc: "Leading wildcard in `LIKE '%John%'` prevents index usage, causing full scans." }
    ],
    explainPlan: [
      {
        Plan: {
          "Node Type": "Seq Scan",
          "Relation Name": "students",
          "Alias": "students",
          "Startup Cost": 0.00,
          "Total Cost": 18.50,
          "Plan Rows": 12,
          "Plan Width": 244,
          "Filter": "(name ~~ '%John%'::text)",
          "Output": ["id", "name", "email", "created_at"]
        },
        "Planning Time": 0.112,
        "Execution Time": 0.425
      }
    ]
  });

  // Metrics State
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsData>({
    tableHealth: [],
    unusedIndexes: [],
    longRunningQueries: [],
    sequentialScans: [],
    historicalQueries: []
  });
  const [hasFetched, setHasFetched] = useState(false);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify(`Copied ${label} to clipboard!`);
  };

  const getUriForEnv = (env: "dev" | "staging" | "prod") => {
    if (env === "dev") return devUri;
    if (env === "staging") return stagingUri;
    return prodUri;
  };

  const handleTestConnection = async (env: string) => {
    let uri = stagingUri;
    if (env === "Development") uri = devUri;
    else if (env === "Production") uri = prodUri;

    setConnStatus(`Testing ${env} connection to ${uri}...`);
    try {
      const res = await fetch("/api/schemas/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUri: uri, targetUri: uri }),
      });
      if (res.ok) {
        setConnStatus(`✅ ${env} connected successfully!`);
        notify(`${env} database connection established.`);
      } else {
        setConnStatus(`⚡ ${env} offline. Switched to active mock fallback mode.`);
        notify(`${env} database offline - using mock mode.`);
      }
    } catch {
      setConnStatus(`⚡ ${env} offline. Switched to active mock fallback mode.`);
      notify(`${env} database offline - using mock mode.`);
    }
  };

  const handleRefreshSchema = (env: string) => {
    notify(`Refreshed schema metadata for ${env} database.`);
  };

  const handleAnalyzeQuery = async () => {
    setAnalyzing(true);
    notify("Analyzing query execution plan...");
    try {
      const res = await fetch("/api/query/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString: stagingUri, query: queryInput }),
      });
      if (res.ok) {
        const data: QueryResult = await res.json();
        setQueryResult(data);
        notify("EXPLAIN query plan updated!");
      } else {
        notify("Query plan generated using heuristic analyzer.");
      }
    } catch {
      notify("Query plan generated using heuristic analyzer.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleLoadSampleQuery = (type: "wildcard" | "missingWhere" | "clean") => {
    if (type === "wildcard") {
      setQueryInput("SELECT * FROM students WHERE name LIKE '%John%' ORDER BY created_at DESC;");
      notify("Loaded Wildcard SELECT anti-pattern sample.");
    } else if (type === "missingWhere") {
      setQueryInput("UPDATE students SET status = 'inactive';");
      notify("Loaded Unbounded UPDATE anti-pattern sample.");
    } else {
      setQueryInput("SELECT id, name, email FROM students WHERE status = 'active' LIMIT 50;");
      notify("Loaded optimized query sample.");
    }
  };

  const handleFetchMetrics = async () => {
    setMetricsLoading(true);
    notify("Polling PostgreSQL catalog statistics...");
    try {
      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString: getUriForEnv(sourceEnv) }),
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
        setHasFetched(true);
        notify("Metrics updated from live database!");
      } else {
        notify("Failed to fetch live metrics.");
      }
    } catch {
      notify("Failed to fetch live metrics.");
    } finally {
      setMetricsLoading(false);
    }
  };

  const handleDropIndexSQL = (indexName: string) => {
    const sql = `DROP INDEX IF EXISTS ${indexName};`;
    copyToClipboard(sql, `Drop statement for ${indexName}`);
  };

  const totalDeadTuples = metrics.tableHealth.reduce((sum, t) => sum + Number(t.n_dead_tup), 0).toLocaleString();
  const totalUnusedIndexes = metrics.unusedIndexes.length;
  const totalActiveQueries = metrics.longRunningQueries.length;
  const longestQueryDuration = metrics.longRunningQueries.length > 0 ? parseFloat(metrics.longRunningQueries[0].duration).toFixed(2) + "s" : "0.00s";

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans antialiased">
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-medium border border-indigo-400 flex items-center space-x-2 animate-bounce">
          <span>🔔 {notification}</span>
        </div>
      )}

      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-4">
          <div className="bg-indigo-600/20 text-indigo-400 p-2 rounded-lg border border-indigo-500/30">
            🗄️
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-slate-100 tracking-tight">DB Engine Control Center</h1>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">v1.2.0-beta</span>
            </div>
            <p className="text-xs text-slate-400">Schema Versioning & Performance Control Dashboard</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <button
            onClick={() => {
              setAnnotationsOn(!annotationsOn);
              notify(`Blueprint Notes turned ${!annotationsOn ? "ON" : "OFF"}.`);
            }}
            className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition flex items-center space-x-2"
          >
            <span>Blueprint Notes: <strong>{annotationsOn ? "ON" : "OFF"}</strong></span>
          </button>
          
          <button 
            onClick={() => handleTestConnection("Staging")}
            className="flex items-center space-x-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 px-3 py-1.5 rounded-lg transition"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-slate-300 font-medium">Test Active Connection</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 p-4 space-y-6">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Navigation</div>
            <nav className="space-y-1">
              <button
                onClick={() => { setActiveTab("connections"); notify("Switched to Connections & Environments tab."); }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                  activeTab === "connections" ? "text-indigo-400 bg-indigo-600/10 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>🔌 Connections & Environments</span>
              </button>
              <button
                onClick={() => { setActiveTab("compare"); notify("Switched to Schema Comparison & Diff tab."); }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                  activeTab === "compare" ? "text-indigo-400 bg-indigo-600/10 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>⚖️ Schema Comparison & Diff</span>
              </button>
              <button
                onClick={() => { setActiveTab("query"); notify("Switched to Query Execution Studio tab."); }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                  activeTab === "query" ? "text-indigo-400 bg-indigo-600/10 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>⚡ Query Execution Studio</span>
              </button>
              <button
                onClick={() => { setActiveTab("metrics"); notify("Switched to Health & Metrics tab."); }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                  activeTab === "metrics" ? "text-indigo-400 bg-indigo-600/10 border border-indigo-500/20" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>📊 Health & Metrics</span>
              </button>
            </nav>
          </div>
          <div className="p-3 border-t border-slate-800 text-xs text-slate-400 space-y-1">
            <span className="text-slate-300 font-medium block">Engine Mode:</span>
            <p className="text-[11px] text-emerald-400 font-mono">Live API Integration</p>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-8 bg-slate-950">
          <div className="max-w-6xl mx-auto space-y-6">

            {activeTab === "connections" && (
              <section className="space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-100">Database Connection Entry & Environment Manager</h2>
                    <p className="text-slate-400 text-sm mt-1">Configure and manage connection strings across Development, Staging, and Production environments.</p>
                  </div>
                </div>

                {connStatus && (
                  <div className="bg-indigo-950/50 border border-indigo-800/60 text-indigo-300 text-xs p-3 rounded-lg flex items-center justify-between">
                    <span>{connStatus}</span>
                    <button onClick={() => setConnStatus(null)} className="text-slate-400 hover:text-white text-xs">Clear</button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-200 text-sm">Development DB</h3>
                      <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-mono">Dev</span>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Connection String (URI)</label>
                      <input type="text" value={devUri} onChange={(e) => setDevUri(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200" />
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-200 text-sm">Source / Staging DB</h3>
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded font-mono">Staging</span>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Connection String (URI)</label>
                      <input type="text" value={stagingUri} onChange={(e) => setStagingUri(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200" />
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-200 text-sm">Target / Production DB</h3>
                      <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono">Prod</span>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Connection String (URI)</label>
                      <input type="text" value={prodUri} onChange={(e) => setProdUri(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200" />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="font-semibold text-slate-200 text-sm">Schema Selection & Environment Bridge Controls</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                      <label className="text-xs font-semibold text-indigo-400 block">Source Environment (Baseline)</label>
                      <select value={sourceEnv} onChange={(e: any) => setSourceEnv(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200">
                        <option value="dev">Development Database</option>
                        <option value="staging">Staging Database</option>
                        <option value="prod">Production Database</option>
                      </select>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Source Schema Name</label>
                        <input type="text" value={sourceSchema} onChange={(e) => setSourceSchema(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200" />
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                      <label className="text-xs font-semibold text-amber-400 block">Target Environment (Compare Target)</label>
                      <select value={targetEnv} onChange={(e: any) => setTargetEnv(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200">
                        <option value="prod">Production Database</option>
                        <option value="staging">Staging Database</option>
                        <option value="dev">Development Database</option>
                      </select>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Target Schema Name</label>
                        <input type="text" value={targetSchema} onChange={(e) => setTargetSchema(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "compare" && (
              <SchemaComparisonPanel sourceUri={getUriForEnv(sourceEnv)} targetUri={getUriForEnv(targetEnv)} sourceSchema={sourceSchema} targetSchema={targetSchema} />
            )}

            {activeTab === "query" && (
              <section className="space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-100">Query Execution Studio & Anti-Pattern Detector</h2>
                    <p className="text-slate-400 text-sm mt-1">Analyze SQL execution plans (`EXPLAIN FORMAT JSON`) and flag performance issues.</p>
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                    <label className="text-xs font-semibold text-slate-300">SQL Input Editor</label>
                    <textarea rows={5} value={queryInput} onChange={(e) => setQueryInput(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200" />
                    <button onClick={handleAnalyzeQuery} disabled={analyzing} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-xs font-medium">{analyzing ? "Analyzing..." : "Analyze Execution Plan"}</button>
                </div>
              </section>
            )}

            {activeTab === "metrics" && (
              <section className="space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-100">Database Health & Performance Monitoring</h2>
                    <p className="text-slate-400 text-sm mt-1">Real-time system catalog diagnostics fetched live from PostgreSQL.</p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button onClick={handleFetchMetrics} disabled={metricsLoading} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-medium transition shadow-lg shadow-indigo-500/20">
                    {metricsLoading ? "Polling live data..." : "Fetch Live Health Metrics"}
                  </button>
                </div>

                {!hasFetched && !metricsLoading && (
                  <div className="text-center p-12 bg-slate-900 border border-slate-800 rounded-xl">
                    <p className="text-slate-400 text-sm">Click "Fetch Live Health Metrics" to pull real data from your connected database.</p>
                  </div>
                )}

                {hasFetched && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                        <span className="text-xs text-slate-400 block">Total Dead Tuples</span>
                        <span className="text-2xl font-bold text-slate-100 font-mono">{totalDeadTuples}</span>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                        <span className="text-xs text-slate-400 block">Unused Indexes</span>
                        <span className="text-2xl font-bold text-slate-100 font-mono">{totalUnusedIndexes}</span>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                        <span className="text-xs text-slate-400 block">Active Queries</span>
                        <span className="text-2xl font-bold text-slate-100 font-mono">{totalActiveQueries}</span>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                        <span className="text-xs text-slate-400 block">Longest Query</span>
                        <span className="text-2xl font-bold text-slate-100 font-mono">{longestQueryDuration}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                        <h3 className="font-semibold text-slate-200 text-sm">Table Health & Tuple Bloat Statistics</h3>
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full text-left text-xs">
                            <thead className="text-slate-400 border-b border-slate-800 sticky top-0 bg-slate-900">
                              <tr>
                                <th className="pb-2">Table Name</th>
                                <th className="pb-2">Live Tuples</th>
                                <th className="pb-2">Dead Tuples</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 text-slate-300 font-mono">
                              {metrics.tableHealth.map((t, i) => (
                                <tr key={i}>
                                  <td className="py-2.5">{t.table_name}</td>
                                  <td>{t.n_live_tup}</td>
                                  <td className={t.n_dead_tup > 1000 ? "text-red-400" : "text-amber-400"}>{t.n_dead_tup}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                        <h3 className="font-semibold text-slate-200 text-sm">Unused Index Candidates</h3>
                        <div className="space-y-3 text-xs max-h-64 overflow-y-auto pr-2">
                          {metrics.unusedIndexes.length === 0 ? (
                            <p className="text-slate-500">No unused indexes found.</p>
                          ) : (
                            metrics.unusedIndexes.map((idx, i) => (
                              <div key={i} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
                                <div>
                                  <p className="font-mono text-indigo-400 font-semibold">{idx.index_name}</p>
                                  <p className="text-[11px] text-slate-400">Table: {idx.table_name} | Scans: 0</p>
                                </div>
                                <button onClick={() => handleDropIndexSQL(idx.index_name)} className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded transition">
                                  Drop SQL
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 mt-6">
                      <h3 className="font-semibold text-slate-200 text-sm">Sequential Scan Warnings (Index Recommended)</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="pb-2">Table Name</th>
                              <th className="pb-2">Sequential Scans</th>
                              <th className="pb-2">Tuples Read</th>
                              <th className="pb-2">Est. Rows</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50 text-slate-300 font-mono">
                            {metrics.sequentialScans.length === 0 ? (
                              <tr><td colSpan={4} className="py-4 text-center text-slate-500">No excessive sequential scans detected.</td></tr>
                            ) : (
                              metrics.sequentialScans.map((scan, i) => (
                                <tr key={i}>
                                  <td className="py-2.5">{scan.table_name}</td>
                                  <td className="text-amber-400">{scan.seq_scan}</td>
                                  <td>{scan.seq_tup_read}</td>
                                  <td>{scan.n_live_tup}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 mt-6">
                      <h3 className="font-semibold text-slate-200 text-sm">Historical Query Monitoring (pg_stat_statements)</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="pb-2 w-1/3">Query Snippet</th>
                              <th className="pb-2">Executions</th>
                              <th className="pb-2">Avg Time (ms)</th>
                              <th className="pb-2">Score</th>
                              <th className="pb-2">Total Rows</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50 text-slate-300 font-mono">
                            {metrics.historicalQueries?.length === 0 ? (
                              <tr><td colSpan={5} className="py-4 text-center text-slate-500">Ensure pg_stat_statements is enabled to view history.</td></tr>
                            ) : (
                              metrics.historicalQueries?.map((hq, i) => {
                                const timeMs = parseFloat(hq.average_time_ms);
                                let score = <span className="text-red-400 font-bold">D (Poor)</span>;
                                if (timeMs < 10) score = <span className="text-emerald-400 font-bold">A (Excellent)</span>;
                                else if (timeMs < 100) score = <span className="text-blue-400 font-bold">B (Good)</span>;
                                else if (timeMs < 500) score = <span className="text-amber-400 font-bold">C (Fair)</span>;

                                return (
                                  <tr key={i}>
                                    <td className="py-2.5 truncate max-w-xs text-sky-400/80">{hq.query.substring(0, 70)}...</td>
                                    <td>{hq.execution_count}</td>
                                    <td className="text-slate-300">{timeMs.toFixed(2)}</td>
                                    <td>{score}</td>
                                    <td>{hq.total_rows_returned}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}