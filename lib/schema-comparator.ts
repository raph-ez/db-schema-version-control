
interface Table
{
    table_name: string;
}

interface Column
{
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

interface Constraint
{
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

interface Index
{
    schema_name: string;
    table_name: string;
    index_name: string;
    index_definition: string;
    is_constraint_index: boolean;
}

export interface ExtractedSchema
{
    tables: Table[];
    columns: Column[];
    constraints: Constraint[];
    indexes: Index[];
}

export interface SchemaDifference
{
    type: string;
    table: string;
    object: string;
    message: string;
    development?: unknown;
    staging?: unknown;
}

export function compareSchemas(
    development: ExtractedSchema,
    staging: ExtractedSchema
): SchemaDifference[]
{
    const differences: SchemaDifference[] = [];

    function compareObjects<T>(
        developmentObjects: T[],
        stagingObjects: T[],
        getKey: (item: T) => string,
        tableName: (item: T) => string,
        objectName: (item: T) => string,
        objectType: string,
        compareFields: (keyof T)[]
    )
    {
        const developmentMap = new Map(
            developmentObjects.map((item) => [getKey(item), item])
        );

        const stagingMap = new Map(
            stagingObjects.map((item) => [getKey(item), item])
        );

        for (const [key, developmentItem] of developmentMap)
        {
            const stagingItem = stagingMap.get(key);

            if (!stagingItem)
            {
                differences.push({
                    type: `missing_${objectType}`,
                    table: tableName(developmentItem),
                    object: objectName(developmentItem),
                    message:
                        `${objectType.charAt(0).toUpperCase() + objectType.slice(1)} ` +
                        `"${tableName(developmentItem)}.${objectName(developmentItem)}" ` +
                        "exists in development but not staging.",
                    development: developmentItem,
                });

                continue;
            }

            for (const field of compareFields)
            {
                const developmentValue = developmentItem[field];
                const stagingValue = stagingItem[field];

                if (
                    JSON.stringify(developmentValue) !==
                    JSON.stringify(stagingValue)
                )
                {
                    differences.push({
                        type: `modified_${objectType}`,
                        table: tableName(developmentItem),
                        object: objectName(developmentItem),
                        message:
                            `${objectType.charAt(0).toUpperCase() + objectType.slice(1)} ` +
                            `"${tableName(developmentItem)}.${objectName(developmentItem)}" ` +
                            `has a different ${String(field)}.`,
                        development: developmentValue,
                        staging: stagingValue,
                    });
                }
            }
        }

        for (const [key, stagingItem] of stagingMap)
        {
            if (!developmentMap.has(key))
            {
                differences.push({
                    type: `missing_${objectType}`,
                    table: tableName(stagingItem),
                    object: objectName(stagingItem),
                    message:
                        `${objectType.charAt(0).toUpperCase() + objectType.slice(1)} ` +
                        `"${tableName(stagingItem)}.${objectName(stagingItem)}" ` +
                        "exists in staging but not development.",
                    staging: stagingItem,
                });
            }
        }
    }

    // Compare tables.
    const developmentTables = new Set(
        development.tables.map((table) => table.table_name)
    );

    const stagingTables = new Set(
        staging.tables.map((table) => table.table_name)
    );

    for (const table of developmentTables)
    {
        if (!stagingTables.has(table))
        {
            differences.push({
                type: "missing_table",
                table,
                object: table,
                message:
                    `Table "${table}" exists in development but not staging.`,
            });
        }
    }

    for (const table of stagingTables)
    {
        if (!developmentTables.has(table))
        {
            differences.push({
                type: "missing_table",
                table,
                object: table,
                message:
                    `Table "${table}" exists in staging but not development.`,
            });
        }
    }

    // Compare columns.
    compareObjects(
        development.columns,
        staging.columns,
        (column) => `${column.table_name}.${column.column_name}`,
        (column) => column.table_name,
        (column) => column.column_name,
        "column",
        [
            "data_type",
            "udt_name",
            "is_nullable",
            "column_default",
            "character_maximum_length",
            "numeric_precision",
            "numeric_scale",
            "ordinal_position",
            "is_identity",
            "identity_generation",
        ]
    );

    // Compare constraints and their properties.
    compareObjects(
        development.constraints,
        staging.constraints,
        (constraint) =>
            `${constraint.table_name}.${constraint.constraint_name}`,
        (constraint) => constraint.table_name,
        (constraint) => constraint.constraint_name,
        "constraint",
        [
            "constraint_type",
            "definition",
            "is_validated",
            "is_deferrable",
            "initially_deferred",
            "columns",
            "referenced_table",
            "referenced_columns",
        ]
    );

    // Compare standalone indexes only.
    // Indexes backing primary-key, unique, or exclusion constraints
    // are represented through their associated constraints instead.
    const developmentStandaloneIndexes = development.indexes.filter(
        (index) => !index.is_constraint_index
    );

    const stagingStandaloneIndexes = staging.indexes.filter(
        (index) => !index.is_constraint_index
    );

    compareObjects(
        developmentStandaloneIndexes,
        stagingStandaloneIndexes,
        (index) =>
            `${index.schema_name}.${index.table_name}.${index.index_name}`,
        (index) => index.table_name,
        (index) => index.index_name,
        "index",
        [
            "index_definition",
        ]
    );

    return differences;
}
