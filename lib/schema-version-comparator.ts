export type VersionComparisonResult = {
  status: "compared" | "structural_comparison_required";
  developmentVersion: string | null;
  stagingVersion: string | null;
  newerEnvironment: "Development" | "Staging" | "same" | null;
  message: string;
};

/**
 * Compares Semantic Versioning numbers (MAJOR.MINOR.PATCH) across two environments (SRS FR5).
 */
export function compareSchemaVersions(
  developmentVersion: string | null,
  stagingVersion: string | null,
  sourceLabel: string = "Development",
  targetLabel: string = "Staging"
): VersionComparisonResult {
  if (!developmentVersion || !stagingVersion) {
    return {
      status: "structural_comparison_required",
      developmentVersion,
      stagingVersion,
      newerEnvironment: null,
      message: "Version information is missing. Structural comparison is required.",
    };
  }

  const versionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

  const developmentMatch = developmentVersion.trim().match(versionPattern);
  const stagingMatch = stagingVersion.trim().match(versionPattern);

  if (!developmentMatch || !stagingMatch) {
    throw new Error(
      "Invalid semantic version format. Expected MAJOR.MINOR.PATCH (e.g., 1.2.0)."
    );
  }

  const developmentParts = developmentMatch.slice(1).map(Number);
  const stagingParts = stagingMatch.slice(1).map(Number);

  for (let i = 0; i < 3; i++) {
    if (developmentParts[i] > stagingParts[i]) {
      return {
        status: "compared",
        developmentVersion,
        stagingVersion,
        newerEnvironment: "Development",
        message: `${sourceLabel} (v${developmentVersion.replace(/^v/, "")}) has the newer schema version over ${targetLabel} (v${stagingVersion.replace(/^v/, "")}).`,
      };
    }

    if (developmentParts[i] < stagingParts[i]) {
      return {
        status: "compared",
        developmentVersion,
        stagingVersion,
        newerEnvironment: "Staging",
        message: `${targetLabel} (v${stagingVersion.replace(/^v/, "")}) has the newer schema version over ${sourceLabel} (v${developmentVersion.replace(/^v/, "")}).`,
      };
    }
  }

  return {
    status: "compared",
    developmentVersion,
    stagingVersion,
    newerEnvironment: "same",
    message: `Both ${sourceLabel} and ${targetLabel} are on the same schema version (v${developmentVersion.replace(/^v/, "")}).`,
  };
}
