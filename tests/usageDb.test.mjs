/**
 * Unit tests for src/lib/usageDb.js
 * Tests usage tracking, call logs, stats, and cost calculations.
 * Uses a temp directory to avoid polluting real data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Set DATA_DIR to a temp directory BEFORE importing usageDb
const TEST_DATA_DIR = path.join(os.tmpdir(), `9router-usage-test-${Date.now()}`);
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.JWT_SECRET = "test-secret-for-ci";
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

const usage = await import("../src/lib/usageDb.js");

// Cleanup after all tests
test.after(() => {
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ═══════════════════════════════════════════
// Usage DB Initialization
// ═══════════════════════════════════════════

test("usageDb — getUsageDb initializes without error", async () => {
  const db = await usage.getUsageDb();
  assert.ok(db, "getUsageDb should return a db instance");
});

// ═══════════════════════════════════════════
// Usage Tracking
// ═══════════════════════════════════════════

test("usageDb — saveRequestUsage accepts valid entry", async () => {
  const entry = {
    id: `test-${Date.now()}`,
    model: "gpt-4o",
    provider: "openai",
    connectionId: "conn-1",
    tokens: { prompt: 100, completion: 50, total: 150 },
    status: "success",
    timestamp: new Date().toISOString(),
  };

  // Should not throw
  await usage.saveRequestUsage(entry);
  assert.ok(true, "saveRequestUsage should complete without error");
});

test("usageDb — getUsageHistory returns array", async () => {
  const history = await usage.getUsageHistory();
  assert.ok(Array.isArray(history), "getUsageHistory should return array");
});

test("usageDb — getUsageStats does not throw", async () => {
  // getUsageStats may return different structures depending on data state
  await assert.doesNotReject(async () => {
    await usage.getUsageStats();
  }, "getUsageStats should not throw");
});

// ═══════════════════════════════════════════
// Call Logs
// ═══════════════════════════════════════════

test("usageDb — saveCallLog and getCallLogs", async () => {
  const logEntry = {
    id: `log-${Date.now()}`,
    method: "POST",
    path: "/v1/chat/completions",
    status: 200,
    model: "gpt-4o",
    provider: "openai",
    connectionId: "conn-1",
    comboName: "",
    apiKeyId: "key-1",
    apiKeyName: "Test Key",
    sourceFormat: "openai",
    targetFormat: "openai",
    durationMs: 450,
    promptTokens: 100,
    completionTokens: 50,
    requestBody: '{"messages":[]}',
    responseBody: '{"choices":[]}',
    errorMessage: "",
    timestamp: new Date().toISOString(),
  };

  await usage.saveCallLog(logEntry);

  const logs = await usage.getCallLogs();
  assert.ok(Array.isArray(logs), "getCallLogs should return array");
});

test("usageDb — getRecentLogs returns array with limit", async () => {
  const logs = await usage.getRecentLogs(10);
  assert.ok(Array.isArray(logs), "getRecentLogs should return array");
  assert.ok(logs.length <= 10, "Should respect limit");
});

// ═══════════════════════════════════════════
// Cost Calculation
// ═══════════════════════════════════════════

test("usageDb — calculateCost returns a number", async () => {
  const cost = await usage.calculateCost("openai", "gpt-4o", {
    prompt: 1000,
    completion: 500,
    total: 1500,
  });
  assert.ok(typeof cost === "number", "calculateCost should return a number");
  assert.ok(cost >= 0, "Cost should be non-negative");
});

// ═══════════════════════════════════════════
// Pending Request Tracking
// ═══════════════════════════════════════════

test("usageDb — trackPendingRequest does not throw", () => {
  // trackPendingRequest may return void or a tracker object
  assert.doesNotThrow(() => {
    usage.trackPendingRequest("gpt-4o", "openai", "conn-1", Date.now());
  }, "trackPendingRequest should not throw");
});

// ═══════════════════════════════════════════
// Rotation
// ═══════════════════════════════════════════

test("usageDb — rotateCallLogs does not throw", () => {
  assert.doesNotThrow(() => {
    usage.rotateCallLogs();
  }, "rotateCallLogs should not throw");
});
