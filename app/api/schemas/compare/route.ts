
import { createDatabasePool } from "@/lib/database";
import { extractSchema } from "@/lib/schema-extractor";
import {
    compareSchemas,
    type ExtractedSchema,
} from "@/lib/schema-comparator";

type Environment = "development" | "staging" | "production";

function isEnvironment(value: unknown): value is Environment
{
    return (
        value === "development" ||
        value === "staging" ||
        value === "production"
    );
}

export async function POST(request: Request)
{
    let developmentPool;
    let stagingPool;

    try
    {
        const body = await request.json();

        if (
            !isEnvironment(body.development) ||
            !isEnvironment(body.staging)
        )
        {
            return Response.json(
                {
                    success: false,
                    message:
                        "Choose valid development and staging environments.",
                },
                { status: 400 }
            );
        }

        developmentPool = createDatabasePool(body.development);
        stagingPool = createDatabasePool(body.staging);

        const developmentSchema: ExtractedSchema =
            await extractSchema(developmentPool);

        const stagingSchema: ExtractedSchema =
            await extractSchema(stagingPool);

        const differences = compareSchemas(
            developmentSchema,
            stagingSchema
        );

        return Response.json({
            success: true,
            compared: {
                development: body.development,
                staging: body.staging,
            },
            differenceCount: differences.length,
            differences,
        });
    }
    catch (error)
    {
        console.error("Schema comparison failed:", error);

        return Response.json(
            {
                success: false,
                message: "Could not compare the database schemas.",
            },
            { status: 500 }
        );
    }
    finally
    {
        if (developmentPool)
        {
            await developmentPool.end();
        }

        if (stagingPool)
        {
            await stagingPool.end();
        }
    }
}
