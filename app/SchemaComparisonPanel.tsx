"use client";

import { useMemo, useState, type ReactNode } from "react";

type Difference = {
    type: string;
    table: string;
    object: string;
    message: string;
    development?: unknown;
    staging?: unknown;
};

type CompareResponse = {
    success: boolean;
    compared?: {
        source: string;
        target: string;
    };
    differenceCount?: number;
    differences?: Difference[];
    message?: string;
    details?: string;
};

type VersionEnvironment = {
    environment: string;
    hasVersionTable: boolean;
    version: string | null;
};

type VersionResponse = {
    success: boolean;
    development?: VersionEnvironment;
    staging?: VersionEnvironment;
    comparison?: {
        status: "compared" | "structural_comparison_required";
        developmentVersion: string | null;
        stagingVersion: string | null;
        newerEnvironment: "Development" | "Staging" | "same" | null;
        message: string;
    };
    structuralComparison?: {
        performed: boolean;
        differenceCount?: number;
        differences?: Difference[];
        message?: string;
    };
    message?: string;
};

type SchemaComparisonPanelProps = {
    sourceUri?: string;
    targetUri?: string;
    sourceSchema?: string;
    targetSchema?: string;
};

const panelClass = "rounded-xl border border-slate-800 bg-slate-900";
const primaryButtonClass = "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700";

function formatValue(value: unknown): string {
    if (value === undefined) return "Not present";
    if (value === null) return "NULL";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    return JSON.stringify(value, null, 2) ?? String(value);
}

function differenceLabel(type: string): string {
    return type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function differenceCategory(type: string): string {
    if (type.includes("table")) return "Tables";
    if (type.includes("column")) return "Columns";
    if (type.includes("constraint")) return "Constraints";
    if (type.includes("index")) return "Indexes";

    return "Other";
}

function StatusPill({
    children,
    tone = "slate",
}: {
    children: ReactNode;
    tone?: "green" | "red" | "amber" | "indigo" | "slate";
}) {
    const tones = {
        green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        red: "border-rose-500/30 bg-rose-500/10 text-rose-300",
        amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
        slate: "border-slate-700 bg-slate-800 text-slate-300",
    };

    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>
            {children}
        </span>
    );
}

function EnvironmentCard({
    environment,
}: {
    environment: VersionEnvironment;
}) {
    const tableExists = environment.hasVersionTable;
    const versionRetrieved = Boolean(environment.version);

    const detectionStatus = !tableExists
        ? {
            label: "Not detected",
            tone: "red" as const,
            description: "The public.schema_version table does not exist.",
        }
        : {
            label: "Detected",
            tone: "green" as const,
            description: "The public.schema_version table exists.",
        };

    const retrievalStatus = !tableExists
        ? {
            label: "Not available",
            tone: "slate" as const,
            description: "A version cannot be retrieved because the table is missing.",
        }
        : versionRetrieved
            ? {
                label: "Retrieved",
                tone: "green" as const,
                description: "The latest version record was retrieved successfully.",
            }
            : {
                label: "No records",
                tone: "amber" as const,
                description: "The table exists, but it does not contain any version records.",
            };

    return (
        <div className={`${panelClass} p-5`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Environment
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-100">
                        {environment.environment}
                    </h3>
                </div>

                <StatusPill tone={detectionStatus.tone}>
                    {detectionStatus.label}
                </StatusPill>
            </div>

            <div className="mt-5 border-t border-slate-800 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        1. Version table detection
                    </p>
                    <StatusPill tone={detectionStatus.tone}>
                        {detectionStatus.label}
                    </StatusPill>
                </div>

                <p className="mt-2 font-mono text-sm text-slate-200">
                    public.schema_version
                </p>

                <p className="mt-1 text-xs text-slate-500">
                    {detectionStatus.description}
                </p>
            </div>

            <div className="mt-4 border-t border-slate-800 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        2. Version retrieval
                    </p>
                    <StatusPill tone={retrievalStatus.tone}>
                        {retrievalStatus.label}
                    </StatusPill>
                </div>

                <p className={`mt-2 font-mono text-3xl font-bold tracking-tight ${versionRetrieved ? "text-indigo-300" : "text-slate-500"}`}>
                    {versionRetrieved ? `v${environment.version}` : "N/A"}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                    {retrievalStatus.description}
                </p>
            </div>
        </div>
    );
}

function DifferenceCard({
    difference,
}: {
    difference: Difference;
}) {
    const [expanded, setExpanded] = useState(false);

    const isModified = difference.type.startsWith("modified_");

    const developmentValue = formatValue(difference.development);
    const stagingValue = formatValue(difference.staging);

    return (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70">
            <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-slate-900"
            >
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={isModified ? "amber" : "indigo"}>
                            {differenceLabel(difference.type)}
                        </StatusPill>

                        <span className="truncate font-mono text-sm font-semibold text-slate-200">
                            {difference.table}
                        </span>

                        {difference.object && difference.object !== difference.table && (
                            <span className="truncate text-xs text-slate-400">
                                / {difference.object}
                            </span>
                        )}
                    </div>

                    <p className="mt-1.5 text-xs text-slate-400">
                        {difference.message}
                    </p>
                </div>

                <span className="shrink-0 text-xs text-slate-500">
                    {expanded ? "Hide details −" : "View details +"}
                </span>
            </button>

            {expanded && (
                <div className="grid gap-3 border-t border-slate-800 p-4 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                            Development
                        </p>

                        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-300">
                            {developmentValue}
                        </pre>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                            Staging
                        </p>

                        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-300">
                            {stagingValue}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SchemaComparisonPanel({
    sourceUri = "postgresql://root:password@127.0.0.1:5432/staging_schema",
    targetUri = "postgresql://root:password@127.0.0.1:5433/prod_schema",
    sourceSchema = "public",
    targetSchema = "public",
}: SchemaComparisonPanelProps) {
    const [activeView, setActiveView] = useState<"comparison" | "versions">("comparison");

    const [comparisonLoading, setComparisonLoading] = useState(false);
    const [versionLoading, setVersionLoading] = useState(false);

    const [comparisonResult, setComparisonResult] = useState<CompareResponse | null>(null);
    const [versionResult, setVersionResult] = useState<VersionResponse | null>(null);

    const [comparisonError, setComparisonError] = useState("");
    const [versionError, setVersionError] = useState("");

    const [filter, setFilter] = useState("All");

    const differences = useMemo(
        () => comparisonResult?.differences ?? [],
        [comparisonResult]
    );

    const categories = [
        "All",
        "Tables",
        "Columns",
        "Constraints",
        "Indexes",
        "Other",
    ];

    const filteredDifferences = useMemo(
        () =>
            filter === "All"
                ? differences
                : differences.filter(
                    (item) => differenceCategory(item.type) === filter
                ),
        [differences, filter]
    );

    const counts = useMemo(
        () => ({
            tables: differences.filter((item) => item.type.includes("table")).length,
            columns: differences.filter((item) => item.type.includes("column")).length,
            constraints: differences.filter((item) => item.type.includes("constraint")).length,
            indexes: differences.filter((item) => item.type.includes("index")).length,
        }),
        [differences]
    );

   async function runComparison() {
        setComparisonLoading(true);
        setComparisonError("");

        try {
            const response = await fetch("/api/schemas/compare", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sourceUri,
                    targetUri,
                    development: sourceUri,
                    staging: targetUri,
                    sourceSchema,
                    targetSchema,
                }),
            });

            const data: CompareResponse = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || data.details || "Schema comparison failed."
                );
            }

            setComparisonResult(data);
            setFilter("All");
        } catch (error) {
            setComparisonError(
                error instanceof Error
                    ? error.message
                    : "Unable to compare schemas."
            );
        } finally {
            setComparisonLoading(false);
        }
    }

async function detectVersions() {
        setVersionLoading(true);
        setVersionError("");

        try {
            const response = await fetch("/api/schemas/version", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sourceUri,
                    targetUri,
                    development: sourceUri,
                    staging: targetUri,
                    sourceSchema,
                    targetSchema,
                }),
            });

            const data: VersionResponse = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Version detection failed.");
            }

            setVersionResult(data);
        } catch (error) {
            setVersionError(
                error instanceof Error
                    ? error.message
                    : "Unable to detect schema versions."
            );
        } finally {
            setVersionLoading(false);
        }
    }
    
    async function copyDifferences() {
        const text = differences
            .map((item) => `${item.type}: ${item.message}`)
            .join("\n");

        try {
            await navigator.clipboard.writeText(text);
        } catch {
            setComparisonError("Clipboard access was blocked by the browser.");
        }
    }

    const versionComparison = versionResult?.comparison;

    const structuralDifferences =
        versionResult?.structuralComparison?.differences ?? [];

    return (
        <section className="space-y-6">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-400">
                        Database tools / Schema management
                    </p>

                    <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-100">
                        Schema Comparison & Version Detection
                    </h2>

                    <p className="mt-1 max-w-2xl text-sm text-slate-400">
                        Compare database structures and identify which environment contains the newer schema version.
                    </p>
                </div>

                <div className="flex w-fit rounded-lg border border-slate-800 bg-slate-900 p-1">
                    <button
                        type="button"
                        onClick={() => setActiveView("comparison")}
                        className={`rounded-md px-3 py-2 text-xs font-semibold transition ${activeView === "comparison" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                        Schema Comparison
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveView("versions")}
                        className={`rounded-md px-3 py-2 text-xs font-semibold transition ${activeView === "versions" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                        Version Detection
                    </button>
                </div>
            </div>

            {activeView === "comparison" && (
                <div className="space-y-5">
                    <div className={`${panelClass} flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center`}>
                        <div>
                            <h3 className="font-semibold text-slate-100">
                                Compare environments
                            </h3>

                            <p className="mt-1 text-xs text-slate-400">
                                The comparison uses the dynamic environment selection configured in your control center.
                            </p>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <StatusPill tone="indigo">{sourceSchema} ({sourceUri.split("@")[1] || "source"})</StatusPill>

                                <span className="text-xs text-slate-600">
                                    compared with
                                </span>

                                <StatusPill tone="amber">{targetSchema} ({targetUri.split("@")[1] || "target"})</StatusPill>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={runComparison}
                            disabled={comparisonLoading}
                            className={primaryButtonClass}
                        >
                            {comparisonLoading
                                ? "Comparing schemas…"
                                : "Run Schema Comparison"}
                        </button>
                    </div>

                    {comparisonError && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
                            {comparisonError}
                        </div>
                    )}

                    {!comparisonResult && !comparisonLoading && (
                        <div className={`${panelClass} flex flex-col items-center justify-center px-6 py-14 text-center`}>
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-2xl">
                                ⇄
                            </div>

                            <h3 className="font-semibold text-slate-200">
                                Ready to compare schemas
                            </h3>

                            <p className="mt-2 max-w-md text-sm text-slate-400">
                                Run a comparison to retrieve differences in tables, columns, constraints, and indexes from your connected databases.
                            </p>
                        </div>
                    )}

                    {comparisonLoading && (
                        <div className={`${panelClass} p-10 text-center text-sm text-slate-400`}>
                            Extracting and comparing database schemas…
                        </div>
                    )}

                    {comparisonResult && !comparisonLoading && (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <div className={`${panelClass} p-4`}>
                                    <p className="text-xs text-slate-500">
                                        Total differences
                                    </p>

                                    <p className="mt-2 text-3xl font-bold text-slate-100">
                                        {comparisonResult.differenceCount ?? differences.length}
                                    </p>

                                    <p className="mt-1 text-xs text-slate-500">
                                        Detected between environments
                                    </p>
                                </div>

                                {([
                                    ["Tables", counts.tables],
                                    ["Columns", counts.columns],
                                    ["Constraints", counts.constraints],
                                    ["Indexes", counts.indexes],
                                ] as [string, number][]).map(([label, count]) => (
                                    <div key={label} className={`${panelClass} p-4`}>
                                        <p className="text-xs text-slate-500">
                                            {label}
                                        </p>

                                        <p className="mt-2 text-3xl font-bold text-slate-100">
                                            {count}
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                            Differences detected
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className={`${panelClass} overflow-hidden`}>
                                <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center">
                                    <div>
                                        <h3 className="font-semibold text-slate-100">
                                            Difference report
                                        </h3>

                                        <p className="mt-1 text-xs text-slate-400">
                                            Each result describes an object that is missing or has different properties.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={copyDifferences}
                                            disabled={differences.length === 0}
                                            className={secondaryButtonClass}
                                        >
                                            Copy report
                                        </button>

                                        <StatusPill tone={differences.length === 0 ? "green" : "amber"}>
                                            {differences.length === 0
                                                ? "Schemas match"
                                                : `${differences.length} differences`}
                                        </StatusPill>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 border-b border-slate-800 px-5 py-3">
                                    {categories.map((category) => (
                                        <button
                                            key={category}
                                            type="button"
                                            onClick={() => setFilter(category)}
                                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${filter === category ? "bg-indigo-600 text-white" : "border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"}`}
                                        >
                                            {category}
                                            {category === "All"
                                                ? ` (${differences.length})`
                                                : ` (${category === "Tables"
                                                    ? counts.tables
                                                    : category === "Columns"
                                                        ? counts.columns
                                                        : category === "Constraints"
                                                            ? counts.constraints
                                                            : category === "Indexes"
                                                                ? counts.indexes
                                                                : differences.filter((item) => differenceCategory(item.type) === "Other").length
                                                })`}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-2 p-4">
                                    {filteredDifferences.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-slate-800 px-4 py-10 text-center">
                                            <p className="text-sm font-medium text-slate-300">
                                                {differences.length === 0
                                                    ? "No schema differences found"
                                                    : "No results in this category"}
                                            </p>

                                            <p className="mt-1 text-xs text-slate-500">
                                                {differences.length === 0
                                                    ? "Development and Staging have matching structures according to this comparison."
                                                    : "Choose another filter to view the remaining differences."}
                                            </p>
                                        </div>
                                    ) : (
                                        filteredDifferences.map((difference, index) => (
                                            <DifferenceCard
                                                key={`${difference.type}-${difference.table}-${difference.object}-${index}`}
                                                difference={difference}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeView === "versions" && (
                <div className="space-y-5">
                    <div className={`${panelClass} flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center`}>
                        <div>
                            <h3 className="font-semibold text-slate-100">
                                Schema version detection
                            </h3>

                            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
                                Checks each environment for the public.schema_version table, retrieves its latest version, and compares both versions when available.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={detectVersions}
                            disabled={versionLoading}
                            className={primaryButtonClass}
                        >
                            {versionLoading
                                ? "Detecting versions…"
                                : "Detect Schema Versions"}
                        </button>
                    </div>

                    {versionError && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
                            {versionError}
                        </div>
                    )}

                    {!versionResult && !versionLoading && (
                        <div className={`${panelClass} flex flex-col items-center justify-center px-6 py-14 text-center`}>
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-2xl">
                                #
                            </div>

                            <h3 className="font-semibold text-slate-200">
                                No version check has been run
                            </h3>

                            <p className="mt-2 max-w-md text-sm text-slate-400">
                                Detect the version tables to see the current version in each environment and determine which schema is newer.
                            </p>
                        </div>
                    )}

                    {versionLoading && (
                        <div className={`${panelClass} p-10 text-center text-sm text-slate-400`}>
                            Checking version tables and comparing schema versions…
                        </div>
                    )}

                    {versionResult && !versionLoading && versionResult.development && versionResult.staging && (
                        <>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <EnvironmentCard environment={versionResult.development} />
                                <EnvironmentCard environment={versionResult.staging} />
                            </div>

                            <div className={`${panelClass} p-5`}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-slate-100">
                                            Version comparison result
                                        </h3>

                                        <p className="mt-1 text-xs text-slate-400">
                                            {versionComparison?.message}
                                        </p>
                                    </div>

                                    {versionComparison?.status === "compared" ? (
                                        <StatusPill tone="green">
                                            Version comparison completed
                                        </StatusPill>
                                    ) : (
                                        <StatusPill tone="amber">
                                            Structural comparison required
                                        </StatusPill>
                                    )}
                                </div>

                                {versionComparison?.status === "compared" ? (
                                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                                            <p className="text-xs text-slate-500">
                                                Development
                                            </p>

                                            <p className="mt-1 font-mono text-xl font-bold text-indigo-300">
                                                {versionComparison.developmentVersion
                                                    ? `v${versionComparison.developmentVersion}`
                                                    : "—"}
                                            </p>
                                        </div>

                                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                                            <p className="text-xs text-slate-500">
                                                Staging
                                            </p>

                                            <p className="mt-1 font-mono text-xl font-bold text-cyan-300">
                                                {versionComparison.stagingVersion
                                                    ? `v${versionComparison.stagingVersion}`
                                                    : "—"}
                                            </p>
                                        </div>

                                        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4">
                                            <p className="text-xs text-indigo-200/70">
                                                Newer schema
                                            </p>

                                            <p className="mt-1 text-xl font-bold text-indigo-200">
                                                {versionComparison.newerEnvironment === "same"
                                                    ? "Same version"
                                                    : versionComparison.newerEnvironment ?? "Unknown"}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                                        <p className="text-sm font-semibold text-amber-200">
                                            Version information is incomplete
                                        </p>

                                        <p className="mt-1 text-xs leading-5 text-slate-400">
                                            The backend has switched to structural comparison because one or both environments do not have usable version information.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {versionResult.structuralComparison?.performed && (
                                <div className={`${panelClass} overflow-hidden`}>
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
                                        <div>
                                            <h3 className="font-semibold text-slate-100">
                                                Structural comparison fallback
                                            </h3>

                                            <p className="mt-1 text-xs text-slate-400">
                                                Schema differences detected without relying on version numbers.
                                            </p>
                                        </div>

                                        <StatusPill tone={structuralDifferences.length === 0 ? "green" : "amber"}>
                                            {versionResult.structuralComparison.differenceCount ?? structuralDifferences.length} differences
                                        </StatusPill>
                                    </div>

                                    <div className="space-y-2 p-4">
                                        {structuralDifferences.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-400">
                                                No structural differences were found.
                                            </div>
                                        ) : (
                                            structuralDifferences.map((difference, index) => (
                                                <DifferenceCard
                                                    key={`fallback-${difference.type}-${difference.table}-${difference.object}-${index}`}
                                                    difference={difference}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {versionResult.structuralComparison && !versionResult.structuralComparison.performed && (
                                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">
                                    Structural fallback was not required because both environments have version information.
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </section>
    );
}