import {
  type SchemaDifference,
  formatColumnSqlDefinition,
} from "./schema-comparator";

export type ChangeType = "Major" | "Minor" | "Patch";

export interface GeneratedMigrationBundle {
  version: string;
  changeType: ChangeType;
  migrationSql: string;
  rollbackSql: string;
  statementCount: number;
}

function bumpSemVer(currentVersion: string, changeType: ChangeType): string {
  const clean = currentVersion.replace(/^v/i, "").trim();
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)$/);
  const major = match ? Number(match[1]) : 1;
  const minor = match ? Number(match[2]) : 0;
  const patch = match ? Number(match[3]) : 0;

  if (changeType === "Major") {
    return `${major + 1}.0.0`;
  }
  if (changeType === "Minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

function elevateChangeType(current: ChangeType, candidate: ChangeType): ChangeType {
  const rank: Record<ChangeType, number> = { Patch: 1, Minor: 2, Major: 3 };
  return rank[candidate] > rank[current] ? candidate : current;
}

/**
 * Generates PostgreSQL forward synchronization DDL, matching rollback DDL, and SemVer bumps
 * directly from two-way SchemaDifference[] results (SRS FR7 & FR8).
 */
export function generateMigrationScripts(
  diffs: SchemaDifference[],
  currentVersion: string = "1.0.0",
  targetSchema: string = "public"
): GeneratedMigrationBundle {
  let changeType: ChangeType = "Patch";
  const forwardStatements: string[] = [];
  const rollbackStatements: string[] = [];

  for (const diff of diffs) {
    const qualifiedTable = `"${targetSchema}"."${diff.table}"`;

    if (diff.type === "missing_table") {
      if (diff.direction === "source_only") {
        changeType = elevateChangeType(changeType, "Minor");
        const cols = diff.tableColumns || [];
        if (cols.length > 0) {
          const colDefs = cols.map(
            (c) => `  "${c.column_name}" ${formatColumnSqlDefinition(c)}`
          );
          forwardStatements.push(
            `CREATE TABLE IF NOT EXISTS ${qualifiedTable} (\n${colDefs.join(",\n")}\n);`
          );
        } else {
          forwardStatements.push(
            `CREATE TABLE IF NOT EXISTS ${qualifiedTable} (\n  id SERIAL PRIMARY KEY\n);`
          );
        }
        rollbackStatements.unshift(`DROP TABLE IF EXISTS ${qualifiedTable};`);
      } else if (diff.direction === "target_only") {
        // Destructive drop is commented by default to prevent accidental data loss
        changeType = elevateChangeType(changeType, "Major");
        forwardStatements.push(
          `-- BREAKING CHANGE REVIEW: Table "${diff.table}" exists only in Target.\n-- DROP TABLE IF EXISTS ${qualifiedTable};`
        );
        rollbackStatements.unshift(
          `-- Restore table "${diff.table}" from backup if dropped.`
        );
      }
    } else if (diff.type === "missing_column") {
      if (diff.direction === "source_only") {
        changeType = elevateChangeType(changeType, "Minor");
        const colSql = diff.columnMeta
          ? formatColumnSqlDefinition(diff.columnMeta)
          : typeof diff.source === "string"
            ? diff.source.replace(new RegExp(`^${diff.object}\s+`, "i"), "")
            : "TEXT";
        forwardStatements.push(
          `ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS "${diff.object}" ${colSql};`
        );
        rollbackStatements.unshift(
          `ALTER TABLE ${qualifiedTable} DROP COLUMN IF EXISTS "${diff.object}";`
        );
      } else if (diff.direction === "target_only") {
        changeType = elevateChangeType(changeType, "Major");
        const colSql = diff.columnMeta
          ? formatColumnSqlDefinition(diff.columnMeta)
          : "TEXT";
        forwardStatements.push(
          `-- BREAKING CHANGE REVIEW: Column "${diff.table}"."${diff.object}" exists only in Target.\n-- ALTER TABLE ${qualifiedTable} DROP COLUMN IF EXISTS "${diff.object}";`
        );
        rollbackStatements.unshift(
          `ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS "${diff.object}" ${colSql};`
        );
      }
    } else if (diff.type === "modified_column") {
      const srcDef = diff.columnMeta
        ? formatColumnSqlDefinition(diff.columnMeta)
        : String(diff.source || "TEXT");
      const tgtDef = diff.targetColumnMeta
        ? formatColumnSqlDefinition(diff.targetColumnMeta)
        : String(diff.target || "TEXT");

      const srcTypeOnly = srcDef.replace(/\s+NOT NULL.*/i, "").replace(/\s+DEFAULT.*/i, "").trim();
      const tgtTypeOnly = tgtDef.replace(/\s+NOT NULL.*/i, "").replace(/\s+DEFAULT.*/i, "").trim();

      const isNarrowingOrBreaking =
        (diff.columnMeta?.is_nullable === "NO" &&
          diff.targetColumnMeta?.is_nullable === "YES") ||
        ((diff.columnMeta?.character_maximum_length ?? 999999) <
          (diff.targetColumnMeta?.character_maximum_length ?? 0));

      changeType = elevateChangeType(
        changeType,
        isNarrowingOrBreaking ? "Major" : "Patch"
      );

      if (srcTypeOnly !== tgtTypeOnly) {
        forwardStatements.push(
          `ALTER TABLE ${qualifiedTable} ALTER COLUMN "${diff.object}" TYPE ${srcTypeOnly};`
        );
        rollbackStatements.unshift(
          `ALTER TABLE ${qualifiedTable} ALTER COLUMN "${diff.object}" TYPE ${tgtTypeOnly};`
        );
      }

      if (diff.columnMeta?.is_nullable !== diff.targetColumnMeta?.is_nullable) {
        if (diff.columnMeta?.is_nullable === "NO") {
          forwardStatements.push(
            `ALTER TABLE ${qualifiedTable} ALTER COLUMN "${diff.object}" SET NOT NULL;`
          );
          rollbackStatements.unshift(
            `ALTER TABLE ${qualifiedTable} ALTER COLUMN "${diff.object}" DROP NOT NULL;`
          );
        } else if (diff.columnMeta?.is_nullable === "YES") {
          forwardStatements.push(
            `ALTER TABLE ${qualifiedTable} ALTER COLUMN "${diff.object}" DROP NOT NULL;`
          );
          rollbackStatements.unshift(
            `ALTER TABLE ${qualifiedTable} ALTER COLUMN "${diff.object}" SET NOT NULL;`
          );
        }
      }
    } else if (diff.type === "missing_constraint") {
      if (diff.direction === "source_only" && diff.constraintMeta) {
        changeType = elevateChangeType(changeType, "Minor");
        forwardStatements.push(
          `ALTER TABLE ${qualifiedTable} ADD CONSTRAINT "${diff.object}" ${diff.constraintMeta.definition};`
        );
        rollbackStatements.unshift(
          `ALTER TABLE ${qualifiedTable} DROP CONSTRAINT IF EXISTS "${diff.object}";`
        );
      } else if (diff.direction === "target_only") {
        changeType = elevateChangeType(changeType, "Major");
        forwardStatements.push(
          `-- BREAKING CHANGE REVIEW: Constraint "${diff.object}" exists only in Target.\n-- ALTER TABLE ${qualifiedTable} DROP CONSTRAINT IF EXISTS "${diff.object}";`
        );
      }
    } else if (diff.type === "missing_index") {
      if (diff.direction === "source_only" && diff.indexMeta) {
        changeType = elevateChangeType(changeType, "Minor");
        forwardStatements.push(`${diff.indexMeta.index_definition};`);
        rollbackStatements.unshift(
          `DROP INDEX IF EXISTS "${targetSchema}"."${diff.object}";`
        );
      } else if (diff.direction === "target_only") {
        changeType = elevateChangeType(changeType, "Patch");
        forwardStatements.push(
          `-- REVIEW: Index "${diff.object}" exists only in Target.\n-- DROP INDEX IF EXISTS "${targetSchema}"."${diff.object}";`
        );
      }
    }
  }

  const nextVersion = bumpSemVer(currentVersion, changeType);

  const migrationSql =
    forwardStatements.length > 0
      ? [
          `-- ============================================================================`,
          `-- Forward Migration Script (v${currentVersion.replace(/^v/i, "")} -> v${nextVersion})`,
          `-- Change Classification: ${changeType.toUpperCase()}`,
          `-- Safety Notice: Review and approve before committing to version control.`,
          `-- ============================================================================`,
          "",
          ...forwardStatements,
        ].join("\n\n")
      : `-- No schema differences detected between Source and Target (v${currentVersion.replace(/^v/i, "")}).`;

  const rollbackSql =
    rollbackStatements.length > 0
      ? [
          `-- ============================================================================`,
          `-- Automated Rollback Script (Reverts v${nextVersion} -> v${currentVersion.replace(/^v/i, "")})`,
          `-- ============================================================================`,
          "",
          ...rollbackStatements,
        ].join("\n\n")
      : `-- No rollback statements required.`;

  return {
    version: nextVersion,
    changeType,
    migrationSql,
    rollbackSql,
    statementCount: forwardStatements.length,
  };
}
