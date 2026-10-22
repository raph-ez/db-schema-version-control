
import { createDatabasePool } from "@/lib/database";
import { extractSchema } from "@/lib/schema-extractor";

export async function POST(request: Request)
{
    let pool;

    try
    {
        const body = await request.json();
        const environment = body.environment;

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

        pool = createDatabasePool(environment);

        const schema = await extractSchema(pool);

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
        if (pool)
        {
            await pool.end();
        }
    }
}
