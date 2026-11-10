export interface Difference {
  type: 'ADD_TABLE' | 'DROP_TABLE' | 'ADD_COLUMN' | 'DROP_COLUMN' | 'MODIFY_COLUMN';
  tableName: string;
  columnName?: string;
  dataType?: string;
}

export function generateMigrationScripts(diffs: Difference[], currentVersion: string = "1.0.0") {
  let migrationSql = "";
  let rollbackSql = "";
  let changeType: string = "Patch";

  diffs.forEach((diff) => {
    if (diff.type === 'ADD_COLUMN') {
      migrationSql += `ALTER TABLE "${diff.tableName}" ADD COLUMN "${diff.columnName}" ${diff.dataType};\n`;
      rollbackSql += `ALTER TABLE "${diff.tableName}" DROP COLUMN "${diff.columnName}";\n`;
      if (changeType !== 'Major') {
        changeType = 'Minor';
      }
    } else if (diff.type === 'DROP_COLUMN') {
      migrationSql += `ALTER TABLE "${diff.tableName}" DROP COLUMN "${diff.columnName}";\n`;
      rollbackSql += `ALTER TABLE "${diff.tableName}" ADD COLUMN "${diff.columnName}" ${diff.dataType || 'TEXT'};\n`;
      changeType = 'Major';
    } else if (diff.type === 'ADD_TABLE') {
      migrationSql += `-- TODO: Define full CREATE TABLE script for ${diff.tableName}\n`;
      rollbackSql += `DROP TABLE IF EXISTS "${diff.tableName}";\n`;
      if (changeType !== 'Major') {
        changeType = 'Minor';
      }
    }
  });

  const [major, minor, patch] = currentVersion.split('.').map(Number);
  let nextVersion = `${major}.${minor}.${patch + 1}`;
  if (changeType === 'Major') {
    nextVersion = `${major + 1}.0.0`;
  } else if (changeType === 'Minor') {
    nextVersion = `${major}.${minor + 1}.0`;
  }

  return {
    version: nextVersion,
    changeType,
    migrationSql,
    rollbackSql,
  };
}