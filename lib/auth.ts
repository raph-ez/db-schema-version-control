import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import { NextResponse } from "next/server";
import { getPool, ENVIRONMENT_DEFAULTS } from "./database";
import { initSystemTables } from "./db";

export const isEntraConfigured = Boolean(
  process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.AZURE_AD_TENANT_ID
);

export const authOptions: NextAuthOptions = {
  providers: isEntraConfigured
    ? [
        AzureADProvider({
          clientId: process.env.AZURE_AD_CLIENT_ID as string,
          clientSecret: process.env.AZURE_AD_CLIENT_SECRET as string,
          tenantId: process.env.AZURE_AD_TENANT_ID || "common",
          authorization: {
            params: {
              prompt: "select_account",
            },
          },
        }),
      ]
    : [],
  secret:
    process.env.NEXTAUTH_SECRET || "local-dev-nextauth-secret-change-in-prod",
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      if (user?.email) {
        try {
          await initSystemTables(ENVIRONMENT_DEFAULTS.development);
          const pool = getPool(ENVIRONMENT_DEFAULTS.development);
          await pool.query(
            `INSERT INTO users (email, display_name, last_login)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (email)
             DO UPDATE SET display_name = EXCLUDED.display_name, last_login = CURRENT_TIMESTAMP;`,
            [user.email, user.name || user.email.split("@")[0]]
          );
        } catch {
          // Allow sign-in even if metadata DB container is offline
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};

export interface SessionGuardResult {
  authorized: boolean;
  user: {
    name: string;
    email: string;
    mode: "entra_id" | "local_dev";
  };
  response?: NextResponse;
}

/**
 * Enforces Microsoft Entra ID authentication on protected API endpoints (SRS FR1 & Section 4.3).
 */
export async function requireApiSession(): Promise<SessionGuardResult> {
  const session = await getServerSession(authOptions);

  if (session?.user?.email) {
    return {
      authorized: true,
      user: {
        name: session.user.name || "Authenticated Developer",
        email: session.user.email,
        mode: "entra_id",
      },
    };
  }

  const authRequired = process.env.AUTH_REQUIRED === "true";
  if (authRequired) {
    return {
      authorized: false,
      user: { name: "Guest", email: "", mode: "entra_id" },
      response: NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Microsoft Entra ID authentication required.",
        },
        { status: 401 }
      ),
    };
  }

  return {
    authorized: true,
    user: {
      name: "Local Developer",
      email: "developer@swinburne.edu.my",
      mode: "local_dev",
    },
  };
}
