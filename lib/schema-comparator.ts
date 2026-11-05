// Stores the name of each table extracted from the database.
interface Table
{
    table_name: string;
}

// Stores the properties of each column in a table.
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

// Stores constraint information, including primary keys and foreign keys.
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

// Stores index information extracted from the database.
interface Index
{
    schema_name: string;
    table_name: string;
    index_name: string;
    index_definition: string;
    is_constraint_index: boolean;
}

// Defines the complete database schema information used for comparison.
export interface ExtractedSchema
{
    tables: Table[];
    columns: Column[];
    constraints: Constraint[];
    indexes: Index[];
}

// Defines the information returned when a difference is detected.
export interface SchemaDifference
{
    type: string;
    table: string;
    object: string;
    message: string;
    development?: unknown;
    staging?: unknown;
}

// Compares the database schemas from Development and Staging.
export function compareSchemas(
    development: ExtractedSchema,
    staging: ExtractedSchema
): SchemaDifference[]
{
    // Stores all differences found between the two environments.
    const differences: SchemaDifference[] = [];

    // Reusable function for comparing columns, constraints and indexes.
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
        // Convert Development objects into a Map for faster lookup.
        const developmentMap = new Map(
            developmentObjects.map((item) => [getKey(item), item])
        );

        // Convert Staging objects into a Map for faster lookup.
        const stagingMap = new Map(
            stagingObjects.map((item) => [getKey(item), item])
        );

        // Check whether each Development object exists in Staging.
        for (const [key, developmentItem] of developmentMap)
        {
            const stagingItem = stagingMap.get(key);

            // Report an object that exists in Development but not Staging.
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

            // Compare the selected properties when the object exists in both environments.
            for (const field of compareFields)
            {
                const developmentValue = developmentItem[field];
                const stagingValue = stagingItem[field];

                // Detect changes by comparing the values from both environments.
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

        // Check whether Staging contains objects missing from Development.
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

    // Compare tables by collecting their names into Sets.
    const developmentTables = new Set(
        development.tables.map((table) => table.table_name)
    );

    const stagingTables = new Set(
        staging.tables.map((table) => table.table_name)
    );

    // Find tables that exist in Development but not Staging.
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

    // Find tables that exist in Staging but not Development.
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

    // Compare columns using their table and column names as unique identifiers.
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

    // Compare constraints using their table and constraint names.
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

    // Exclude indexes that are already represented by their associated constraints.
    // This prevents primary-key, unique and exclusion indexes from being counted twice.
    const developmentStandaloneIndexes = development.indexes.filter(
        (index) => !index.is_constraint_index
    );

    const stagingStandaloneIndexes = staging.indexes.filter(
        (index) => !index.is_constraint_index
    );

    // Compare standalone indexes using their schema, table and index names.
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

    // Return the complete list of detected schema differences.
    return differences;
}