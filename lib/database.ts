import { Pool } from "pg";

const pools: { [key: string]: Pool } = {};

export function getPool(connectionString: string): Pool {
  if (!pools[connectionString]) {
    pools[connectionString] = new Pool({
      connectionString,
    });
  }
  return pools[connectionString];
}

// Alias so existing schema comparison modules work seamlessly alongside getPool
export const createDatabasePool = getPool;

export async function testConnection(connectionString: string): Promise<boolean> {
  try {
    const pool = getPool(connectionString);
    const client = await pool.connect();
    client.release();
    return true;
  } catch (error) {
    console.error("Database connection error:", error);
    return false;
  }
}