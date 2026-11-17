import type {
  ExtractedSchema,
  ExtractedColumn,
  ExtractedConstraint,
  ExtractedIndex,
} from "./schema-extractor";

export interface SchemaDifference {
  type:
    | "missing_table"
    | "missing_column"
    | "modified_column"
    | "missing_constraint"
    | "modified_constraint"
    | "missing_index"
    | "modified_index"
    | string;
  direction: "source_only" | "target_only" | "modified";
  table: string;
  object: string;
  field?: string;
  message: string;
  source?: unknown;
  target?: unknown;
  // Backward-compatible aliases used by existing UI cards
  development?: unknown;
  staging?: unknown;
  // Structured metadata for SQL DDL generation
  columnMeta?: ExtractedColumn;
  targetColumnMeta?: ExtractedColumn;
  tableColumns?: ExtractedColumn[];
  constraintMeta?: ExtractedConstraint;
  indexMeta?: ExtractedIndex;
}

export function formatColumnSqlDefinition(col: ExtractedColumn): string {
  let typePart = col.udt_name || col.data_type;

  if (
    (col.data_type === "character varying" || col.udt_name === "varchar") &&
    col.character_maximum_length
  ) {
    typePart = `VARCHAR(${col.character_maximum_length})`;
  } else if (
    (col.data_type === "character" || col.udt_name === "bpchar") &&
    col.character_maximum_length
  ) {
    typePart = `CHAR(${col.character_maximum_length})`;
  } else if (col.data_type === "numeric" && col.numeric_precision) {
    typePart = col.numeric_scale
      ? `NUMERIC(${col.numeric_precision}, ${col.numeric_scale})`
      : `NUMERIC(${col.numeric_precision})`;
  } else if (col.data_type === "integer" || col.udt_name === "int4") {
    typePart = "INTEGER";
  } else if (col.data_type === "bigint" || col.udt_name === "int8") {
    typePart = "BIGINT";
  } else if (col.data_type === "boolean" || col.udt_name === "bool") {
    typePart = "BOOLEAN";
  } else if (col.data_type === "text") {
    typePart = "TEXT";
  } else if (col.data_type.includes("timestamp")) {
    typePart = "TIMESTAMP";
  } else {
    typePart = col.data_type.toUpperCase();
  }

  const parts = [typePart];
  if (col.is_nullable === "NO") {
    parts.push("NOT NULL");
  }
  if (col.column_default !== null && col.column_default !== undefined) {
    parts.push(`DEFAULT ${col.column_default}`);
  }
  return parts.join(" ");
}

/**
 * Performs a comprehensive two-way structural comparison between Source and Target schemas (SRS FR4 & FR6).
 */
export function compareSchemas(
  source: ExtractedSchema,
  target: ExtractedSchema,
  sourceLabel: string = "Source",
  targetLabel: string = "Target"
): SchemaDifference[] {
  const differences: SchemaDifference[] = [];

  const sourceTables = new Set(source.tables.map((t) => t.table_name));
  const targetTables = new Set(target.tables.map((t) => t.table_name));

  // 1. Compare Tables (two-way)
  for (const table of sourceTables) {
    if (!targetTables.has(table)) {
      const tableCols = source.columns.filter((c) => c.table_name === table);
      differences.push({
        type: "missing_table",
        direction: "source_only",
        table,
        object: table,
        message: `Table "${table}" exists in ${sourceLabel} but is missing in ${targetLabel}.`,
        source: `${table} (${tableCols.length} columns)`,
        target: undefined,
        development: `${table} (${tableCols.length} columns)`,
        staging: undefined,
        tableColumns: tableCols,
      });
    }
  }

  for (const table of targetTables) {
    if (!sourceTables.has(table)) {
      const tableCols = target.columns.filter((c) => c.table_name === table);
      differences.push({
        type: "missing_table",
        direction: "target_only",
        table,
        object: table,
        message: `Table "${table}" exists in ${targetLabel} but is missing in ${sourceLabel}.`,
        source: undefined,
        target: `${table} (${tableCols.length} columns)`,
        development: undefined,
        staging: `${table} (${tableCols.length} columns)`,
        tableColumns: tableCols,
      });
    }
  }

  // 2. Compare Columns (only on tables present in both environments to avoid duplicate noise)
  const sharedTables = new Set(
    [...sourceTables].filter((table) => targetTables.has(table))
  );

  const sourceColMap = new Map(
    source.columns
      .filter((c) => sharedTables.has(c.table_name))
      .map((c) => [`${c.table_name}.${c.column_name}`, c])
  );
  const targetColMap = new Map(
    target.columns
      .filter((c) => sharedTables.has(c.table_name))
      .map((c) => [`${c.table_name}.${c.column_name}`, c])
  );

  const comparedColumnFields: (keyof ExtractedColumn)[] = [
    "data_type",
    "udt_name",
    "is_nullable",
    "column_default",
    "character_maximum_length",
    "numeric_precision",
    "numeric_scale",
    "is_identity",
    "identity_generation",
  ];

  for (const [key, srcCol] of sourceColMap) {
    const tgtCol = targetColMap.get(key);
    if (!tgtCol) {
      const sig = `${srcCol.column_name} ${formatColumnSqlDefinition(srcCol)}`;
      differences.push({
        type: "missing_column",
        direction: "source_only",
        table: srcCol.table_name,
        object: srcCol.column_name,
        message: `Column "${srcCol.table_name}.${srcCol.column_name}" exists in ${sourceLabel} but is missing in ${targetLabel}.`,
        source: sig,
        target: undefined,
        development: sig,
        staging: undefined,
        columnMeta: srcCol,
      });
      continue;
    }

    for (const field of comparedColumnFields) {
      if (JSON.stringify(srcCol[field]) !== JSON.stringify(tgtCol[field])) {
        const srcSig = formatColumnSqlDefinition(srcCol);
        const tgtSig = formatColumnSqlDefinition(tgtCol);
        differences.push({
          type: "modified_column",
          direction: "modified",
          table: srcCol.table_name,
          object: srcCol.column_name,
          field: String(field),
          message: `Column "${srcCol.table_name}.${srcCol.column_name}" has a different ${String(field)} (${srcSig} vs ${tgtSig}).`,
          source: srcSig,
          target: tgtSig,
          development: srcSig,
          staging: tgtSig,
          columnMeta: srcCol,
          targetColumnMeta: tgtCol,
        });
        break;
      }
    }
  }

  for (const [key, tgtCol] of targetColMap) {
    if (!sourceColMap.has(key)) {
      const sig = `${tgtCol.column_name} ${formatColumnSqlDefinition(tgtCol)}`;
      differences.push({
        type: "missing_column",
        direction: "target_only",
        table: tgtCol.table_name,
        object: tgtCol.column_name,
        message: `Column "${tgtCol.table_name}.${tgtCol.column_name}" exists in ${targetLabel} but is missing in ${sourceLabel}.`,
        source: undefined,
        target: sig,
        development: undefined,
        staging: sig,
        columnMeta: tgtCol,
      });
    }
  }

  // 3. Compare Constraints on shared tables
  const sourceConMap = new Map(
    source.constraints
      .filter((c) => sharedTables.has(c.table_name))
      .map((c) => [`${c.table_name}.${c.constraint_name}`, c])
  );
  const targetConMap = new Map(
    target.constraints
      .filter((c) => sharedTables.has(c.table_name))
      .map((c) => [`${c.table_name}.${c.constraint_name}`, c])
  );

  for (const [key, srcCon] of sourceConMap) {
    const tgtCon = targetConMap.get(key);
    if (!tgtCon) {
      differences.push({
        type: "missing_constraint",
        direction: "source_only",
        table: srcCon.table_name,
        object: srcCon.constraint_name,
        message: `Constraint "${srcCon.table_name}.${srcCon.constraint_name}" (${srcCon.constraint_type}) exists in ${sourceLabel} but is missing in ${targetLabel}.`,
        source: srcCon.definition,
        target: undefined,
        development: srcCon.definition,
        staging: undefined,
        constraintMeta: srcCon,
      });
    } else if (srcCon.definition !== tgtCon.definition) {
      differences.push({
        type: "modified_constraint",
        direction: "modified",
        table: srcCon.table_name,
        object: srcCon.constraint_name,
        message: `Constraint "${srcCon.table_name}.${srcCon.constraint_name}" definition differs between ${sourceLabel} and ${targetLabel}.`,
        source: srcCon.definition,
        target: tgtCon.definition,
        development: srcCon.definition,
        staging: tgtCon.definition,
        constraintMeta: srcCon,
      });
    }
  }

  for (const [key, tgtCon] of targetConMap) {
    if (!sourceConMap.has(key)) {
      differences.push({
        type: "missing_constraint",
        direction: "target_only",
        table: tgtCon.table_name,
        object: tgtCon.constraint_name,
        message: `Constraint "${tgtCon.table_name}.${tgtCon.constraint_name}" (${tgtCon.constraint_type}) exists in ${targetLabel} but is missing in ${sourceLabel}.`,
        source: undefined,
        target: tgtCon.definition,
        development: undefined,
        staging: tgtCon.definition,
        constraintMeta: tgtCon,
      });
    }
  }

  // 4. Compare Standalone Indexes on shared tables
  const sourceIdxMap = new Map(
    source.indexes
      .filter((i) => !i.is_constraint_index && sharedTables.has(i.table_name))
      .map((i) => [`${i.table_name}.${i.index_name}`, i])
  );
  const targetIdxMap = new Map(
    target.indexes
      .filter((i) => !i.is_constraint_index && sharedTables.has(i.table_name))
      .map((i) => [`${i.table_name}.${i.index_name}`, i])
  );

  for (const [key, srcIdx] of sourceIdxMap) {
    const tgtIdx = targetIdxMap.get(key);
    if (!tgtIdx) {
      differences.push({
        type: "missing_index",
        direction: "source_only",
        table: srcIdx.table_name,
        object: srcIdx.index_name,
        message: `Index "${srcIdx.index_name}" on "${srcIdx.table_name}" exists in ${sourceLabel} but is missing in ${targetLabel}.`,
        source: srcIdx.index_definition,
        target: undefined,
        development: srcIdx.index_definition,
        staging: undefined,
        indexMeta: srcIdx,
      });
    } else if (srcIdx.index_definition !== tgtIdx.index_definition) {
      differences.push({
        type: "modified_index",
        direction: "modified",
        table: srcIdx.table_name,
        object: srcIdx.index_name,
        message: `Index "${srcIdx.index_name}" on "${srcIdx.table_name}" has a modified definition.`,
        source: srcIdx.index_definition,
        target: tgtIdx.index_definition,
        development: srcIdx.index_definition,
        staging: tgtIdx.index_definition,
        indexMeta: srcIdx,
      });
    }
  }

  for (const [key, tgtIdx] of targetIdxMap) {
    if (!sourceIdxMap.has(key)) {
      differences.push({
        type: "missing_index",
        direction: "target_only",
        table: tgtIdx.table_name,
        object: tgtIdx.index_name,
        message: `Index "${tgtIdx.index_name}" on "${tgtIdx.table_name}" exists in ${targetLabel} but is missing in ${sourceLabel}.`,
        source: undefined,
        target: tgtIdx.index_definition,
        development: undefined,
        staging: tgtIdx.index_definition,
        indexMeta: tgtIdx,
      });
    }
  }

  return differences;
}
