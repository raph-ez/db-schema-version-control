export function detectAntiPatterns(query: string): string[] {
  const warnings: string[] = [];
  const upperQuery = query.toUpperCase();

  if (upperQuery.includes("SELECT *")) {
    warnings.push("Anti-pattern detected: 'SELECT *' fetches all columns. Specify required columns explicitly.");
  }
  if (!upperQuery.includes("WHERE") && (upperQuery.includes("UPDATE") || upperQuery.includes("DELETE"))) {
    warnings.push("Critical Warning: UPDATE or DELETE query missing a WHERE clause!");
  }
  if (!upperQuery.includes("WHERE") && upperQuery.includes("SELECT")) {
    warnings.push("Notice: SELECT query lacks a WHERE clause, which may cause full table scans on large tables.");
  }
  if (upperQuery.includes("DISTINCT")) {
    warnings.push("Notice: DISTINCT can cause expensive sorting operations. Verify if it is necessary.");
  }

  return warnings;
}