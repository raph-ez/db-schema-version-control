// Defines the possible results when comparing schema versions.
export type VersionComparisonResult =
{
    status: "compared" | "structural_comparison_required";
    developmentVersion: string | null;
    stagingVersion: string | null;
    newerEnvironment: "Development" | "Staging" | "same" | null;
    message: string;
};

// Compares the Semantic Versioning numbers of Development and Staging.
export function compareSchemaVersions(
    developmentVersion: string | null,
    stagingVersion: string | null
): VersionComparisonResult
{
    // Version information must exist in both environments.
    if (!developmentVersion || !stagingVersion)
    {
        return {
            status: "structural_comparison_required",
            developmentVersion,
            stagingVersion,
            newerEnvironment: null,
            message: "Version information is missing. Structural comparison is required."
        };
    }

    // Validate that both versions follow the MAJOR.MINOR.PATCH format.
    const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

    const developmentMatch = developmentVersion.match(versionPattern);
    const stagingMatch = stagingVersion.match(versionPattern);

    // Reject versions that do not follow the expected format.
    if (!developmentMatch || !stagingMatch)
    {
        throw new Error("Invalid semantic version format. Expected MAJOR.MINOR.PATCH.");
    }

    // Convert the version components from strings into numbers.
    const developmentParts = developmentMatch.slice(1).map(Number);
    const stagingParts = stagingMatch.slice(1).map(Number);

    // Compare MAJOR, MINOR and PATCH numerically, starting with MAJOR.
    for (let i = 0; i < 3; i++)
    {
        // Development has a higher version component.
        if (developmentParts[i] > stagingParts[i])
        {
            return {
                status: "compared",
                developmentVersion,
                stagingVersion,
                newerEnvironment: "Development",
                message: "Development has the newer schema version."
            };
        }

        // Staging has a higher version component.
        if (developmentParts[i] < stagingParts[i])
        {
            return {
                status: "compared",
                developmentVersion,
                stagingVersion,
                newerEnvironment: "Staging",
                message: "Staging has the newer schema version."
            };
        }
    }

    // If all three components match, both environments have the same version.
    return {
        status: "compared",
        developmentVersion,
        stagingVersion,
        newerEnvironment: "same",
        message: "Both environments have the same schema version."
    };
}