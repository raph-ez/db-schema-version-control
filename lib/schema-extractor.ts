import type { Pool } from "pg";

// Extracts tables, columns, constraints and indexes from a PostgreSQL database.
export async function extractSchema(pool: Pool)
{
    // Retrieve all tables inside the public schema.
    const tablesResult = await pool.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         ORDER BY table_name`
    );

    // Retrieve column properties, including data types and default values.
    const columnsResult = await pool.query(
        `SELECT
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
         ORDER BY table_name, ordinal_position`
    );

    // Retrieve database constraints from PostgreSQL's system catalog.
    const constraintsResult = await pool.query(
        `SELECT
            tbl.relname AS table_name,
            con.conname AS constraint_name,

            // Identify the type of constraint using PostgreSQL's internal codes.
            CASE con.contype
                WHEN 'p' THEN 'PRIMARY KEY'
                WHEN 'f' THEN 'FOREIGN KEY'
                WHEN 'u' THEN 'UNIQUE'
                WHEN 'c' THEN 'CHECK'
                WHEN 'x' THEN 'EXCLUSION'
            END AS constraint_type,

            // Retrieve the SQL definition of each constraint.
            pg_get_constraintdef(con.oid, true) AS definition,

            con.convalidated AS is_validated,
            con.condeferrable AS is_deferrable,
            con.condeferred AS initially_deferred,

            // Retrieve the columns involved in the constraint in their original order.
            to_json(
                ARRAY(
                    SELECT att.attname
                    FROM unnest(con.conkey)
                        WITH ORDINALITY AS key_col(attnum, ord)
                    JOIN pg_attribute AS att
                        ON att.attrelid = con.conrelid
                        AND att.attnum = key_col.attnum
                    ORDER BY key_col.ord
                )
            ) AS columns,

            // Retrieve the referenced table for foreign-key constraints.
            CASE
                WHEN con.contype = 'f' THEN ref_tbl.relname
                ELSE NULL
            END AS referenced_table,

            // Retrieve the referenced columns for foreign-key constraints.
            CASE
                WHEN con.contype = 'f' THEN to_json(
                    ARRAY(
                        SELECT att.attname
                        FROM unnest(con.confkey)
                            WITH ORDINALITY AS ref_col(attnum, ord)
                        JOIN pg_attribute AS att
                            ON att.attrelid = con.confrelid
                            AND att.attnum = ref_col.attnum
                        ORDER BY ref_col.ord
                    )
                )
                ELSE NULL
            END AS referenced_columns

         FROM pg_constraint AS con

         // Connect each constraint to its associated table.
         JOIN pg_class AS tbl
            ON tbl.oid = con.conrelid

         // Identify the schema containing the table.
         JOIN pg_namespace AS ns
            ON ns.oid = tbl.relnamespace

         // Connect foreign-key constraints to their referenced tables.
         LEFT JOIN pg_class AS ref_tbl
            ON ref_tbl.oid = con.confrelid

         WHERE ns.nspname = 'public'
         AND con.contype IN ('p', 'f', 'u', 'c', 'x')

         ORDER BY tbl.relname, con.conname`
    );

    // Retrieve indexes and identify those associated with constraints.
    const indexesResult = await pool.query(
        `SELECT
            ns.nspname AS schema_name,
            tbl.relname AS table_name,
            idx.relname AS index_name,
            pg_get_indexdef(idx.oid) AS index_definition,

            // Check whether the index belongs to a primary-key, unique or exclusion constraint.
            EXISTS (
                SELECT 1
                FROM pg_constraint AS con
                WHERE con.conindid = idx.oid
                AND con.contype IN ('p', 'u', 'x')
            ) AS is_constraint_index

         FROM pg_class AS idx

         // Connect each index to its PostgreSQL index information.
         JOIN pg_index AS ind
            ON ind.indexrelid = idx.oid

         // Identify the table associated with the index.
         JOIN pg_class AS tbl
            ON tbl.oid = ind.indrelid

         // Identify the schema containing the table.
         JOIN pg_namespace AS ns
            ON ns.oid = tbl.relnamespace

         WHERE ns.nspname = 'public'
         AND idx.relkind = 'i'

         ORDER BY tbl.relname, idx.relname`
    );

    // Return the extracted schema information in a consistent structure.
    return {
        tables: tablesResult.rows,
        columns: columnsResult.rows,

        // Ensure constraint column properties are returned as arrays.
        constraints: constraintsResult.rows.map((constraint) => ({
            ...constraint,

            columns: Array.isArray(constraint.columns)
                ? constraint.columns
                : [],

            referenced_columns: Array.isArray(
                constraint.referenced_columns
            )
                ? constraint.referenced_columns
                : [],
        })),

        indexes: indexesResult.rows,
    };
}