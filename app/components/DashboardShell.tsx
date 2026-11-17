"use client";

import React from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";

export type DashboardTab = "connections" | "compare" | "migrations" | "query" | "metrics";

interface DashboardShellProps {
  activeTab: DashboardTab;
  onSelectTab?: (tab: DashboardTab) => void;
  annotationsOn: boolean;
  onToggleAnnotations: () => void;
  gridModeOn: boolean;
  onToggleGridMode: () => void;
  onTestActiveConnection?: () => void;
  notification: string | null;
  children: React.ReactNode;
}

export default function DashboardShell({
  activeTab,
  onSelectTab,
  annotationsOn,
  onToggleAnnotations,
  gridModeOn,
  onToggleGridMode,
  onTestActiveConnection,
  notification,
  children,
}: DashboardShellProps) {
  const { data: session, status } = useSession();

  const navItems: Array<{
    id: DashboardTab;
    label: string;
    badge: string;
    href?: string;
  }> = [
    { id: "connections", label: "Connections & Environments", badge: "ENV" },
    { id: "compare", label: "Schema Comparison & Diff", badge: "DIFF" },
    { id: "migrations", label: "Migrations & GitHub VCS", badge: "VCS", href: "/migrations" },
    { id: "query", label: "Query Execution Studio", badge: "SQL" },
    { id: "metrics", label: "Health & Metrics", badge: "STAT" },
  ];

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans antialiased">
      {/* Toast Notification Banner */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 bg-indigo-600 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium border border-indigo-400 flex items-center space-x-2">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Global Header (Preserves Wireframe Header Structure) */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center space-x-4">
          <Link
            href="/"
            className="bg-indigo-600/20 text-indigo-400 px-2.5 py-2 rounded-lg border border-indigo-500/30 font-mono text-xs font-bold tracking-wider"
          >
            DB
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-slate-100 tracking-tight">
                DB Engine Control Center
              </h1>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">
                v1.2.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Schema Versioning &amp; Performance Control Dashboard
            </p>
          </div>
        </div>

        {/* Header Controls & Entra ID Auth Gate */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <button
            type="button"
            onClick={onToggleAnnotations}
            className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition flex items-center space-x-1.5"
          >
            <span>
              Blueprint Notes: <strong>{annotationsOn ? "ON" : "OFF"}</strong>
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleGridMode}
            className={`px-3 py-1.5 rounded-lg border transition flex items-center space-x-1.5 ${
              gridModeOn
                ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <span>Grid View</span>
          </button>

          {onTestActiveConnection && (
            <button
              type="button"
              onClick={onTestActiveConnection}
              className="flex items-center space-x-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 px-3 py-1.5 rounded-lg transition"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-slate-300 font-medium">Test Active Connection</span>
            </button>
          )}

          {/* Microsoft Entra ID Session Status (SRS FR1) */}
          {status === "authenticated" && session?.user ? (
            <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-slate-200 font-medium max-w-[140px] truncate">
                {session.user.name || session.user.email}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="text-rose-400 hover:text-rose-300 ml-1 underline"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => signIn("azure-ad")}
              className="px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition font-medium"
              title="Sign in with Microsoft Entra ID (requires AZURE_AD_* in .env.local)"
            >
              Entra ID Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main App Shell */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-full lg:w-64 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between shrink-0 p-4 space-y-6">
          <div className="space-y-6">
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">
                Navigation
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const isActive = activeTab === item.id;
                  const baseClass = `w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? "text-indigo-400 bg-indigo-600/10 border border-indigo-500/20"
                      : "text-slate-300 hover:bg-slate-800 border border-transparent"
                  }`;

                  if (item.href && !onSelectTab) {
                    return (
                      <Link key={item.id} href={item.href} className={baseClass}>
                        <span>{item.label}</span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {item.badge}
                        </span>
                      </Link>
                    );
                  }

                  if (item.href && item.id === "migrations") {
                    return (
                      <Link key={item.id} href={item.href} className={baseClass}>
                        <span>{item.label}</span>
                        <span className="text-[10px] font-mono text-indigo-400/80">
                          {item.badge}
                        </span>
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectTab?.(item.id)}
                      className={baseClass}
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {item.badge}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Target Environments Quick Status (Matches Wireframe Sidebar) */}
            <div className="hidden lg:block">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">
                Target Environments
              </div>
              <div className="space-y-2 px-1">
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-slate-300">Development</span>
                    <span className="text-[10px] text-blue-400 font-mono">5432</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    dev_schema
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-slate-300">Staging</span>
                    <span className="text-[10px] text-emerald-400 font-mono">5433</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    staging_schema
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-slate-300">Production</span>
                    <span className="text-[10px] text-amber-400 font-mono">5434</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    prod_schema
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Safety & Engine Mode Card */}
          <div className="p-3 border-t border-slate-800 text-xs text-slate-400 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium">Safety Policy:</span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">
                ZERO AUTO-EXEC
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Swinburne CSS301 &bull; Human Approval Required
            </p>
          </div>
        </aside>

        {/* Main Workspace */}
        <main
          className={`flex-1 overflow-y-auto p-6 lg:p-8 bg-slate-950 transition-all duration-200 ${
            gridModeOn ? "wireframe-mode" : ""
          }`}
        >
          <div className="max-w-6xl mx-auto space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
