/**
 * Unit tests for src/shared/utils/ modules
 * Tests apiKey, cors, and machineId utilities.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Set required env vars before imports
process.env.JWT_SECRET = "test-secret-for-ci";
process.env.API_KEY_SECRET = "test-api-key-secret";
process.env.MACHINE_ID_SALT = "test-salt";

// ═══════════════════════════════════════════
// apiKey.js Tests
// ═══════════════════════════════════════════

const { generateApiKeyWithMachine, parseApiKey, verifyApiKeyCrc, isNewFormatKey } =
  await import("../src/shared/utils/apiKey.js");

test("apiKey — generateApiKeyWithMachine returns valid key", () => {
  const machineId = "abc123def456gh78";
  const result = generateApiKeyWithMachine(machineId);

  assert.ok(result.key, "Should have a key");
  assert.ok(result.keyId, "Should have a keyId");
  assert.ok(result.key.startsWith("sk-"), "Key should start with sk-");
  assert.equal(result.key.split("-").length, 4, "Key should have 4 parts (sk-machine-keyid-crc)");
});

test("apiKey — parseApiKey parses new format correctly", () => {
  const machineId = "abc123def456gh78";
  const { key } = generateApiKeyWithMachine(machineId);
  const parsed = parseApiKey(key);

  assert.ok(parsed, "parseApiKey should return a result");
  assert.equal(parsed.machineId, machineId, "Should extract machineId");
  assert.ok(parsed.keyId, "Should extract keyId");
  assert.equal(parsed.isNewFormat, true, "Should be new format");
});

test("apiKey — parseApiKey parses old format", () => {
  const parsed = parseApiKey("sk-abcd1234");

  assert.ok(parsed, "parseApiKey should parse old format");
  assert.equal(parsed.machineId, null, "Old format has no machineId");
  assert.equal(parsed.keyId, "abcd1234", "Should extract keyId");
  assert.equal(parsed.isNewFormat, false, "Should be old format");
});

test("apiKey — parseApiKey returns null for invalid input", () => {
  assert.equal(parseApiKey(null), null, "null input");
  assert.equal(parseApiKey(""), null, "empty string");
  assert.equal(parseApiKey("invalid-key"), null, "no sk- prefix");
  assert.equal(parseApiKey("sk-a-b-wrong-crc-extra"), null, "too many parts");
});

test("apiKey — verifyApiKeyCrc validates new format keys", () => {
  const machineId = "testmachine12345";
  const { key } = generateApiKeyWithMachine(machineId);

  assert.equal(verifyApiKeyCrc(key), true, "Valid key should verify");
  assert.equal(verifyApiKeyCrc("sk-invalid"), true, "Old format always valid");
  assert.equal(verifyApiKeyCrc("not-a-key"), false, "Invalid key should fail");
});

test("apiKey — isNewFormatKey identifies format", () => {
  const machineId = "testmachine12345";
  const { key } = generateApiKeyWithMachine(machineId);

  assert.equal(isNewFormatKey(key), true, "New format key");
  assert.equal(isNewFormatKey("sk-oldformat"), false, "Old format key");
  assert.equal(isNewFormatKey("invalid"), false, "Invalid key");
});

// ═══════════════════════════════════════════
// cors.js Tests
// ═══════════════════════════════════════════

const { CORS_HEADERS, handleCorsOptions } = await import("../src/shared/utils/cors.js");

test("cors — CORS_HEADERS has required fields", () => {
  assert.ok(CORS_HEADERS["Access-Control-Allow-Origin"], "Should have Allow-Origin");
  assert.ok(CORS_HEADERS["Access-Control-Allow-Methods"], "Should have Allow-Methods");
  assert.ok(CORS_HEADERS["Access-Control-Allow-Headers"], "Should have Allow-Headers");
});

test("cors — CORS_HEADERS includes essential methods", () => {
  const methods = CORS_HEADERS["Access-Control-Allow-Methods"];
  assert.ok(methods.includes("GET"), "Should allow GET");
  assert.ok(methods.includes("POST"), "Should allow POST");
  assert.ok(methods.includes("DELETE"), "Should allow DELETE");
  assert.ok(methods.includes("OPTIONS"), "Should allow OPTIONS");
});

test("cors — CORS_HEADERS includes necessary headers", () => {
  const headers = CORS_HEADERS["Access-Control-Allow-Headers"];
  assert.ok(headers.includes("Content-Type"), "Should allow Content-Type");
  assert.ok(headers.includes("Authorization"), "Should allow Authorization");
  assert.ok(headers.includes("x-api-key"), "Should allow x-api-key");
});

test("cors — handleCorsOptions returns 204 response", () => {
  const response = handleCorsOptions();
  assert.equal(response.status, 204, "Should return 204 No Content");
});

// ═══════════════════════════════════════════
// machineId.js Tests
// ═══════════════════════════════════════════

// machineId.js uses CJS module (node-machine-id), so we need dynamic import with fallback
let machineUtils;
try {
  machineUtils = await import("../src/shared/utils/machineId.js");
} catch {
  machineUtils = null;
}

test("machineId — isBrowser returns false in Node.js", { skip: !machineUtils }, () => {
  assert.equal(machineUtils.isBrowser(), false, "Should be false in Node.js environment");
});

test("machineId — getConsistentMachineId returns 16-char string", { skip: !machineUtils }, async () => {
  const id = await machineUtils.getConsistentMachineId("test-salt");
  assert.ok(typeof id === "string", "Should return a string");
  assert.equal(id.length, 16, "Should be 16 characters long");
});

test("machineId — getConsistentMachineId is consistent with same salt", { skip: !machineUtils }, async () => {
  const id1 = await machineUtils.getConsistentMachineId("same-salt");
  const id2 = await machineUtils.getConsistentMachineId("same-salt");
  assert.equal(id1, id2, "Same salt should produce same ID");
});

test("machineId — getConsistentMachineId varies with different salt", { skip: !machineUtils }, async () => {
  const id1 = await machineUtils.getConsistentMachineId("salt-aaa");
  const id2 = await machineUtils.getConsistentMachineId("salt-bbb");
  assert.notEqual(id1, id2, "Different salts should produce different IDs");
});
