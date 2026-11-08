'use client';

import React, { useState, useEffect } from 'react';

interface Migration {
  id: number;
  version: string;
  filename: string;
  sql_content: string;
  rollback_sql: string;
  user_notes: string;
  status: string;
  created_by: string;
  created_at: string;
}

interface AuditLog {
  id: number;
  migration_id: number;
  version: string;
  executed_by: string;
  status: string;
  execution_time_ms: number;
  error_message: string | null;
  executed_at: string;
}

export default function MigrationControlPage() {
  // Feature 1: Approve/Edit Script State
  const [generatedSql, setGeneratedSql] = useState<string>(
    `-- Migration Script (Up)\nCREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  username VARCHAR(50) NOT NULL,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`
  );
  const [rollbackSql, setRollbackSql] = useState<string>(
    `-- Rollback Script (Down)\nDROP TABLE IF EXISTS users;`
  );
  const [versionType, setVersionType] = useState<'MINOR' | 'MAJOR' | 'PATCH'>('MINOR');
  const [userNotes, setUserNotes] = useState<string>('');
  const [author, setAuthor] = useState<string>('Developer');

  // State for Lists & Logs
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'approve' | 'history' | 'audit'>('approve');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/schema-migrations');
      const data = await res.json();
      if (data.success) {
        setMigrations(data.migrations);
        setAuditLogs(data.auditLogs);
      }
    } catch (err) {
      console.error('Failed to fetch migration data', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save Versioned Script (Task 1, 2, 3)
  const handleSaveMigration = async () => {
    if (!generatedSql.trim()) {
      alert('SQL script content cannot be empty.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/schema-migrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sqlContent: generatedSql,
          rollbackSql: rollbackSql,
          versionType: versionType,
          userNotes: userNotes,
          author: author,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(`Success: ${data.message}`);
        setUserNotes('');
        fetchData();
        setActiveTab('history');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save versioned migration');
    } finally {
      setLoading(false);
    }
  };

  // Execute SQL & Audit Trail (Task 4)
  const handleExecute = async (migrationId: number) => {
    if (!confirm('Execute this SQL script against the database?')) return;

    setLoading(true);
    try {
      const res = await fetch('/api/schema-migrations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          migrationId: migrationId,
          executedBy: author,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(`Executed successfully in ${data.durationMs} ms`);
        fetchData();
      } else {
        alert(`Execution failed: ${data.error}`);
        fetchData();
      }
    } catch (err) {
      console.error(err);
      alert('Error triggering execution');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-800">
          Schema Migration Control & Auditing System
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review generated SQL scripts, save versioned migration files with user notes, and track execution audit history.
        </p>
      </div>

      {/* Internal Tabs */}
      <div className="flex space-x-2 border-b">
        <button
          className={`py-2 px-4 text-sm font-semibold rounded-t-md ${activeTab === 'approve' ? 'bg-white border-t border-l border-r border-slate-300 text-blue-600' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => setActiveTab('approve')}
        >
          1. Review & Approve Script
        </button>
        <button
          className={`py-2 px-4 text-sm font-semibold rounded-t-md ${activeTab === 'history' ? 'bg-white border-t border-l border-r border-slate-300 text-blue-600' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => setActiveTab('history')}
        >
          2. Saved Migration Files ({migrations.length})
        </button>
        <button
          className={`py-2 px-4 text-sm font-semibold rounded-t-md ${activeTab === 'audit' ? 'bg-white border-t border-l border-r border-slate-300 text-blue-600' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => setActiveTab('audit')}
        >
          3. SQL Execution Audit History ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: Edit & Approve (Task 1, 2, 3) */}
      {activeTab === 'approve' && (
        <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Version Increment Type</label>
              <select
                className="w-full text-sm border p-2 rounded bg-slate-50"
                value={versionType}
                onChange={(e: any) => setVersionType(e.target.value)}
              >
                <option value="MINOR">Minor (Add new table/column)</option>
                <option value="MAJOR">Major (Breaking change)</option>
                <option value="PATCH">Patch (Bug fix / Small tweak)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Author / User</label>
              <input
                type="text"
                className="w-full text-sm border p-2 rounded bg-slate-50"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Change Logs / User Notes (Task 3)</label>
              <input
                type="text"
                className="w-full text-sm border p-2 rounded bg-slate-50"
                placeholder="e.g., Added users table for login requirement"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Generated Migration SQL (Task 1: Editable before saving)
            </label>
            <textarea
              className="w-full h-44 p-3 font-mono text-xs border rounded bg-slate-900 text-green-400 focus:outline-none"
              value={generatedSql}
              onChange={(e) => setGeneratedSql(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Rollback SQL Script (Auto-generated Down script)
            </label>
            <textarea
              className="w-full h-24 p-3 font-mono text-xs border rounded bg-slate-900 text-red-300 focus:outline-none"
              value={rollbackSql}
              onChange={(e) => setRollbackSql(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveMigration}
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white font-semibold text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Approve & Save Versioned File'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: Version History (Task 2 & Execution) */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {migrations.length === 0 ? (
            <div className="bg-white p-6 text-center text-slate-500 border rounded">No saved migrations yet.</div>
          ) : (
            migrations.map((m) => (
              <div key={m.id} className="bg-white p-4 border rounded shadow-sm space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-blue-600 text-lg">{m.version}</span>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">{m.filename}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${m.status === 'EXECUTED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {m.status}
                    </span>
                    {m.status !== 'EXECUTED' && (
                      <button
                        onClick={() => handleExecute(m.id)}
                        className="text-xs px-3 py-1 bg-green-600 text-white font-medium rounded hover:bg-green-700"
                      >
                        Execute SQL
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-600">
                  <strong>User Notes / Change Log:</strong> {m.user_notes || 'None'}
                </p>

                <details className="text-xs">
                  <summary className="text-blue-500 cursor-pointer font-medium">View Saved SQL Script</summary>
                  <pre className="mt-2 p-3 bg-slate-900 text-slate-200 rounded font-mono overflow-x-auto">
                    {m.sql_content}
                  </pre>
                </details>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: Audit Trail (Task 4) */}
      {activeTab === 'audit' && (
        <div className="bg-white border rounded shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 border-b font-semibold text-slate-700">
              <tr>
                <th className="p-3">Version</th>
                <th className="p-3">Executed By</th>
                <th className="p-3">Status</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Executed At</th>
                <th className="p-3">Error Log</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-600">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-400">No execution audit history found.</td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-blue-600">{log.version}</td>
                    <td className="p-3">{log.executed_by}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3">{log.execution_time_ms} ms</td>
                    <td className="p-3">{new Date(log.executed_at).toLocaleString()}</td>
                    <td className="p-3 font-mono text-red-500">{log.error_message || 'None'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}