/**
 * Usage Database — SQLite-backed usage tracking and call logging.
 *
 * Replaces the previous LowDB/JSON implementation (usage.json + call_logs.json).
 * Data is stored in the shared storage.sqlite via tables:
 *   - usage_events  (replaces usage.json history[])
 *   - call_logs     (replaces call_logs.json logs[])
 *
 * The flat log.txt and call_logs/ directory (full payloads) are preserved as-is.
 *
 * All exported function signatures remain identical for backward compatibility.
 */

import path from "path";
import fs from "fs";
import { resolveDataDir, getLegacyDotDataDir, isSamePath } from "./dataPaths.js";

const isCloud = typeof caches !== 'undefined' || typeof caches === 'object';
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const shouldPersistToDisk = !isCloud && !isBuildPhase;

// Data file paths
const DATA_DIR = resolveDataDir({ isCloud });
const LEGACY_DATA_DIR = isCloud ? null : getLegacyDotDataDir();
const LOG_FILE = isCloud ? null : path.join(DATA_DIR, "log.txt");
const CALL_LOGS_DIR = isCloud ? null : path.join(DATA_DIR, "call_logs");

// Legacy paths for migration
const LEGACY_DB_FILE = isCloud || !LEGACY_DATA_DIR ? null : path.join(LEGACY_DATA_DIR, "usage.json");
const LEGACY_LOG_FILE = isCloud || !LEGACY_DATA_DIR ? null : path.join(LEGACY_DATA_DIR, "log.txt");
const LEGACY_CALL_LOGS_DIR = isCloud || !LEGACY_DATA_DIR ? null : path.join(LEGACY_DATA_DIR, "call_logs");

// JSON files for auto-migration
const USAGE_JSON_FILE = isCloud ? null : path.join(DATA_DIR, "usage.json");
const CALL_LOGS_JSON_FILE = isCloud ? null : path.join(DATA_DIR, "call_logs.json");

// Ensure data directory exists
if (!isCloud && fs && typeof fs.existsSync === "function") {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (error) {
    console.error("[usageDb] Failed to create data directory:", error.message);
  }
}

// ──────────────── Legacy File Migration ────────────────

function copyIfMissing(fromPath, toPath, label) {
  if (!fromPath || !toPath) return;
  if (!fs.existsSync(fromPath) || fs.existsSync(toPath)) return;

  if (fs.statSync(fromPath).isDirectory()) {
    fs.cpSync(fromPath, toPath, { recursive: true });
  } else {
    fs.copyFileSync(fromPath, toPath);
  }
  console.log(`[usageDb] Migrated ${label}: ${fromPath} -> ${toPath}`);
}

function migrateLegacyUsageFiles() {
  if (!shouldPersistToDisk || !LEGACY_DATA_DIR) return;
  if (isSamePath(DATA_DIR, LEGACY_DATA_DIR)) return;

  try {
    // Only copy log.txt and call_logs dir (JSON files will be migrated to SQLite)
    copyIfMissing(LEGACY_LOG_FILE, LOG_FILE, "request log");
    copyIfMissing(LEGACY_CALL_LOGS_DIR, CALL_LOGS_DIR, "call log files");
    // Also copy the JSON files so the migration function can read them
    copyIfMissing(LEGACY_DB_FILE, USAGE_JSON_FILE, "usage history");
  } catch (error) {
    console.error("[usageDb] Legacy migration failed:", error.message);
  }
}

migrateLegacyUsageFiles();

// ──────────────── SQLite DB Instance ────────────────

let _db = null;

function getDb() {
  if (_db) return _db;

  try {
    // Import the shared DB instance from sqliteDb
    const { _getSharedDbInstance } = require("./sqliteDb.js");
    _db = _getSharedDbInstance();
  } catch (e) {
    // Fallback: create standalone in-memory DB for build/cloud
    if (isBuildPhase || isCloud) {
      const Database = require("better-sqlite3");
      _db = new Database(":memory:");
    } else {
      throw e;
    }
  }

  // Create usage tables if they don't exist
  _db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      connection_id TEXT,
      api_key_id TEXT,
      api_key_name TEXT,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      tokens_cached INTEGER DEFAULT 0,
      tokens_reasoning INTEGER DEFAULT 0,
      tokens_cache_creation INTEGER DEFAULT 0,
      status TEXT,
      cost REAL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ue_timestamp ON usage_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ue_provider ON usage_events(provider);
    CREATE INDEX IF NOT EXISTS idx_ue_model ON usage_events(model);

    CREATE TABLE IF NOT EXISTS call_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      method TEXT DEFAULT 'POST',
      path TEXT,
      status INTEGER DEFAULT 0,
      model TEXT,
      provider TEXT,
      account TEXT,
      connection_id TEXT,
      duration INTEGER DEFAULT 0,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      source_format TEXT,
      target_format TEXT,
      api_key_id TEXT,
      api_key_name TEXT,
      combo_name TEXT,
      error TEXT,
      request_body TEXT,
      response_body TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cl_timestamp ON call_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_cl_status ON call_logs(status);
    CREATE INDEX IF NOT EXISTS idx_cl_provider ON call_logs(provider);
    CREATE INDEX IF NOT EXISTS idx_cl_model ON call_logs(model);
  `);

  // Auto-migrate from usage.json if exists
  if (USAGE_JSON_FILE && fs.existsSync(USAGE_JSON_FILE)) {
    _migrateUsageJson(_db);
  }

  // Auto-migrate from call_logs.json if exists
  if (CALL_LOGS_JSON_FILE && fs.existsSync(CALL_LOGS_JSON_FILE)) {
    _migrateCallLogsJson(_db);
  }

  return _db;
}

// ──────────────── JSON → SQLite Migration ────────────────

function _migrateUsageJson(db) {
  try {
    const raw = fs.readFileSync(USAGE_JSON_FILE, "utf-8");
    const data = JSON.parse(raw);
    const history = data.history || [];

    if (history.length === 0) {
      fs.renameSync(USAGE_JSON_FILE, USAGE_JSON_FILE + ".empty");
      return;
    }

    // Check if we already have data (avoid double migration)
    const existing = db.prepare("SELECT COUNT(*) as cnt FROM usage_events").get();
    if (existing.cnt > 0) {
      fs.renameSync(USAGE_JSON_FILE, USAGE_JSON_FILE + ".migrated");
      console.log(`[usageDb] usage.json skipped (SQLite already has ${existing.cnt} events)`);
      return;
    }

    console.log(`[usageDb] Migrating usage.json → SQLite (${history.length} entries)...`);

    const insert = db.prepare(`
      INSERT INTO usage_events (timestamp, provider, model, connection_id, api_key_id, api_key_name,
        tokens_input, tokens_output, tokens_cached, tokens_reasoning, tokens_cache_creation, status)
      VALUES (@timestamp, @provider, @model, @connectionId, @apiKeyId, @apiKeyName,
        @tokensInput, @tokensOutput, @tokensCached, @tokensReasoning, @tokensCacheCreation, @status)
    `);

    const migrate = db.transaction(() => {
      for (const entry of history) {
        insert.run({
          timestamp: entry.timestamp || new Date().toISOString(),
          provider: entry.provider || null,
          model: entry.model || null,
          connectionId: entry.connectionId || null,
          apiKeyId: entry.apiKeyId || null,
          apiKeyName: entry.apiKeyName || null,
          tokensInput: entry.tokens?.input ?? entry.tokens?.prompt_tokens ?? 0,
          tokensOutput: entry.tokens?.output ?? entry.tokens?.completion_tokens ?? 0,
          tokensCached: entry.tokens?.cacheRead ?? entry.tokens?.cached_tokens ?? 0,
          tokensReasoning: entry.tokens?.reasoning ?? entry.tokens?.reasoning_tokens ?? 0,
          tokensCacheCreation: entry.tokens?.cacheCreation ?? entry.tokens?.cache_creation_input_tokens ?? 0,
          status: entry.status || null,
        });
      }
    });

    migrate();
    fs.renameSync(USAGE_JSON_FILE, USAGE_JSON_FILE + ".migrated");
    console.log(`[usageDb] ✓ usage.json migration complete (${history.length} events)`);
  } catch (err) {
    console.error("[usageDb] usage.json migration failed:", err.message);
  }
}

function _migrateCallLogsJson(db) {
  try {
    const raw = fs.readFileSync(CALL_LOGS_JSON_FILE, "utf-8");
    const data = JSON.parse(raw);
    const logs = data.logs || [];

    if (logs.length === 0) {
      fs.renameSync(CALL_LOGS_JSON_FILE, CALL_LOGS_JSON_FILE + ".empty");
      return;
    }

    // Check if we already have data
    const existing = db.prepare("SELECT COUNT(*) as cnt FROM call_logs").get();
    if (existing.cnt > 0) {
      fs.renameSync(CALL_LOGS_JSON_FILE, CALL_LOGS_JSON_FILE + ".migrated");
      console.log(`[usageDb] call_logs.json skipped (SQLite already has ${existing.cnt} logs)`);
      return;
    }

    console.log(`[usageDb] Migrating call_logs.json → SQLite (${logs.length} entries)...`);

    const insert = db.prepare(`
      INSERT OR IGNORE INTO call_logs (id, timestamp, method, path, status, model, provider, account,
        connection_id, duration, tokens_in, tokens_out, source_format, target_format,
        api_key_id, api_key_name, combo_name, error, request_body, response_body)
      VALUES (@id, @timestamp, @method, @path, @status, @model, @provider, @account,
        @connectionId, @duration, @tokensIn, @tokensOut, @sourceFormat, @targetFormat,
        @apiKeyId, @apiKeyName, @comboName, @error, @requestBody, @responseBody)
    `);

    const migrate = db.transaction(() => {
      for (const log of logs) {
        insert.run({
          id: log.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: log.timestamp || new Date().toISOString(),
          method: log.method || "POST",
          path: log.path || null,
          status: log.status || 0,
          model: log.model || null,
          provider: log.provider || null,
          account: log.account || null,
          connectionId: log.connectionId || null,
          duration: log.duration || 0,
          tokensIn: log.tokens?.in ?? 0,
          tokensOut: log.tokens?.out ?? 0,
          sourceFormat: log.sourceFormat || null,
          targetFormat: log.targetFormat || null,
          apiKeyId: log.apiKeyId || null,
          apiKeyName: log.apiKeyName || null,
          comboName: log.comboName || null,
          error: log.error || null,
          requestBody: log.requestBody ? JSON.stringify(log.requestBody) : null,
          responseBody: log.responseBody ? JSON.stringify(log.responseBody) : null,
        });
      }
    });

    migrate();
    fs.renameSync(CALL_LOGS_JSON_FILE, CALL_LOGS_JSON_FILE + ".migrated");
    console.log(`[usageDb] ✓ call_logs.json migration complete (${logs.length} logs)`);
  } catch (err) {
    console.error("[usageDb] call_logs.json migration failed:", err.message);
  }
}

// ──────────────── Pending Requests (in-memory only) ────────────────

const pendingRequests = {
  byModel: {},
  byAccount: {}
};

/**
 * Track a pending request (in-memory only, not persisted)
 */
export function trackPendingRequest(model, provider, connectionId, started) {
  if (!model || !provider) return;

  const modelKey = `${model} (${provider})`;
  if (!pendingRequests.byModel[modelKey]) pendingRequests.byModel[modelKey] = 0;
  pendingRequests.byModel[modelKey] = Math.max(0, pendingRequests.byModel[modelKey] + (started ? 1 : -1));

  if (connectionId) {
    const accountKey = connectionId;
    if (!pendingRequests.byAccount[accountKey]) pendingRequests.byAccount[accountKey] = {};
    if (!pendingRequests.byAccount[accountKey][modelKey]) pendingRequests.byAccount[accountKey][modelKey] = 0;
    pendingRequests.byAccount[accountKey][modelKey] = Math.max(0, pendingRequests.byAccount[accountKey][modelKey] + (started ? 1 : -1));
  }
}

// ──────────────── Usage Events ────────────────

/**
 * Save request usage
 * @param {object} entry - Usage entry { provider, model, tokens, connectionId?, apiKeyId?, apiKeyName? }
 */
export async function saveRequestUsage(entry) {
  if (!shouldPersistToDisk) return;

  try {
    const db = getDb();
    const timestamp = entry.timestamp || new Date().toISOString();

    db.prepare(`
      INSERT INTO usage_events (timestamp, provider, model, connection_id, api_key_id, api_key_name,
        tokens_input, tokens_output, tokens_cached, tokens_reasoning, tokens_cache_creation, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      timestamp,
      entry.provider || null,
      entry.model || null,
      entry.connectionId || null,
      entry.apiKeyId || null,
      entry.apiKeyName || null,
      entry.tokens?.input ?? entry.tokens?.prompt_tokens ?? 0,
      entry.tokens?.output ?? entry.tokens?.completion_tokens ?? 0,
      entry.tokens?.cacheRead ?? entry.tokens?.cached_tokens ?? 0,
      entry.tokens?.reasoning ?? entry.tokens?.reasoning_tokens ?? 0,
      entry.tokens?.cacheCreation ?? entry.tokens?.cache_creation_input_tokens ?? 0,
      entry.status || null,
    );
  } catch (error) {
    console.error("Failed to save usage stats:", error);
  }
}

/**
 * Get usage history
 * @param {object} filter - Filter criteria
 */
export async function getUsageHistory(filter = {}) {
  try {
    const db = getDb();
    let sql = "SELECT * FROM usage_events";
    const conditions = [];
    const params = [];

    if (filter.provider) {
      conditions.push("provider = ?");
      params.push(filter.provider);
    }
    if (filter.model) {
      conditions.push("model = ?");
      params.push(filter.model);
    }
    if (filter.startDate) {
      conditions.push("timestamp >= ?");
      params.push(new Date(filter.startDate).toISOString());
    }
    if (filter.endDate) {
      conditions.push("timestamp <= ?");
      params.push(new Date(filter.endDate).toISOString());
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY timestamp ASC";

    const rows = db.prepare(sql).all(...params);

    // Return in the same format as the old JSON entries
    return rows.map(row => ({
      timestamp: row.timestamp,
      provider: row.provider,
      model: row.model,
      connectionId: row.connection_id,
      apiKeyId: row.api_key_id,
      apiKeyName: row.api_key_name,
      tokens: {
        input: row.tokens_input,
        output: row.tokens_output,
        cacheRead: row.tokens_cached || undefined,
        reasoning: row.tokens_reasoning || undefined,
        cacheCreation: row.tokens_cache_creation || undefined,
        // Also provide legacy keys for backward compatibility
        prompt_tokens: row.tokens_input,
        completion_tokens: row.tokens_output,
      },
      status: row.status,
    }));
  } catch (error) {
    console.error("Failed to get usage history:", error);
    return [];
  }
}

// ──────────────── Log.txt (kept as flat file) ────────────────

function formatLogDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${d}-${m}-${y} ${h}:${min}:${s}`;
}

/**
 * Append to log.txt
 * Format: datetime(dd-mm-yyyy h:m:s) | model | provider | account | tokens sent | tokens received | status
 */
export async function appendRequestLog({ model, provider, connectionId, tokens, status }) {
  if (!shouldPersistToDisk) return;

  try {
    const timestamp = formatLogDate();
    const p = provider?.toUpperCase() || "-";
    const m = model || "-";

    // Resolve account name
    let account = connectionId ? connectionId.slice(0, 8) : "-";
    try {
      const { getProviderConnections } = await import("@/lib/localDb.js");
      const connections = await getProviderConnections();
      const conn = connections.find(c => c.id === connectionId);
      if (conn) {
        account = conn.name || conn.email || account;
      }
    } catch {}

    const sent = tokens?.input !== undefined ? tokens.input : (tokens?.prompt_tokens !== undefined ? tokens.prompt_tokens : "-");
    const received = tokens?.output !== undefined ? tokens.output : (tokens?.completion_tokens !== undefined ? tokens.completion_tokens : "-");

    const line = `${timestamp} | ${m} | ${p} | ${account} | ${sent} | ${received} | ${status}\n`;

    fs.appendFileSync(LOG_FILE, line);

    // Trim to keep only last 200 lines
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length > 200) {
      fs.writeFileSync(LOG_FILE, lines.slice(-200).join("\n") + "\n");
    }
  } catch (error) {
    console.error("Failed to append to log.txt:", error.message);
  }
}

/**
 * Get last N lines of log.txt
 */
export async function getRecentLogs(limit = 200) {
  if (!shouldPersistToDisk) return [];

  if (!fs || typeof fs.existsSync !== "function") return [];
  if (!LOG_FILE) return [];
  if (!fs.existsSync(LOG_FILE)) return [];

  try {
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n");
    return lines.slice(-limit).reverse();
  } catch (error) {
    console.error("[usageDb] Failed to read log.txt:", error.message);
    return [];
  }
}

// ──────────────── Cost Calculation ────────────────

/**
 * Calculate cost for a usage entry
 */
export async function calculateCost(provider, model, tokens) {
  if (!tokens || !provider || !model) return 0;

  try {
    const { getPricingForModel } = await import("@/lib/localDb.js");
    const pricing = await getPricingForModel(provider, model);

    if (!pricing) return 0;

    let cost = 0;

    const inputTokens = tokens.input ?? tokens.prompt_tokens ?? tokens.input_tokens ?? 0;
    const cachedTokens = tokens.cacheRead ?? tokens.cached_tokens ?? tokens.cache_read_input_tokens ?? 0;
    const nonCachedInput = Math.max(0, inputTokens - cachedTokens);

    cost += (nonCachedInput * (pricing.input / 1000000));

    if (cachedTokens > 0) {
      const cachedRate = pricing.cached || pricing.input;
      cost += (cachedTokens * (cachedRate / 1000000));
    }

    const outputTokens = tokens.output ?? tokens.completion_tokens ?? tokens.output_tokens ?? 0;
    cost += (outputTokens * (pricing.output / 1000000));

    const reasoningTokens = tokens.reasoning ?? tokens.reasoning_tokens ?? 0;
    if (reasoningTokens > 0) {
      const reasoningRate = pricing.reasoning || pricing.output;
      cost += (reasoningTokens * (reasoningRate / 1000000));
    }

    const cacheCreationTokens = tokens.cacheCreation ?? tokens.cache_creation_input_tokens ?? 0;
    if (cacheCreationTokens > 0) {
      const cacheCreationRate = pricing.cache_creation || pricing.input;
      cost += (cacheCreationTokens * (cacheCreationRate / 1000000));
    }

    return cost;
  } catch (error) {
    console.error("Error calculating cost:", error);
    return 0;
  }
}

// ──────────────── Usage Stats ────────────────

/**
 * Get aggregated usage stats
 */
export async function getUsageStats() {
  const history = await getUsageHistory();

  const { getProviderConnections } = await import("@/lib/localDb.js");

  let allConnections = [];
  try {
    allConnections = await getProviderConnections();
  } catch (error) {
    console.warn("Could not fetch provider connections for usage stats:", error.message);
  }

  const connectionMap = {};
  for (const conn of allConnections) {
    connectionMap[conn.id] = conn.name || conn.email || conn.id;
  }

  const stats = {
    totalRequests: history.length,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCost: 0,
    byProvider: {},
    byModel: {},
    byAccount: {},
    byApiKey: {},
    last10Minutes: [],
    pending: pendingRequests,
    activeRequests: []
  };

  // Build active requests list from pending counts
  for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
    for (const [modelKey, count] of Object.entries(models)) {
      if (count > 0) {
        const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
        const match = modelKey.match(/^(.*) \((.*)\)$/);
        const modelName = match ? match[1] : modelKey;
        const providerName = match ? match[2] : "unknown";

        stats.activeRequests.push({
          model: modelName,
          provider: providerName,
          account: accountName,
          count
        });
      }
    }
  }

  // Initialize 10-minute buckets
  const now = new Date();
  const currentMinuteStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const tenMinutesAgo = new Date(currentMinuteStart.getTime() - 9 * 60 * 1000);

  const bucketMap = {};
  for (let i = 0; i < 10; i++) {
    const bucketTime = new Date(currentMinuteStart.getTime() - (9 - i) * 60 * 1000);
    const bucketKey = bucketTime.getTime();
    bucketMap[bucketKey] = {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0
    };
    stats.last10Minutes.push(bucketMap[bucketKey]);
  }

  for (const entry of history) {
    const promptTokens = entry.tokens?.input ?? entry.tokens?.prompt_tokens ?? 0;
    const completionTokens = entry.tokens?.output ?? entry.tokens?.completion_tokens ?? 0;
    const entryTime = new Date(entry.timestamp);

    const entryCost = await calculateCost(entry.provider, entry.model, entry.tokens);

    stats.totalPromptTokens += promptTokens;
    stats.totalCompletionTokens += completionTokens;
    stats.totalCost += entryCost;

    // Last 10 minutes aggregation
    if (entryTime >= tenMinutesAgo && entryTime <= now) {
      const entryMinuteStart = Math.floor(entryTime.getTime() / 60000) * 60000;
      if (bucketMap[entryMinuteStart]) {
        bucketMap[entryMinuteStart].requests++;
        bucketMap[entryMinuteStart].promptTokens += promptTokens;
        bucketMap[entryMinuteStart].completionTokens += completionTokens;
        bucketMap[entryMinuteStart].cost += entryCost;
      }
    }

    // By Provider
    if (!stats.byProvider[entry.provider]) {
      stats.byProvider[entry.provider] = { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
    }
    stats.byProvider[entry.provider].requests++;
    stats.byProvider[entry.provider].promptTokens += promptTokens;
    stats.byProvider[entry.provider].completionTokens += completionTokens;
    stats.byProvider[entry.provider].cost += entryCost;

    // By Model
    const modelKey = entry.provider ? `${entry.model} (${entry.provider})` : entry.model;
    if (!stats.byModel[modelKey]) {
      stats.byModel[modelKey] = {
        requests: 0, promptTokens: 0, completionTokens: 0, cost: 0,
        rawModel: entry.model, provider: entry.provider, lastUsed: entry.timestamp
      };
    }
    stats.byModel[modelKey].requests++;
    stats.byModel[modelKey].promptTokens += promptTokens;
    stats.byModel[modelKey].completionTokens += completionTokens;
    stats.byModel[modelKey].cost += entryCost;
    if (new Date(entry.timestamp) > new Date(stats.byModel[modelKey].lastUsed)) {
      stats.byModel[modelKey].lastUsed = entry.timestamp;
    }

    // By Account
    if (entry.connectionId) {
      const accountName = connectionMap[entry.connectionId] || `Account ${entry.connectionId.slice(0, 8)}...`;
      const accountKey = `${entry.model} (${entry.provider} - ${accountName})`;

      if (!stats.byAccount[accountKey]) {
        stats.byAccount[accountKey] = {
          requests: 0, promptTokens: 0, completionTokens: 0, cost: 0,
          rawModel: entry.model, provider: entry.provider,
          connectionId: entry.connectionId, accountName: accountName,
          lastUsed: entry.timestamp
        };
      }
      stats.byAccount[accountKey].requests++;
      stats.byAccount[accountKey].promptTokens += promptTokens;
      stats.byAccount[accountKey].completionTokens += completionTokens;
      stats.byAccount[accountKey].cost += entryCost;
      if (new Date(entry.timestamp) > new Date(stats.byAccount[accountKey].lastUsed)) {
        stats.byAccount[accountKey].lastUsed = entry.timestamp;
      }
    }

    // By API key
    if (entry.apiKeyId || entry.apiKeyName) {
      const keyName = entry.apiKeyName || entry.apiKeyId || "unknown";
      const keyId = entry.apiKeyId || null;
      const apiKey = keyId ? `${keyName} (${keyId})` : keyName;

      if (!stats.byApiKey[apiKey]) {
        stats.byApiKey[apiKey] = {
          requests: 0, promptTokens: 0, completionTokens: 0, cost: 0,
          apiKeyId: keyId, apiKeyName: keyName, lastUsed: entry.timestamp
        };
      }
      stats.byApiKey[apiKey].requests++;
      stats.byApiKey[apiKey].promptTokens += promptTokens;
      stats.byApiKey[apiKey].completionTokens += completionTokens;
      stats.byApiKey[apiKey].cost += entryCost;
      if (new Date(entry.timestamp) > new Date(stats.byApiKey[apiKey].lastUsed)) {
        stats.byApiKey[apiKey].lastUsed = entry.timestamp;
      }
    }
  }

  return stats;
}

// ──────────────── Call Logs ────────────────

// In-memory ring buffer for fast reads
let callLogsBuffer = [];
const CALL_LOGS_MAX = 500;

// Seed buffer from SQLite on first access
let _bufferSeeded = false;

function seedBuffer() {
  if (_bufferSeeded) return;
  _bufferSeeded = true;

  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM call_logs ORDER BY timestamp DESC LIMIT ?"
    ).all(CALL_LOGS_MAX);

    callLogsBuffer = rows.reverse().map(_rowToCallLog);
  } catch (err) {
    console.error("[callLogs] Failed to seed buffer:", err.message);
  }
}

function _rowToCallLog(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    method: row.method,
    path: row.path,
    status: row.status,
    model: row.model,
    provider: row.provider,
    account: row.account,
    connectionId: row.connection_id,
    duration: row.duration,
    tokens: {
      in: row.tokens_in,
      out: row.tokens_out,
    },
    sourceFormat: row.source_format,
    targetFormat: row.target_format,
    apiKeyId: row.api_key_id,
    apiKeyName: row.api_key_name,
    comboName: row.combo_name,
    error: row.error,
    requestBody: row.request_body ? _safeJsonParse(row.request_body) : null,
    responseBody: row.response_body ? _safeJsonParse(row.response_body) : null,
  };
}

function _safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}

// Generate unique ID
let logIdCounter = 0;
function generateLogId() {
  logIdCounter++;
  return `${Date.now()}-${logIdCounter}`;
}

/**
 * Save a structured call log entry
 */
export async function saveCallLog(entry) {
  if (!shouldPersistToDisk) return;

  try {
    seedBuffer();

    // Resolve account name
    let account = entry.connectionId ? entry.connectionId.slice(0, 8) : "-";
    try {
      const { getProviderConnections } = await import("@/lib/localDb.js");
      const connections = await getProviderConnections();
      const conn = connections.find(c => c.id === entry.connectionId);
      if (conn) {
        account = conn.name || conn.email || account;
      }
    } catch {}

    // Truncate large payloads for DB storage (keep under 8KB each)
    const truncatePayload = (obj) => {
      if (!obj) return null;
      const str = JSON.stringify(obj);
      if (str.length <= 8192) return obj;
      try {
        return { _truncated: true, _originalSize: str.length, _preview: str.slice(0, 8192) + "..." };
      } catch {
        return { _truncated: true };
      }
    };

    const logEntry = {
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      method: entry.method || "POST",
      path: entry.path || "/v1/chat/completions",
      status: entry.status || 0,
      model: entry.model || "-",
      provider: entry.provider || "-",
      account,
      connectionId: entry.connectionId || null,
      duration: entry.duration || 0,
      tokens: {
        in: entry.tokens?.prompt_tokens || 0,
        out: entry.tokens?.completion_tokens || 0,
      },
      sourceFormat: entry.sourceFormat || null,
      targetFormat: entry.targetFormat || null,
      apiKeyId: entry.apiKeyId || null,
      apiKeyName: entry.apiKeyName || null,
      requestBody: truncatePayload(entry.requestBody),
      responseBody: truncatePayload(entry.responseBody),
      error: entry.error || null,
      comboName: entry.comboName || null,
    };

    // 1. Add to in-memory buffer
    callLogsBuffer.push(logEntry);
    if (callLogsBuffer.length > CALL_LOGS_MAX) {
      callLogsBuffer = callLogsBuffer.slice(-CALL_LOGS_MAX);
    }

    // 2. Persist to SQLite
    try {
      const db = getDb();
      db.prepare(`
        INSERT OR REPLACE INTO call_logs (id, timestamp, method, path, status, model, provider, account,
          connection_id, duration, tokens_in, tokens_out, source_format, target_format,
          api_key_id, api_key_name, combo_name, error, request_body, response_body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logEntry.id,
        logEntry.timestamp,
        logEntry.method,
        logEntry.path,
        logEntry.status,
        logEntry.model,
        logEntry.provider,
        logEntry.account,
        logEntry.connectionId,
        logEntry.duration,
        logEntry.tokens.in,
        logEntry.tokens.out,
        logEntry.sourceFormat,
        logEntry.targetFormat,
        logEntry.apiKeyId,
        logEntry.apiKeyName,
        logEntry.comboName,
        logEntry.error,
        logEntry.requestBody ? JSON.stringify(logEntry.requestBody) : null,
        logEntry.responseBody ? JSON.stringify(logEntry.responseBody) : null,
      );

      // Keep DB lean — max 2000 entries (more than buffer since SQLite is indexed)
      const count = db.prepare("SELECT COUNT(*) as cnt FROM call_logs").get().cnt;
      if (count > 2000) {
        db.prepare(`
          DELETE FROM call_logs WHERE id IN (
            SELECT id FROM call_logs ORDER BY timestamp ASC LIMIT ?
          )
        `).run(count - 2000);
      }
    } catch (err) {
      console.error("[callLogs] Failed to persist to SQLite:", err.message);
    }

    // 3. Write full payload to disk file (untruncated)
    writeCallLogToDisk(logEntry, entry.requestBody, entry.responseBody);

  } catch (error) {
    console.error("[callLogs] Failed to save call log:", error.message);
  }
}

/**
 * Write call log as JSON file to disk (full payloads, not truncated)
 */
function writeCallLogToDisk(logEntry, requestBody, responseBody) {
  if (!CALL_LOGS_DIR) return;

  try {
    const now = new Date();
    const dateFolder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const dir = path.join(CALL_LOGS_DIR, dateFolder);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const safeModel = (logEntry.model || "unknown").replace(/[/:]/g, "-");
    const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const filename = `${time}_${safeModel}_${logEntry.status}.json`;

    const fullEntry = {
      ...logEntry,
      requestBody: requestBody || null,
      responseBody: responseBody || null,
    };

    fs.writeFileSync(path.join(dir, filename), JSON.stringify(fullEntry, null, 2));
  } catch (err) {
    console.error("[callLogs] Failed to write disk log:", err.message);
  }
}

/**
 * Rotate old call log directories (keep last 7 days)
 */
export function rotateCallLogs() {
  if (!CALL_LOGS_DIR || !fs.existsSync(CALL_LOGS_DIR)) return;

  try {
    const entries = fs.readdirSync(CALL_LOGS_DIR);
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const entryPath = path.join(CALL_LOGS_DIR, entry);
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory() && (now - stat.mtimeMs) > sevenDays) {
        fs.rmSync(entryPath, { recursive: true, force: true });
        console.log(`[callLogs] Rotated old logs: ${entry}`);
      }
    }
  } catch (err) {
    console.error("[callLogs] Failed to rotate logs:", err.message);
  }
}

// Run rotation on startup
if (shouldPersistToDisk) {
  try { rotateCallLogs(); } catch {}
}

/**
 * Get call logs with optional filtering
 */
export async function getCallLogs(filter = {}) {
  try {
    const db = getDb();
    seedBuffer();

    let sql = "SELECT * FROM call_logs";
    const conditions = [];
    const params = [];

    if (filter.status) {
      if (filter.status === "error") {
        conditions.push("(status >= 400 OR error IS NOT NULL)");
      } else if (filter.status === "ok") {
        conditions.push("status >= 200 AND status < 300");
      } else {
        const statusCode = parseInt(filter.status);
        if (!isNaN(statusCode)) {
          conditions.push("status = ?");
          params.push(statusCode);
        }
      }
    }

    if (filter.model) {
      conditions.push("model LIKE ?");
      params.push(`%${filter.model}%`);
    }

    if (filter.provider) {
      conditions.push("provider LIKE ?");
      params.push(`%${filter.provider}%`);
    }

    if (filter.account) {
      conditions.push("account LIKE ?");
      params.push(`%${filter.account}%`);
    }

    if (filter.apiKey) {
      conditions.push("(api_key_name LIKE ? OR api_key_id LIKE ?)");
      params.push(`%${filter.apiKey}%`, `%${filter.apiKey}%`);
    }

    if (filter.combo) {
      conditions.push("combo_name IS NOT NULL");
    }

    if (filter.search) {
      const q = `%${filter.search}%`;
      conditions.push("(model LIKE ? OR path LIKE ? OR account LIKE ? OR provider LIKE ? OR api_key_name LIKE ? OR api_key_id LIKE ? OR combo_name LIKE ? OR CAST(status AS TEXT) LIKE ?)");
      params.push(q, q, q, q, q, q, q, q);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    const limit = filter.limit || 200;
    sql += ` ORDER BY timestamp DESC LIMIT ${limit}`;

    const rows = db.prepare(sql).all(...params);

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      method: row.method,
      path: row.path,
      status: row.status,
      model: row.model,
      provider: row.provider,
      account: row.account,
      duration: row.duration,
      tokens: { in: row.tokens_in, out: row.tokens_out },
      sourceFormat: row.source_format,
      targetFormat: row.target_format,
      error: row.error,
      comboName: row.combo_name || null,
      apiKeyId: row.api_key_id || null,
      apiKeyName: row.api_key_name || null,
      hasRequestBody: !!row.request_body,
      hasResponseBody: !!row.response_body,
    }));
  } catch (error) {
    console.error("[callLogs] Failed to get call logs:", error.message);
    return [];
  }
}

/**
 * Get a single call log by ID (with full payloads from disk when available)
 */
export async function getCallLogById(id) {
  try {
    const db = getDb();
    const row = db.prepare("SELECT * FROM call_logs WHERE id = ?").get(id);
    if (!row) return null;

    const entry = _rowToCallLog(row);

    // If payloads are truncated, try to read full version from disk
    const needsDisk = entry.requestBody?._truncated || entry.responseBody?._truncated;
    if (needsDisk && CALL_LOGS_DIR) {
      try {
        const diskEntry = readFullLogFromDisk(entry);
        if (diskEntry) {
          return {
            ...entry,
            requestBody: diskEntry.requestBody ?? entry.requestBody,
            responseBody: diskEntry.responseBody ?? entry.responseBody,
          };
        }
      } catch (err) {
        console.error("[callLogs] Failed to read full log from disk:", err.message);
      }
    }

    return entry;
  } catch (error) {
    console.error("[callLogs] Failed to get call log by ID:", error.message);
    return null;
  }
}

/**
 * Read the full (untruncated) log entry from disk
 */
function readFullLogFromDisk(entry) {
  if (!CALL_LOGS_DIR || !entry.timestamp) return null;

  try {
    const date = new Date(entry.timestamp);
    const dateFolder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dir = path.join(CALL_LOGS_DIR, dateFolder);

    if (!fs.existsSync(dir)) return null;

    const time = `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
    const safeModel = (entry.model || "unknown").replace(/[/:]/g, "-");
    const expectedName = `${time}_${safeModel}_${entry.status}.json`;

    const exactPath = path.join(dir, expectedName);
    if (fs.existsSync(exactPath)) {
      return JSON.parse(fs.readFileSync(exactPath, "utf8"));
    }

    const files = fs.readdirSync(dir).filter(f => f.startsWith(time) && f.endsWith(`_${entry.status}.json`));
    if (files.length > 0) {
      return JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"));
    }
  } catch (err) {
    console.error("[callLogs] Disk log read error:", err.message);
  }

  return null;
}

// ──────────────── Legacy Compatibility ────────────────

/**
 * Get usage database instance — legacy compatibility wrapper.
 * Returns an object that mimics the LowDB interface.
 */
export async function getUsageDb() {
  const history = await getUsageHistory();
  return {
    data: { history },
    read: async () => {},
    write: async () => {},
  };
}
