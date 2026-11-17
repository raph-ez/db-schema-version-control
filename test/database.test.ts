import { describe, it, expect } from "vitest";
import { encryptConnectionUri, decryptConnectionUri } from "../lib/crypto";
import {
  ENVIRONMENT_DEFAULTS,
  resolveConnectionString,
  getPool,
  testConnection,
} from "../lib/database";
import { initSystemTables } from "../lib/db";

describe("Hanafi DBA & Connectivity Module (TC-UT & TC-IT)", () => {
  it("TC-UT-05 (LOG-005): encrypts DB credentials and decrypts accurately", () => {
    const rawUri = "postgresql://root:password@127.0.0.1:5432/dev_schema";
    const encrypted = encryptConnectionUri(rawUri);
    expect(encrypted).not.toContain("password");
    expect(decryptConnectionUri(encrypted)).toBe(rawUri);
  });

  it("TC-IT-02: resolves environment aliases (dev, staging, prod) accurately", () => {
    expect(resolveConnectionString()).toBe(ENVIRONMENT_DEFAULTS.development);
    expect(resolveConnectionString("dev")).toBe(ENVIRONMENT_DEFAULTS.development);
    expect(resolveConnectionString("staging")).toBe(ENVIRONMENT_DEFAULTS.staging);
    expect(resolveConnectionString("prod")).toBe(ENVIRONMENT_DEFAULTS.production);
  });

  it("TC-IT-01a: caches and reuses the same PostgreSQL Pool instance per URI", () => {
    const poolA = getPool("dev");
    const poolB = getPool("development");
    expect(poolA).toBe(poolB);
  });

  it("TC-IT-01b: verifies live TCP connectivity to postgres-dev container", async () => {
    const result = await testConnection("dev");
    expect(result.connected).toBe(true);
    expect(result.database).toBe("dev_schema");
    expect(result.latencyMs).toBeLessThan(3000);
  });

  it("TC-ST-03: rejects malformed or non-PostgreSQL connection URIs safely", async () => {
    const result = await testConnection("mysql://root:password@127.0.0.1:3306/bad_db");
    expect(result.connected).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("TC-FT-03: initializes control-plane tables idempotently via initSystemTables()", async () => {
    await expect(initSystemTables("dev")).resolves.toBeUndefined();
  });
});