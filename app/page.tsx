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

  // --- REACT STATE ---
  const [environment, setEnvironment] = useState("Development");
  const [uri, setUri] = useState("postgresql://root:password@localhost:5432/dev_schema");
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [logs, setLogs] = useState<string[]>(["System initialized.", "Awaiting connection parameters..."]);
  
  const [activeTab, setActiveTab] = useState<"logs" | "metadata">("logs");
  const [schemaData, setSchemaData] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Validation Logic (Tweak 2)
  const isValidUri = uri.startsWith("postgres://") || uri.startsWith("postgresql://");

  const terminalEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeTab === "logs") {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, activeTab]);

  const handleTestConnection = async () => {
    if (!uri || !isValidUri) return;
    
    setConnectionState("connecting");
    setActiveTab("logs");
    setSchemaData(null);
    setLogs(prev => [...prev, `[INIT] Testing connection to ${environment} environment...`, `[AUTH] Resolving credentials for target database...`]);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Error Simulation (Tweak 1)
    if (uri.toLowerCase().includes("error") || uri.toLowerCase().includes("fail")) {
      setConnectionState("error");
      setLogs(prev => [
        ...prev, 
        `[FATAL] connection to server at "${uri.split('@')[1]?.split(':')[0] || 'localhost'}", port 5432 failed: timeout`,
        `[ERROR] Is the server running on that host and accepting TCP/IP connections?`
      ]);
      return;
    }

    setConnectionState("connected");
    setLogs(prev => [
      ...prev, 
      "[SUCCESS] Handshake established.", 
      "[METADATA] Scanned 3 tables, 14 columns.",
      "[OK] Ready for schema diffing."
    ]);
    
    setSchemaData(JSON.stringify({
      environment: environment.toLowerCase(),
      connection: "healthy",
      latency_ms: 24,
      pg_version: "PostgreSQL 15.4",
      schema: {
        public: {
          tables: [
            { name: "users", rows: 142, size_kb: 48 },
            { name: "sessions", rows: 89, size_kb: 32 },
            { name: "schema_migrations", rows: 4, size_kb: 8 }
          ]
        }
      }
    }, null, 2));
  };

  const handleCopy = () => {
    const textToCopy = activeTab === "logs" ? logs.join("\n") : schemaData || "";
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- UI RENDERING ---
  if (status === "loading") return <div className="flex h-screen items-center justify-center bg-black text-sm text-zinc-500 font-mono"><span className="animate-pulse">Authenticating session...</span></div>;
  if (!session) return <div className="flex h-screen items-center justify-center bg-black text-white">Locked</div>;

  return (
    <div className="min-h-screen bg-[#050505] font-sans text-zinc-300 selection:bg-white/20 overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      
      <nav className="relative z-10 flex items-center justify-between border-b border-white/5 bg-black/50 px-4 md:px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-900 border border-white/10 shadow-sm shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
              <path d="M3 12A9 3 0 0 0 21 12"></path>
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-100 hidden sm:block">Schema Control</span>
          <span className="rounded bg-zinc-800/50 px-2 py-0.5 text-[10px] font-medium tracking-wider text-zinc-400 uppercase border border-white/5">Beta</span>
        </div>
        
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <div className={`h-2 w-2 rounded-full ${
              connectionState === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
              connectionState === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
              connectionState === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-zinc-600'
            }`}></div>
            <span className="hidden sm:block">{session.user?.name}</span>
          </div>
          <button onClick={() => signOut()} className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">Sign Out</button>
        </div>
      </nav>

      <main className="relative z-10 mx-auto mt-8 md:mt-12 max-w-7xl px-4 md:px-6 pb-12">
        <div className="mb-8 md:mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-zinc-100">Database Connection</h1>
            <p className="mt-2 text-sm text-zinc-500">Configure PostgreSQL target environments and verify access credentials.</p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-white/5 bg-zinc-900/50 px-3 py-1.5 text-xs font-mono text-zinc-400 backdrop-blur-sm self-start sm:self-auto">
            <span>Status:</span>
            <span className={
              connectionState === 'connected' ? 'text-emerald-400' : 
              connectionState === 'error' ? 'text-red-400' : 
              'text-zinc-500'
            }>
              {connectionState.toUpperCase()}
            </span>
          </div>
        </div>
        
        <div className="grid gap-6 md:gap-8 lg:grid-cols-12">
          
          <div className="lg:col-span-7">
            <div className="rounded-xl border border-white/10 bg-[#09090b] shadow-2xl overflow-hidden">
              <div className="p-4 md:p-6 space-y-6">
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Target Environment</label>
                  <select 
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black px-4 py-2.5 text-sm text-zinc-300 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all appearance-none cursor-pointer hover:border-white/20"
                  >
                    <option value="Development">Development (Localhost)</option>
                    <option value="Staging">Staging (Preview)</option>
                    <option value="Production">Production (Live)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                    <span>Connection URI</span>
                    <span className="text-zinc-700 font-mono tracking-normal normal-case hidden sm:block">postgres://</span>
                  </label>
                  <div className="relative group">
                    <input 
                      type="text" 
                      value={uri}
                      onChange={(e) => setUri(e.target.value)}
                      placeholder="postgresql://user:password@host:port/db" 
                      className={`w-full rounded-md border bg-black px-4 py-2.5 font-mono text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 transition-all ${
                        !isValidUri && uri.length > 0 
                          ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/50' 
                          : 'border-white/10 focus:border-zinc-400 focus:ring-zinc-400 hover:border-white/20'
                      }`}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-600 group-hover:text-zinc-400 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    </div>
                  </div>
                  {!isValidUri && uri.length > 0 && (
                    <p className="mt-2 text-[11px] text-red-400 font-medium">Must start with postgres:// or postgresql://</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-white/5 bg-white/[0.02] px-4 md:px-6 py-4 gap-4">
                <p className="text-xs text-zinc-500 font-mono text-center sm:text-left">Changes apply to {environment.toLowerCase()}.</p>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button className="flex-1 sm:flex-none rounded-md border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 transition-colors">
                    Cancel
                  </button>
                  <button 
                    onClick={handleTestConnection}
                    disabled={connectionState === 'connecting' || (!isValidUri && uri.length > 0)}
                    className="flex-1 sm:flex-none flex justify-center items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-black hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                  >
                    {connectionState === 'connecting' ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Connecting
                      </>
                    ) : 'Save Config'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 h-[400px] lg:h-auto min-h-[400px]">
            <div className="flex flex-col h-full overflow-hidden rounded-xl border border-white/10 bg-[#050505] shadow-2xl">
              
              <div className="flex items-center border-b border-white/5 bg-[#09090b] overflow-x-auto no-scrollbar">
                <button 
                  onClick={() => setActiveTab("logs")}
                  className={`border-b-2 px-4 py-2.5 text-xs font-mono font-medium transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'border-zinc-300 text-zinc-200' : 'border-transparent text-zinc-600 hover:text-zinc-400'}`}
                >
                  system_logs
                </button>
                <button 
                  onClick={() => setActiveTab("metadata")}
                  disabled={!schemaData}
                  className={`border-b-2 px-4 py-2.5 text-xs font-mono font-medium transition-colors whitespace-nowrap ${activeTab === 'metadata' ? 'border-zinc-300 text-zinc-200' : 'border-transparent text-zinc-600 hover:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed'}`}
                >
                  metadata.json
                </button>
                <div className="flex-1 min-w-[1rem]"></div>
                <button onClick={handleCopy} className="px-3 text-xs font-mono text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1 shrink-0">
                  {copied ? <span className="text-emerald-400">copied!</span> : <span>copy</span>}
                </button>
                <button onClick={() => {setLogs([]); setSchemaData(null); setActiveTab("logs"); setConnectionState("idle");}} className="px-4 text-xs font-mono text-zinc-600 hover:text-zinc-300 transition-colors shrink-0">
                  clear
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 md:p-4 font-mono text-[11px] md:text-[12px] leading-relaxed">
                {activeTab === "logs" ? (
                  <>
                    {logs.map((log, index) => (
                      <div key={index} className="flex gap-3 md:gap-4 hover:bg-white/[0.02] px-2 py-0.5 rounded transition-colors break-words">
                        <span className="text-zinc-700 select-none shrink-0">{String(index + 1).padStart(2, '0')}</span>
                        <span className={log.includes('[SUCCESS]') || log.includes('[OK]') ? 'text-emerald-400' : log.includes('[ERROR]') || log.includes('[FATAL]') ? 'text-red-400' : log.includes('[INIT]') || log.includes('[AUTH]') ? 'text-amber-300' : 'text-zinc-400'}>
                          {log}
                        </span>
                      </div>
                    ))}
                    {connectionState !== 'connecting' && (
                      <div className="mt-2 flex items-center gap-3 md:gap-4 px-2">
                        <span className="text-zinc-700 select-none shrink-0">{String(logs.length + 1).padStart(2, '0')}</span>
                        <span className="h-3 w-1.5 animate-pulse bg-zinc-500"></span>
                      </div>
                    )}
                    <div ref={terminalEndRef} />
                  </>
                ) : (
                  <pre className="text-emerald-400 px-2 py-1 overflow-x-auto">
                    {schemaData}
                  </pre>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}