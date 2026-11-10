
import { createDatabasePool } from "@/lib/database";
import { extractSchema } from "@/lib/schema-extractor";

// Handles requests to extract the schema of a selected database environment.
export async function POST(request: Request)
{
    let pool;

    try
    {
        // Retrieve the selected environment from the request body.
        const body = await request.json();
        const environment = body.environment;

        // Only allow the three supported database environments.
        if (
            environment !== "development" &&
            environment !== "staging" &&
            environment !== "production"
        )
        {
            return Response.json(
                {
                    success: false,
                    message: "Invalid database environment.",
                },
                { status: 400 }
            );
        }

        // Create a connection pool for the selected environment.
        pool = createDatabasePool(environment);

        // Extract the tables, columns, constraints and indexes.
        const schema = await extractSchema(pool);

        // Return the extracted schema information to the requester.
        return Response.json({
            success: true,
            environment,
            tables: schema.tables,
            columns: schema.columns,
            constraints: schema.constraints,
            indexes: schema.indexes,
        });
    }
    catch (error)
    {
        // Log the error for debugging if schema extraction fails.
        console.error("Schema extraction failed:", error);

        return Response.json(
            {
                success: false,
                message: "Could not extract the database schema.",
            },
            { status: 500 }
        );
    }
    finally
    {
        // Close the database connection pool after the request finishes.
        if (pool)
        {
            await pool.end();
        }
    }
}
