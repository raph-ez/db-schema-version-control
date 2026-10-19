"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";

export default function Home() {
  // --- TEMPORARY BYPASS ---
  const session = { user: { name: "Raphael" } };
  const status: string = "authenticated";
  // ------------------------

  // @JOSH: Remove the bypass above and uncomment the line below once Azure AD keys are in .env.local
  // const { data: session, status } = useSession();

  // Navigation State
  const [activeView, setActiveView] = useState<"connections" | "diff" | "overview">("connections");

  // Connection Manager State
  const [environment, setEnvironment] = useState("Development");
  const [uri, setUri] = useState("postgresql://root:password@localhost:5432/dev_schema");
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([
    "System runtime initialized.",
    "PostgreSQL pool controller standby.",
    "Awaiting target configuration..."
  ]);
  const [activeTab, setActiveTab] = useState<"logs" | "metadata">("logs");
  const [schemaData, setSchemaData] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Forgiving URI Validation (Handles mobile keyboard auto-capitalization and trailing spaces)
  const cleanUri = uri.trim().toLowerCase();
  const isValidUri = cleanUri.startsWith("postgres://") || cleanUri.startsWith("postgresql://");

  // Terminal Auto-scroll
  const terminalEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeTab === "logs") {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, activeTab]);

  // Test Connection Handler
  const handleTestConnection = async () => {
    if (!uri || !isValidUri) return;
    
    setConnectionState("connecting");
    setActiveTab("logs");
    setSchemaData(null);
    setLogs(prev => [
      ...prev, 
      `[INIT] Validating connection string for ${environment.toLowerCase()}...`, 
      `[AUTH] Authenticating user 'root' against container network...`
    ]);
    
    await new Promise(resolve => setTimeout(resolve, 1800));
    
    if (cleanUri.includes("error") || cleanUri.includes("fail")) {
      setConnectionState("error");
      setLogs(prev => [
        ...prev, 
        `[FATAL] Connection to server failed: port ${environment === "Development" ? "5432" : environment === "Staging" ? "5433" : "5434"} timeout`,
        `[ERROR] Verify Docker container is running and port is forwarded correctly.`
      ]);
      return;
    }

    setConnectionState("connected");
    setLogs(prev => [
      ...prev, 
      "[SUCCESS] PostgreSQL 15.4 handshake established.", 
      "[METADATA] Catalog parsed: 14 tables, 84 columns, 12 foreign keys.",
      "[OK] Ready for schema diff engine."
    ]);
    
    setSchemaData(JSON.stringify({
      target_env: environment.toLowerCase(),
      host: "localhost",
      port: environment === "Development" ? 5432 : environment === "Staging" ? 5433 : 5434,
      database: `${environment.toLowerCase()}_schema`,
      status: "connected",
      latency_ms: 18,
      catalog: {
        tables_count: 14,
        columns_count: 84,
        indexes_count: 22,
        tables: ["users", "departments", "table_versions", "migration_logs"]
      }
    }, null, 2));
  };

  const handleCopy = () => {
    const textToCopy = activeTab === "logs" ? logs.join("\n") : schemaData || "";
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-sm text-zinc-500 font-mono">
        <span className="animate-pulse">Loading authenticated workspace...</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white">
        <button onClick={() => signIn("azure-ad")} className="rounded bg-white px-4 py-2 text-black text-sm font-medium">
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#050505] font-sans text-zinc-300 selection:bg-white/20 pb-20 md:pb-0">
      {/* Background Texture */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#8080800d_1px,transparent_1px),linear-gradient(to_bottom,#8080800d_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      {/* 1. DESKTOP SIDEBAR (Visible ONLY on Desktop: md+) */}
      <aside className="hidden md:flex w-64 flex-col border-r border-white/5 bg-[#080808] p-4 shrink-0 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-zinc-900 border border-white/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-200">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
              <path d="M3 12A9 3 0 0 0 21 12"></path>
            </svg>
          </div>
          <div>
            <div className="text-xs font-semibold tracking-tight text-zinc-100">SCHEMA CONTROL</div>
            <div className="text-[10px] font-mono text-zinc-500">v0.2.0 • CSS301</div>
          </div>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          <button
            onClick={() => setActiveView("overview")}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              activeView === "overview" ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            System Overview
          </button>

          <button
            onClick={() => setActiveView("connections")}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              activeView === "connections" ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 22 4-10 4 10"/></svg>
            Connection Manager
          </button>

          <button
            onClick={() => setActiveView("diff")}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              activeView === "diff" ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/></svg>
            Schema Diff Engine
            <span className="ml-auto rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.2 text-[9px] font-mono text-emerald-400">DIFF</span>
          </button>
        </nav>

        <div className="mt-auto border-t border-white/5 pt-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
              <span className="text-xs text-zinc-300 font-medium">{session.user?.name}</span>
            </div>
            <button onClick={() => signOut()} className="text-[11px] text-zinc-500 hover:text-zinc-300">Exit</button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION WORKSPACE */}
      <div className="flex flex-1 flex-col w-full min-w-0">
        
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/5 bg-[#080808]/90 px-4 md:px-8 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="font-semibold text-zinc-200 uppercase tracking-wider">{activeView}</span>
          </div>

          <div className="flex items-center gap-2 rounded border border-white/5 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-mono text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Docker: 3/3 Active
          </div>
        </header>

        {/* Content Container */}
        <main className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          
          {/* KPI Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="rounded-lg border border-white/5 bg-[#09090b] p-3 md:p-4">
              <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-zinc-500">PostgreSQL</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-base md:text-xl font-medium text-white">3 Active</span>
                <span className="text-[10px] font-mono text-emerald-400 hidden sm:inline">5432-34</span>
              </div>
            </div>

            <div className="rounded-lg border border-white/5 bg-[#09090b] p-3 md:p-4">
              <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Drift</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-base md:text-xl font-medium text-amber-400">2 Deltas</span>
                <span className="text-[10px] font-mono text-amber-400/80 hidden sm:inline">Pending</span>
              </div>
            </div>

            <div className="rounded-lg border border-white/5 bg-[#09090b] p-3 md:p-4">
              <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Target VCS</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-base md:text-xl font-medium text-white">GitHub</span>
                <span className="text-[10px] font-mono text-zinc-400 hidden sm:inline">main</span>
              </div>
            </div>

            <div className="rounded-lg border border-white/5 bg-[#09090b] p-3 md:p-4">
              <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Auth Gate</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-base md:text-xl font-medium text-white">Entra ID</span>
                <span className="text-[10px] font-mono text-emerald-400 hidden sm:inline">SSO</span>
              </div>
            </div>
          </div>

          {/* VIEW: CONNECTION MANAGER */}
          {activeView === "connections" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-lg md:text-xl font-medium tracking-tight text-white">Connection Manager</h1>
                <p className="mt-1 text-xs text-zinc-500">Configure PostgreSQL endpoints and verify catalog accessibility.</p>
              </div>

              <div className="grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <div className="rounded-xl border border-white/10 bg-[#09090b] shadow-xl">
                    <div className="p-4 md:p-6 space-y-5">
                      <div>
                        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Target Environment</label>
                        <select 
                          value={environment}
                          onChange={(e) => {
                            const env = e.target.value;
                            setEnvironment(env);
                            if (env === "Development") setUri("postgresql://root:password@localhost:5432/dev_schema");
                            if (env === "Staging") setUri("postgresql://root:password@localhost:5433/staging_schema");
                            if (env === "Production") setUri("postgresql://root:password@localhost:5434/prod_schema");
                          }}
                          className="w-full rounded-md border border-white/10 bg-black px-3.5 py-2.5 text-sm text-zinc-300 focus:border-zinc-400 focus:outline-none transition-all cursor-pointer"
                        >
                          <option value="Development">Development (Port 5432)</option>
                          <option value="Staging">Staging (Port 5433)</option>
                          <option value="Production">Production (Port 5434)</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                          <span>Connection URI</span>
                          <span className="text-zinc-600 font-mono text-[10px] lowercase">{environment.toLowerCase()}_schema</span>
                        </label>
                        <input 
                          type="text" 
                          value={uri}
                          autoCapitalize="none"
                          autoCorrect="off"
                          onChange={(e) => setUri(e.target.value)}
                          className={`w-full rounded-md border bg-black px-3.5 py-2.5 font-mono text-xs md:text-sm text-zinc-200 transition-all ${
                            !isValidUri && uri.length > 0 ? 'border-red-500/50' : 'border-white/10 focus:border-zinc-400'
                          }`}
                        />
                        {!isValidUri && uri.length > 0 && (
                          <p className="mt-1.5 text-[11px] text-red-400">URI must begin with postgresql:// or postgres://</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-white/5 bg-white/[0.01] px-4 md:px-6 py-3.5 gap-3">
                      <span className="text-[11px] font-mono text-zinc-500">Route: Next.js API Pool Manager</span>
                      <button 
                        type="button"
                        onClick={handleTestConnection}
                        disabled={connectionState === 'connecting' || !isValidUri}
                        className="min-h-[44px] w-full sm:w-auto rounded-md bg-white px-5 py-2.5 text-xs font-semibold text-black transition-all active:bg-zinc-300 hover:bg-zinc-200 disabled:opacity-40"
                      >
                        {connectionState === 'connecting' ? "Testing Pool..." : "Test & Verify Connection"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Console Log Area */}
                <div className="lg:col-span-5 h-[340px]">
                  <div className="flex flex-col h-full rounded-xl border border-white/10 bg-[#050505] shadow-xl overflow-hidden">
                    <div className="flex items-center border-b border-white/5 bg-[#09090b] px-4 py-2 text-xs font-mono">
                      <button 
                        onClick={() => setActiveTab("logs")}
                        className={`mr-4 pb-1 text-xs transition-colors ${activeTab === 'logs' ? 'text-white border-b border-white' : 'text-zinc-600'}`}
                      >
                        system_logs
                      </button>
                      <button 
                        onClick={() => setActiveTab("metadata")}
                        disabled={!schemaData}
                        className={`pb-1 text-xs transition-colors ${activeTab === 'metadata' ? 'text-white border-b border-white' : 'text-zinc-600 disabled:opacity-30'}`}
                      >
                        metadata.json
                      </button>
                      <div className="ml-auto flex gap-2">
                        <button onClick={handleCopy} className="text-zinc-500 hover:text-zinc-300">{copied ? "copied" : "copy"}</button>
                        <button onClick={() => setLogs([])} className="text-zinc-500 hover:text-zinc-300">clear</button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 md:p-4 font-mono text-[11px] leading-relaxed">
                      {activeTab === "logs" ? (
                        <>
                          {logs.map((log, index) => (
                            <div key={index} className="flex gap-2.5 py-0.5">
                              <span className="text-zinc-700 select-none shrink-0">{String(index + 1).padStart(2, '0')}</span>
                              <span className={`break-all ${log.includes('[SUCCESS]') ? 'text-emerald-400' : log.includes('[FATAL]') ? 'text-red-400' : log.includes('[INIT]') ? 'text-amber-300' : 'text-zinc-400'}`}>
                                {log}
                              </span>
                            </div>
                          ))}
                          <div ref={terminalEndRef} />
                        </>
                      ) : (
                        <pre className="text-emerald-400 text-[11px] whitespace-pre-wrap break-all">{schemaData}</pre>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: SCHEMA DIFF ENGINE */}
          {activeView === "diff" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg md:text-xl font-medium tracking-tight text-white">Two-Way Schema Comparison</h1>
                  <p className="mt-1 text-xs text-zinc-500">AST Structural Diff between Dev (Source) and Prod (Target).</p>
                </div>
                <button 
                  onClick={() => alert("Migration Script Generated for Week 6 Demo!")}
                  className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 self-start sm:self-auto"
                >
                  Generate DDL Migration (.sql)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="rounded-xl border border-white/10 bg-[#09090b] p-4 md:p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Source: Development</span>
                    <span className="text-[11px] font-mono text-zinc-500">dev_schema (v2.1.0)</span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between rounded bg-white/5 p-2">
                      <span className="text-zinc-200">table: users</span>
                      <span className="text-[10px] text-zinc-500">4 cols</span>
                    </div>
                    <div className="ml-3 space-y-1 text-zinc-400">
                      <div>• id (uuid, PK)</div>
                      <div>• name (varchar 255)</div>
                      <div>• email (varchar 255)</div>
                      <div className="text-emerald-400 font-bold">+ ic_no (varchar 20) [NEW]</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#09090b] p-4 md:p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Target: Production</span>
                    <span className="text-[11px] font-mono text-zinc-500">prod_schema (v2.0.0)</span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between rounded bg-white/5 p-2">
                      <span className="text-zinc-200">table: users</span>
                      <span className="text-[10px] text-zinc-500">3 cols</span>
                    </div>
                    <div className="ml-3 space-y-1 text-zinc-500">
                      <div>• id (uuid, PK)</div>
                      <div>• name (varchar 255)</div>
                      <div>• email (varchar 255)</div>
                      <div className="text-red-400/60 line-through">ic_no (missing)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: OVERVIEW */}
          {activeView === "overview" && (
            <div className="rounded-xl border border-white/10 bg-[#09090b] p-6 md:p-8 text-center space-y-3">
              <h2 className="text-base font-medium text-white">System Architecture & Pipeline Ready</h2>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Next.js full-stack container running locally with NextAuth security, Dockerized PostgreSQL 3-tier databases, and GitHub API migration hooks.
              </p>
              <button 
                onClick={() => setActiveView("diff")} 
                className="rounded bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-zinc-200"
              >
                Open Schema Diff Engine
              </button>
            </div>
          )}

        </main>
      </div>

      {/* ========================================================================= */}
      {/* 3. NATIVE MOBILE BOTTOM NAVIGATION BAR (md:hidden)                        */}
      {/* ========================================================================= */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 flex h-16 items-center justify-around border-t border-white/10 bg-[#080808]/95 backdrop-blur-lg px-2">
        <button
          type="button"
          onClick={() => setActiveView("overview")}
          className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${
            activeView === "overview" ? "text-white" : "text-zinc-500"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
          <span className="mt-1">Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("connections")}
          className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${
            activeView === "connections" ? "text-white" : "text-zinc-500"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 22 4-10 4 10"/></svg>
          <span className="mt-1">Connections</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("diff")}
          className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${
            activeView === "diff" ? "text-white" : "text-zinc-500"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/></svg>
          <span className="mt-1">Schema Diff</span>
        </button>
      </nav>
    </div>
  );
}