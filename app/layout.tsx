import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DB Schema Version Control System",
  description: "Unified Database Schema Comparison and Version Control System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen flex flex-col font-sans">
        {/* Unified Application Header Bar */}
        <header className="bg-slate-900 text-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <span className="text-xl font-bold tracking-wide text-blue-400">
                DB-Schema Manager
              </span>
              <span className="text-xs bg-blue-900 text-blue-200 px-2 py-0.5 rounded border border-blue-700">
                Swinburne Diploma Edition
              </span>
            </div>

            {/* Unified Navigation Bar */}
            <nav className="flex space-x-6 text-sm font-medium">
              <Link href="/" className="hover:text-blue-400 transition-colors">
                Schema Comparison
              </Link>
              <Link href="/migrations" className="hover:text-blue-400 transition-colors text-blue-400 font-bold border-b-2 border-blue-400 pb-0.5">
                Migrations & Auditing
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Application Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-6">
          {children}
        </main>

        {/* Unified Footer */}
        <footer className="bg-slate-200 border-t border-slate-300 py-3 text-center text-xs text-slate-600">
          Academic Project — Swinburne University of Technology Sarawak
        </footer>
      </body>
    </html>
  );
}