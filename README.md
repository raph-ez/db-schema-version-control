# DB Engine Control Center — Database Schema Comparison & Version Control System

Unified full-stack application for comparing PostgreSQL schemas across **Development**, **Staging**, and **Production**, generating Semantic Versioned (`MAJOR.MINOR.PATCH`) forward & rollback DDL scripts, requiring explicit human review/approval before pushing to GitHub, and analyzing query execution plans (`EXPLAIN FORMAT JSON`).

## Architecture & Safety Guarantees
- **Frontend & API:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4.
- **Database Layer:** `pg` connection pooling across isolated PostgreSQL 15 Docker containers (`5432` Dev, `5433` Staging, `5434` Prod).
- **Security:** AES-256-GCM encryption at rest for saved connection URIs (`lib/crypto.ts`), password masking in logs/responses, Microsoft Entra ID OAuth via NextAuth (`lib/auth.ts`), and strict read-only single-`SELECT` validation for `EXPLAIN`.
- **Zero Auto-Execution Safety Constraint:** Live databases are never modified automatically; `/api/schema-migrations/execute` has been decommissioned in accordance with SRS Section 4.3–4.4.

## Quick Start
1. Copy `.env.example` to `.env.local` and configure credentials as needed:
   ```bash
   cp .env.example .env.local
   ```
2. Start the three PostgreSQL containers:
   ```bash
   docker-compose up -d
   ```
3. Install dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000).
