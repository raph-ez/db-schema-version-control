import type { Pool } from "pg";
import { getPool } from "./database";

export interface ExtractedTable {
  table_name: string;
}

export interface ExtractedColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  ordinal_position: number;
  is_identity: string;
  identity_generation: string | null;
}

export interface ExtractedConstraint {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  definition: string;
  is_validated: boolean;
  is_deferrable: boolean;
  initially_deferred: boolean;
  columns: string[];
  referenced_table: string | null;
  referenced_columns: string[];
}

export interface ExtractedIndex {
  schema_name: string;
  table_name: string;
  index_name: string;
  index_definition: string;
  is_constraint_index: boolean;
}

export interface ExtractedSchema {
  schemaName: string;
  tables: ExtractedTable[];
  columns: ExtractedColumn[];
  constraints: ExtractedConstraint[];
  indexes: ExtractedIndex[];
}

const INTERNAL_CONTROL_TABLES = new Set([
  "users",
  "database_connections",
  "schema_migrations",
  "query_history",
  "audit_logs",
]);

function validateSchemaIdentifier(schemaName: string): string {
  const trimmed = (schemaName || "public").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new Error(`Invalid PostgreSQL schema identifier: "${schemaName}"`);
  }
  return trimmed;
}

/**
 * Extracts tables, columns, constraints, and indexes from PostgreSQL for a target schema.
 * Accepts either a pg.Pool instance or a PostgreSQL connection URI / environment alias.
 */
export async function extractSchema(
  poolOrUri: Pool | string,
  schemaName: string = "public",
  includeInternalTables: boolean = false
): Promise<ExtractedSchema> {
  const pool =
    typeof poolOrUri === "string" ? getPool(poolOrUri) : poolOrUri;
  const targetSchema = validateSchemaIdentifier(schemaName);

  // 1. Extract all base tables in target schema
  const tablesResult = await pool.query<ExtractedTable>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
    `,
    [targetSchema]
  );

  // 2. Extract all columns and properties
  const columnsResult = await pool.query<ExtractedColumn>(
    `
    SELECT
      table_name,
      column_name,
      data_type,
      udt_name,
      is_nullable,
      column_default,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      ordinal_position,
      is_identity,
      identity_generation
    FROM information_schema.columns
    WHERE table_schema = $1
    ORDER BY table_name, ordinal_position;
    `,
    [targetSchema]
  );

  // 3. Extract constraints (PK, FK, UNIQUE, CHECK, EXCLUSION)
  const constraintsResult = await pool.query<ExtractedConstraint>(
    `
    SELECT
      tbl.relname AS table_name,
      con.conname AS constraint_name,
      CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
        WHEN 'x' THEN 'EXCLUSION'
      END AS constraint_type,
      pg_get_constraintdef(con.oid, true) AS definition,
      con.convalidated AS is_validated,
      con.condeferrable AS is_deferrable,
      con.condeferred AS initially_deferred,
      ARRAY(
        SELECT att.attname
        FROM unnest(con.conkey) WITH ORDINALITY AS key_col(attnum, ord)
        JOIN pg_attribute AS att
          ON att.attrelid = con.conrelid
          AND att.attnum = key_col.attnum
        ORDER BY key_col.ord
      ) AS columns,
      CASE
        WHEN con.contype = 'f' THEN ref_tbl.relname
        ELSE NULL
      END AS referenced_table,
      CASE
        WHEN con.contype = 'f' THEN ARRAY(
          SELECT att.attname
          FROM unnest(con.confkey) WITH ORDINALITY AS ref_col(attnum, ord)
          JOIN pg_attribute AS att
            ON att.attrelid = con.confrelid
            AND att.attnum = ref_col.attnum
          ORDER BY ref_col.ord
        )
        ELSE ARRAY[]::text[]
      END AS referenced_columns
    FROM pg_constraint AS con
    JOIN pg_class AS tbl ON tbl.oid = con.conrelid
    JOIN pg_namespace AS ns ON ns.oid = tbl.relnamespace
    LEFT JOIN pg_class AS ref_tbl ON ref_tbl.oid = con.confrelid
    WHERE ns.nspname = $1
      AND con.contype IN ('p', 'f', 'u', 'c', 'x')
    ORDER BY tbl.relname, con.conname;
    `,
    [targetSchema]
  );

  // 4. Extract indexes
  const indexesResult = await pool.query<ExtractedIndex>(
    `
    SELECT
      ns.nspname AS schema_name,
      tbl.relname AS table_name,
      idx.relname AS index_name,
      pg_get_indexdef(idx.oid) AS index_definition,
      EXISTS (
        SELECT 1
        FROM pg_constraint AS con
        WHERE con.conindid = idx.oid
          AND con.contype IN ('p', 'u', 'x')
      ) AS is_constraint_index
    FROM pg_class AS idx
    JOIN pg_index AS ind ON ind.indexrelid = idx.oid
    JOIN pg_class AS tbl ON tbl.oid = ind.indrelid
    JOIN pg_namespace AS ns ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = $1
      AND idx.relkind = 'i'
    ORDER BY tbl.relname, idx.relname;
    `,
    [targetSchema]
  );

  const filterTable = (tableName: string) =>
    includeInternalTables || !INTERNAL_CONTROL_TABLES.has(tableName);

  return {
    schemaName: targetSchema,
    tables: tablesResult.rows.filter((t) => filterTable(t.table_name)),
    columns: columnsResult.rows.filter((c) => filterTable(c.table_name)),
    constraints: constraintsResult.rows.filter((c) => filterTable(c.table_name)),
    indexes: indexesResult.rows.filter((i) => filterTable(i.table_name)),
  };
}
