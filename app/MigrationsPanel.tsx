"use client";

import React, { useState, useEffect } from "react";

interface Migration {
  id: number;
  version: string;
  change_type?: string;
  filename: string;
  sql_content: string;
  rollback_sql?: string;
  user_notes: string;
  status: string;
  github_status?: string;
  github_url?: string | null;
  created_by: string;
  created_at: string;
}

export default function MigrationsPanel({
  annotationsOn,
  onNotify,
}: {
  annotationsOn: boolean;
  onNotify?: (message: string) => void;
}) {

  const [generatedSql, setGeneratedSql] = useState<string>(
    `-- Migration Script (Up)\nALTER TABLE "public"."students" ADD COLUMN IF NOT EXISTS "email" VARCHAR(255) NOT NULL;`
  );
  const [rollbackSql, setRollbackSql] = useState<string>(
    `-- Rollback Script (Down)\nALTER TABLE "public"."students" DROP COLUMN IF EXISTS "email";`
  );
  const [versionType, setVersionType] = useState<"MINOR" | "MAJOR" | "PATCH">("MINOR");
  const [userNotes, setUserNotes] = useState<string>("");
  const [author, setAuthor] = useState<string>("Developer");

  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [githubConfigured, setGithubConfigured] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<"approve" | "history" | "audit">(
    "approve"
  );

  const notify = (msg: string) => {
    onNotify?.(msg);
  };

  const fetchData = async () => {
    try {
      const res = await fetch("/api/schema-migrations");
      const data = await res.json();
      if (data.success) {
        setMigrations(data.migrations || []);
        setGithubConfigured(Boolean(data.githubConfigured));
      }
    } catch (err) {
      console.error("Failed to fetch migration data", err);
    }
  };

  useEffect(() => {
    fetchData();

    // Load pending migration passed from SchemaComparisonPanel if present
    if (typeof window !== "undefined") {
      const raw = sessionStorage.getItem("pending_schema_migration");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.migrationSql) setGeneratedSql(parsed.migrationSql);
          if (parsed.rollbackSql) setRollbackSql(parsed.rollbackSql);
          if (
            parsed.versionType === "MAJOR" ||
            parsed.versionType === "MINOR" ||
            parsed.versionType === "PATCH"
          ) {
            setVersionType(parsed.versionType);
          }
          if (parsed.notes) setUserNotes(parsed.notes);
          sessionStorage.removeItem("pending_schema_migration");
          notify("Loaded generated migration & rollback scripts from Comparison Engine.");
        } catch {
          // Ignore malformed storage
        }
      }
    }
  }, []);

  const handleSaveMigration = async () => {
    if (!generatedSql.trim()) {
      notify("SQL script content cannot be empty.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/schema-migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sqlContent: generatedSql,
          rollbackSql,
          versionType,
          userNotes,
          author,
        }),
      });

      const data = await res.json();
      if (data.success) {
        notify(data.message || "Approved migration saved.");
        setUserNotes("");
        await fetchData();
        setActiveSubTab("history");
      } else {
        notify(`Error: ${data.error}`);
      }
    } catch {
      notify("Failed to save versioned migration.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSql = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "application/sql;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    notify(`Downloaded ${filename}`);
  };

  return (
    <section className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-400">
              Version Control &amp; Governance
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-100">
              Schema Migration Approval &amp; GitHub VCS
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Review, edit, and approve SQL synchronization &amp; rollback scripts before saving versioned files and pushing to GitHub.
            </p>
          </div>

          {annotationsOn && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 max-w-sm text-xs text-amber-200">
              <strong>Safety Constraint (SRS 4.3):</strong> Direct DDL execution against live databases is disabled. Approved scripts are versioned and pushed to GitHub.
            </div>
          )}
        </div>

        {/* Status Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span
              className={`h-2 w-2 rounded-full ${
                githubConfigured ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span className="text-slate-300">
              GitHub REST API Integration:{" "}
              <strong className="font-mono">
                {githubConfigured ? "CONNECTED" : "LOCAL STORAGE FALLBACK"}
              </strong>
            </span>
          </div>
          <span className="text-slate-400 font-mono">
            Saved Versions: {migrations.length}
          </span>
        </div>

        {/* Internal Sub-Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            className={`py-2 px-4 text-xs font-semibold rounded-lg transition ${
              activeSubTab === "approve"
                ? "bg-indigo-600 text-white"
                : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveSubTab("approve")}
          >
            1. Review &amp; Approve Script
          </button>
          <button
            type="button"
            className={`py-2 px-4 text-xs font-semibold rounded-lg transition ${
              activeSubTab === "history"
                ? "bg-indigo-600 text-white"
                : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveSubTab("history")}
          >
            2. Saved Migration Files ({migrations.length})
          </button>
          <button
            type="button"
            className={`py-2 px-4 text-xs font-semibold rounded-lg transition ${
              activeSubTab === "audit"
                ? "bg-indigo-600 text-white"
                : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveSubTab("audit")}
          >
            3. Approval &amp; VCS Audit Log ({migrations.length})
          </button>
        </div>

        {/* TAB 1: Review, Edit & Approve */}
        {activeSubTab === "approve" && (
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  SemVer Increment Type (FR8)
                </label>
                <select
                  className="w-full text-xs border border-slate-700 p-2.5 rounded-lg bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500"
                  value={versionType}
                  onChange={(e) =>
                    setVersionType(e.target.value as "MINOR" | "MAJOR" | "PATCH")
                  }
                >
                  <option value="MINOR">Minor (+0.1.0 - Additive table/column)</option>
                  <option value="MAJOR">Major (+1.0.0 - Breaking schema change)</option>
                  <option value="PATCH">Patch (+0.0.1 - Safe tweak/expansion)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Approving Author
                </label>
                <input
                  type="text"
                  className="w-full text-xs border border-slate-700 p-2.5 rounded-lg bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Change Log / User Notes (FR9)
                </label>
                <input
                  type="text"
                  className="w-full text-xs border border-slate-700 p-2.5 rounded-lg bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g., Added email column to students table"
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Forward Migration SQL (Editable before approval)
              </label>
              <textarea
                className="w-full h-44 p-3.5 font-mono text-xs border border-slate-800 rounded-lg bg-slate-950 text-emerald-400 focus:outline-none focus:border-indigo-500"
                value={generatedSql}
                onChange={(e) => setGeneratedSql(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Companion Rollback SQL Script (Down)
              </label>
              <textarea
                className="w-full h-28 p-3.5 font-mono text-xs border border-slate-800 rounded-lg bg-slate-950 text-rose-300 focus:outline-none focus:border-indigo-500"
                value={rollbackSql}
                onChange={(e) => setRollbackSql(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                Saves versioned <code>.sql</code> + <code>.rollback.sql</code> files and pushes to GitHub when configured.
              </span>
              <button
                type="button"
                onClick={handleSaveMigration}
                disabled={loading}
                className="px-5 py-2.5 bg-indigo-600 text-white font-semibold text-xs rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition"
              >
                {loading
                  ? "Saving & Pushing..."
                  : "Approve, Save Versioned File & Push to GitHub"}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Saved Version History */}
        {activeSubTab === "history" && (
          <div className="space-y-4">
            {migrations.length === 0 ? (
              <div className="bg-slate-900 p-8 text-center text-slate-400 border border-slate-800 rounded-xl text-sm">
                No approved migrations saved yet. Review and approve a migration script in Tab 1.
              </div>
            ) : (
              migrations.map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-900 p-5 border border-slate-800 rounded-xl space-y-3"
                >
                  <div className="flex flex-wrap justify-between items-center gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-indigo-400 font-mono text-base">
                        {m.version}
                      </span>
                      <span className="text-xs bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-0.5 rounded font-mono">
                        {m.filename}
                      </span>
                      {m.change_type && (
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">
                          {m.change_type}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        {m.status}
                      </span>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
                          m.github_status === "PUSHED"
                            ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
                            : m.github_status === "FAILED"
                              ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        GitHub: {m.github_status || "LOCAL_ONLY"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDownloadSql(m.filename, m.sql_content)}
                        className="text-xs px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
                      >
                        Download .sql
                      </button>
                      {m.github_url && (
                        <a
                          href={m.github_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg border border-indigo-500/30 transition"
                        >
                          View Commit
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-300">
                    <strong className="text-slate-400">Change Notes:</strong>{" "}
                    {m.user_notes || "None"} &bull;{" "}
                    <span className="text-slate-400">Approved by {m.created_by}</span>
                  </p>

                  <details className="text-xs">
                    <summary className="text-indigo-400 cursor-pointer font-medium">
                      Inspect Forward &amp; Rollback SQL Scripts
                    </summary>
                    <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <pre className="p-3 bg-slate-950 text-emerald-400 border border-slate-800 rounded-lg font-mono overflow-x-auto">
                        {m.sql_content}
                      </pre>
                      <pre className="p-3 bg-slate-950 text-rose-300 border border-slate-800 rounded-lg font-mono overflow-x-auto">
                        {m.rollback_sql || "-- No rollback script stored."}
                      </pre>
                    </div>
                  </details>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: Governance & VCS Audit Log */}
        {activeSubTab === "audit" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 font-semibold text-slate-400">
                  <tr>
                    <th className="p-3.5">Version</th>
                    <th className="p-3.5">Classification</th>
                    <th className="p-3.5">Approved By</th>
                    <th className="p-3.5">Approval Status</th>
                    <th className="p-3.5">GitHub VCS Status</th>
                    <th className="p-3.5">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                  {migrations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        No approval audit records found.
                      </td>
                    </tr>
                  ) : (
                    migrations.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40">
                        <td className="p-3.5 font-bold text-indigo-400">
                          {log.version}
                        </td>
                        <td className="p-3.5">{log.change_type || "Minor"}</td>
                        <td className="p-3.5">{log.created_by}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3.5">{log.github_status || "LOCAL_ONLY"}</td>
                        <td className="p-3.5 text-slate-400">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </section>
  );
}
