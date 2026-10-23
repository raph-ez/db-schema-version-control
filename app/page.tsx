"use client";

import { useState } from "react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"compare" | "query" | "metrics">("compare");

  // Database Connections State
  const [sourceDb, setSourceDb] = useState("postgresql://postgres:postgres@localhost:5432/postgres");
  const [targetDb, setTargetDb] = useState("postgresql://postgres:postgres@localhost:5433/postgres");

  // Schema Comparison State
  const [compareResult, setCompareResult] = useState<any>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Query Analysis State
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM students");
  const [queryAnalysis, setQueryAnalysis] = useState<any>(null);
  const [loadingQuery, setLoadingQuery] = useState(false);

  // Health Metrics State
  const [healthMetrics, setHealthMetrics] = useState<any>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Handler: Compare Schemas
  const handleCompare = async () => {
    setLoadingCompare(true);
    setCompareResult(null);
    try {
      const res = await fetch("/api/schemas/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceConnection: sourceDb, targetConnection: targetDb }),
      });
      const data = await res.json();
      setCompareResult(data);
    } catch (err: any) {
      alert("Error comparing schemas: " + err.message);
    } finally {
      setLoadingCompare(false);
    }
  };

  // Handler: Analyze SQL Query
  const handleAnalyzeQuery = async () => {
    setLoadingQuery(true);
    setQueryAnalysis(null);
    try {
      const res = await fetch("/api/query/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString: sourceDb, query: sqlQuery }),
      });
      const data = await res.json();
      setQueryAnalysis(data);
    } catch (err: any) {
      alert("Error analyzing query: " + err.message);
    } finally {
      setLoadingQuery(false);
    }
  };

  // Handler: Fetch Health Metrics
  const handleFetchMetrics = async () => {
    setLoadingMetrics(true);
    setHealthMetrics(null);
    try {
      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString: sourceDb }),
      });
      const data = await res.json();
      setHealthMetrics(data);
    } catch (err: any) {
      alert("Error fetching metrics: " + err.message);
    } finally {
      setLoadingMetrics(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      <header className="mb-8 border-b border-slate-700 pb-4">
        <h1 className="text-3xl font-bold text-indigo-400">Database Schema & Performance Control Center</h1>
        <p className="text-slate-400 text-sm mt-1">Swinburne Diploma Database Project Engine</p>
      </header>

      {/* Navigation Tabs */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setActiveTab("compare")}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === "compare" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          Schema Comparison & Versioning
        </button>
        <button
          onClick={() => setActiveTab("query")}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === "query" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          Query Execution & Anti-Pattern Analysis
        </button>
        <button
          onClick={() => setActiveTab("metrics")}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === "metrics" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          Performance & Health Monitoring
        </button>
      </div>

      {/* Connection Strings Card */}
      <div className="bg-slate-800 p-5 rounded-lg mb-8 border border-slate-700">
        <h2 className="text-lg font-semibold mb-3 text-slate-200">Database Connection Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Source / Staging DB</label>
            <input
              type="text"
              value={sourceDb}
              onChange={(e) => setSourceDb(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Target / Production DB</label>
            <input
              type="text"
              value={targetDb}
              onChange={(e) => setTargetDb(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Tab 1: Schema Comparison */}
      {activeTab === "compare" && (
        <div className="space-y-6">
          <button
            onClick={handleCompare}
            disabled={loadingCompare}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-md font-medium disabled:opacity-50"
          >
            {loadingCompare ? "Comparing Schemas..." : "Compare Schemas"}
          </button>

          {compareResult && (
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 space-y-4">
              <h3 className="text-xl font-bold text-slate-100">Schema Diff Output</h3>
              <pre className="bg-slate-950 p-4 rounded text-xs text-green-400 overflow-x-auto">
                {JSON.stringify(compareResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Query Analysis */}
      {activeTab === "query" && (
        <div className="space-y-6">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">Query Analysis Studio</h3>
            <textarea
              rows={4}
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="Enter SELECT query..."
              className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleAnalyzeQuery}
              disabled={loadingQuery}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-md font-medium disabled:opacity-50"
            >
              {loadingQuery ? "Analyzing Execution Plan..." : "Analyze Query"}
            </button>
          </div>

          {queryAnalysis && (
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 space-y-4">
              <h3 className="text-xl font-bold text-slate-100">Analysis Results</h3>
              
              {queryAnalysis.antiPatterns?.length > 0 && (
                <div className="bg-amber-950 border border-amber-800 p-4 rounded-md">
                  <h4 className="font-semibold text-amber-400 mb-2">Anti-Patterns & Optimization Warnings</h4>
                  <ul className="list-disc list-inside text-sm text-amber-200 space-y-1">
                    {queryAnalysis.antiPatterns.map((warning: string, i: number) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {queryAnalysis.explainPlan && (
                <div>
                  <h4 className="font-semibold text-slate-300 mb-2">PostgreSQL Execution Plan (EXPLAIN JSON)</h4>
                  <pre className="bg-slate-950 p-4 rounded text-xs text-sky-400 overflow-x-auto">
                    {JSON.stringify(queryAnalysis.explainPlan, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Performance & Health Metrics */}
      {activeTab === "metrics" && (
        <div className="space-y-6">
          <button
            onClick={handleFetchMetrics}
            disabled={loadingMetrics}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-md font-medium disabled:opacity-50"
          >
            {loadingMetrics ? "Fetching Database Metrics..." : "Fetch Health Metrics"}
          </button>

          {healthMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-slate-200 mb-3">Table Health & Tuple Statistics</h3>
                <pre className="bg-slate-950 p-4 rounded text-xs text-emerald-400 overflow-x-auto">
                  {JSON.stringify(healthMetrics.tableHealth, null, 2)}
                </pre>
              </div>

              <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-slate-200 mb-3">Unused Indexes</h3>
                <pre className="bg-slate-950 p-4 rounded text-xs text-amber-400 overflow-x-auto">
                  {JSON.stringify(healthMetrics.unusedIndexes, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}