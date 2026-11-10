import type { Pool } from "pg";

// Extracts tables, columns, constraints and indexes from PostgreSQL.
export async function extractSchema(pool: Pool)
{
    // --------------------------------------------------
    // 1. Extract all tables
    // --------------------------------------------------

    const tablesResult = await pool.query(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
        `
    );

    // --------------------------------------------------
    // 2. Extract all columns and their properties
    // --------------------------------------------------

    const columnsResult = await pool.query(
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
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
        `
    );

    // --------------------------------------------------
    // 3. Extract constraints
    // Includes primary keys, foreign keys, unique,
    // check and exclusion constraints.
    // --------------------------------------------------

    const constraintsResult = await pool.query(
        `
        SELECT
            tbl.relname AS table_name,
            con.conname AS constraint_name,

            -- Identify the constraint type.
            CASE con.contype
                WHEN 'p' THEN 'PRIMARY KEY'
                WHEN 'f' THEN 'FOREIGN KEY'
                WHEN 'u' THEN 'UNIQUE'
                WHEN 'c' THEN 'CHECK'
                WHEN 'x' THEN 'EXCLUSION'
            END AS constraint_type,

            -- Retrieve the SQL definition.
            pg_get_constraintdef(con.oid, true) AS definition,

            con.convalidated AS is_validated,
            con.condeferrable AS is_deferrable,
            con.condeferred AS initially_deferred,

            -- Retrieve the columns used by the constraint.
            ARRAY(
                SELECT att.attname
                FROM unnest(con.conkey)
                    WITH ORDINALITY AS key_col(attnum, ord)
                JOIN pg_attribute AS att
                    ON att.attrelid = con.conrelid
                    AND att.attnum = key_col.attnum
                ORDER BY key_col.ord
            ) AS columns,

            -- Retrieve the referenced table for foreign keys.
            CASE
                WHEN con.contype = 'f' THEN ref_tbl.relname
                ELSE NULL
            END AS referenced_table,

            -- Retrieve the referenced columns for foreign keys.
            CASE
                WHEN con.contype = 'f' THEN ARRAY(
                    SELECT att.attname
                    FROM unnest(con.confkey)
                        WITH ORDINALITY AS ref_col(attnum, ord)
                    JOIN pg_attribute AS att
                        ON att.attrelid = con.confrelid
                        AND att.attnum = ref_col.attnum
                    ORDER BY ref_col.ord
                )
                ELSE ARRAY[]::text[]
            END AS referenced_columns

        FROM pg_constraint AS con

        -- Connect each constraint to its table.
        JOIN pg_class AS tbl
            ON tbl.oid = con.conrelid

        -- Identify the table's schema.
        JOIN pg_namespace AS ns
            ON ns.oid = tbl.relnamespace

        -- Retrieve the referenced table for foreign keys.
        LEFT JOIN pg_class AS ref_tbl
            ON ref_tbl.oid = con.confrelid

        WHERE ns.nspname = 'public'
        AND con.contype IN ('p', 'f', 'u', 'c', 'x')

        ORDER BY tbl.relname, con.conname;
        `
    );

    // --------------------------------------------------
    // 4. Extract indexes
    // --------------------------------------------------

    const indexesResult = await pool.query(
        `
        SELECT
            ns.nspname AS schema_name,
            tbl.relname AS table_name,
            idx.relname AS index_name,
            pg_get_indexdef(idx.oid) AS index_definition,

            -- Identify indexes belonging to constraints.
            EXISTS
            (
                SELECT 1
                FROM pg_constraint AS con
                WHERE con.conindid = idx.oid
                AND con.contype IN ('p', 'u', 'x')
            ) AS is_constraint_index

        FROM pg_class AS idx

        -- Connect each index to its index information.
        JOIN pg_index AS ind
            ON ind.indexrelid = idx.oid

        -- Identify the table associated with the index.
        JOIN pg_class AS tbl
            ON tbl.oid = ind.indrelid

        -- Identify the table's schema.
        JOIN pg_namespace AS ns
            ON ns.oid = tbl.relnamespace

        WHERE ns.nspname = 'public'
        AND idx.relkind = 'i'

        ORDER BY tbl.relname, idx.relname;
        `
    );

    // --------------------------------------------------
    // 5. Return all extracted schema information
    // --------------------------------------------------

    return {
        tables: tablesResult.rows,
        columns: columnsResult.rows,
        constraints: constraintsResult.rows,
        indexes: indexesResult.rows
    };
}