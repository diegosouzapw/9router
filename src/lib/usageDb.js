import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import fs from "fs";
import { resolveDataDir, getLegacyDotDataDir, isSamePath } from "./dataPaths.js";

const isCloud = typeof caches !== 'undefined' || typeof caches === 'object';
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const shouldPersistToDisk = !isCloud && !isBuildPhase;

// Data file path - stored in user home directory
const DATA_DIR = resolveDataDir({ isCloud });
const LEGACY_DATA_DIR = isCloud ? null : getLegacyDotDataDir();
const DB_FILE = isCloud ? null : path.join(DATA_DIR, "usage.json");
const LOG_FILE = isCloud ? null : path.join(DATA_DIR, "log.txt");
const CALL_LOGS_DB_FILE = isCloud ? null : path.join(DATA_DIR, "call_logs.json");
const CALL_LOGS_DIR = isCloud ? null : path.join(DATA_DIR, "call_logs");
const LEGACY_DB_FILE = isCloud || !LEGACY_DATA_DIR ? null : path.join(LEGACY_DATA_DIR, "usage.json");
const LEGACY_LOG_FILE = isCloud || !LEGACY_DATA_DIR ? null : path.join(LEGACY_DATA_DIR, "log.txt");
const LEGACY_CALL_LOGS_DB_FILE = isCloud || !LEGACY_DATA_DIR ? null : path.join(LEGACY_DATA_DIR, "call_logs.json");
const LEGACY_CALL_LOGS_DIR = isCloud || !LEGACY_DATA_DIR ? null : path.join(LEGACY_DATA_DIR, "call_logs");

// Ensure data directory exists
if (!isCloud && fs && typeof fs.existsSync === "function") {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log(`[usageDb] Created data directory: ${DATA_DIR}`);
    }
  } catch (error) {
    console.error("[usageDb] Failed to create data directory:", error.message);
  }
}

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
    copyIfMissing(LEGACY_DB_FILE, DB_FILE, "usage history");
    copyIfMissing(LEGACY_LOG_FILE, LOG_FILE, "request log");
    copyIfMissing(LEGACY_CALL_LOGS_DB_FILE, CALL_LOGS_DB_FILE, "call log index");
    copyIfMissing(LEGACY_CALL_LOGS_DIR, CALL_LOGS_DIR, "call log files");
  } catch (error) {
    console.error("[usageDb] Legacy migration failed:", error.message);
  }
}

migrateLegacyUsageFiles();

// Default data structure
const defaultData = {
  history: []
};

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(defaultData));
}

// Singleton instance
let dbInstance = null;

// Track in-flight requests in memory
const pendingRequests = {
  byModel: {},
  byAccount: {}
};

/**
 * Track a pending request
 * @param {string} model
 * @param {string} provider
 * @param {string} connectionId
 * @param {boolean} started - true if started, false if finished
 */
export function trackPendingRequest(model, provider, connectionId, started) {
  const modelKey = provider ? `${model} (${provider})` : model;

  // Track by model
  if (!pendingRequests.byModel[modelKey]) pendingRequests.byModel[modelKey] = 0;
  pendingRequests.byModel[modelKey] = Math.max(0, pendingRequests.byModel[modelKey] + (started ? 1 : -1));

  // Track by account
  if (connectionId) {
    const accountKey = connectionId; // We use connectionId as key here
    if (!pendingRequests.byAccount[accountKey]) pendingRequests.byAccount[accountKey] = {};
    if (!pendingRequests.byAccount[accountKey][modelKey]) pendingRequests.byAccount[accountKey][modelKey] = 0;
    pendingRequests.byAccount[accountKey][modelKey] = Math.max(0, pendingRequests.byAccount[accountKey][modelKey] + (started ? 1 : -1));
  }
}

/**
 * Get usage database instance (singleton)
 */
export async function getUsageDb() {
  if (isCloud || isBuildPhase) {
    // Return in-memory DB for Workers/build to avoid disk writes during build.
    if (!dbInstance) {
      const data = cloneDefaultData();
      dbInstance = new Low({ read: async () => {}, write: async () => {} }, data);
      dbInstance.data = data;
      if (isBuildPhase) {
        console.log("[usageDb] Build phase detected — using in-memory usage DB (read-only)");
      }
    }
    return dbInstance;
  }

  if (!dbInstance) {
    const adapter = new JSONFile(DB_FILE);
    dbInstance = new Low(adapter, cloneDefaultData());

    // Try to read DB with error recovery for corrupt JSON
    try {
      await dbInstance.read();
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn('[DB] Corrupt Usage JSON detected, resetting to defaults...');
        dbInstance.data = cloneDefaultData();
        await dbInstance.write();
      } else {
        throw error;
      }
    }

    // Initialize with default data if empty
    if (!dbInstance.data) {
      dbInstance.data = cloneDefaultData();
      await dbInstance.write();
    }
  }
  return dbInstance;
}

/**
 * Save request usage
 * @param {object} entry - Usage entry { provider, model, tokens, connectionId?, apiKeyId?, apiKeyName? }
 */
export async function saveRequestUsage(entry) {
  if (!shouldPersistToDisk) return; // Skip saving in workers/build phase

  try {
    const db = await getUsageDb();

    // Add timestamp if not present
    if (!entry.timestamp) {
      entry.timestamp = new Date().toISOString();
    }

    // Ensure history array exists
    if (!Array.isArray(db.data.history)) {
      db.data.history = [];
    }

    db.data.history.push(entry);

    // Optional: Limit history size if needed in future
    // if (db.data.history.length > 10000) db.data.history.shift();

    await db.write();
  } catch (error) {
    console.error("Failed to save usage stats:", error);
  }
}

/**
 * Get usage history
 * @param {object} filter - Filter criteria
 */
export async function getUsageHistory(filter = {}) {
  const db = await getUsageDb();
  let history = db.data.history || [];

  // Apply filters
  if (filter.provider) {
    history = history.filter(h => h.provider === filter.provider);
  }

  if (filter.model) {
    history = history.filter(h => h.model === filter.model);
  }

  if (filter.startDate) {
    const start = new Date(filter.startDate).getTime();
    history = history.filter(h => new Date(h.timestamp).getTime() >= start);
  }

  if (filter.endDate) {
    const end = new Date(filter.endDate).getTime();
    history = history.filter(h => new Date(h.timestamp).getTime() <= end);
  }

  return history;
}

/**
 * Format date as dd-mm-yyyy h:m:s
 */
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
  if (!shouldPersistToDisk) return; // Skip logging in workers/build phase

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
  if (!shouldPersistToDisk) return []; // Skip in workers/build phase
  
  // Runtime check: ensure fs module is available
  if (!fs || typeof fs.existsSync !== "function") {
    console.error("[usageDb] fs module not available in this environment");
    return [];
  }
  
  if (!LOG_FILE) {
    console.error("[usageDb] LOG_FILE path not defined");
    return [];
  }
  
  if (!fs.existsSync(LOG_FILE)) {
    console.log(`[usageDb] Log file does not exist: ${LOG_FILE}`);
    return [];
  }
  
  try {
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n");
    return lines.slice(-limit).reverse();
  } catch (error) {
    console.error("[usageDb] Failed to read log.txt:", error.message);
    console.error("[usageDb] LOG_FILE path:", LOG_FILE);
    return [];
  }
}

/**
 * Calculate cost for a usage entry
 * @param {string} provider - Provider ID
 * @param {string} model - Model ID
 * @param {object} tokens - Token counts
 * @returns {number} Cost in dollars
 */
export async function calculateCost(provider, model, tokens) {
  if (!tokens || !provider || !model) return 0;

  try {
    const { getPricingForModel } = await import("@/lib/localDb.js");
    const pricing = await getPricingForModel(provider, model);

    if (!pricing) return 0;

    let cost = 0;

    // Input tokens (non-cached) — support both stored format (input/output) and OpenAI format
    const inputTokens = tokens.input ?? tokens.prompt_tokens ?? tokens.input_tokens ?? 0;
    const cachedTokens = tokens.cacheRead ?? tokens.cached_tokens ?? tokens.cache_read_input_tokens ?? 0;
    const nonCachedInput = Math.max(0, inputTokens - cachedTokens);

    cost += (nonCachedInput * (pricing.input / 1000000));

    // Cached tokens
    if (cachedTokens > 0) {
      const cachedRate = pricing.cached || pricing.input; // Fallback to input rate
      cost += (cachedTokens * (cachedRate / 1000000));
    }

    // Output tokens
    const outputTokens = tokens.output ?? tokens.completion_tokens ?? tokens.output_tokens ?? 0;
    cost += (outputTokens * (pricing.output / 1000000));

    // Reasoning tokens
    const reasoningTokens = tokens.reasoning ?? tokens.reasoning_tokens ?? 0;
    if (reasoningTokens > 0) {
      const reasoningRate = pricing.reasoning || pricing.output; // Fallback to output rate
      cost += (reasoningTokens * (reasoningRate / 1000000));
    }

    // Cache creation tokens
    const cacheCreationTokens = tokens.cacheCreation ?? tokens.cache_creation_input_tokens ?? 0;
    if (cacheCreationTokens > 0) {
      const cacheCreationRate = pricing.cache_creation || pricing.input; // Fallback to input rate
      cost += (cacheCreationTokens * (cacheCreationRate / 1000000));
    }

    return cost;
  } catch (error) {
    console.error("Error calculating cost:", error);
    return 0;
  }
}

/**
 * Get aggregated usage stats
 */
export async function getUsageStats() {
  const db = await getUsageDb();
  const history = db.data.history || [];

  // Import localDb to get provider connection names
  const { getProviderConnections } = await import("@/lib/localDb.js");

  // Fetch all provider connections to get account names
  let allConnections = [];
  try {
    allConnections = await getProviderConnections();
  } catch (error) {
    // If localDb is not available (e.g., in some environments), continue without account names
    console.warn("Could not fetch provider connections for usage stats:", error.message);
  }

  // Create a map from connectionId to account name
  const connectionMap = {};
  for (const conn of allConnections) {
    connectionMap[conn.id] = conn.name || conn.email || conn.id;
  }

  const stats = {
    totalRequests: history.length,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCost: 0, // NEW
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
        // modelKey is "model (provider)"
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

  // Initialize 10-minute buckets using stable minute boundaries
  const now = new Date();
  // Floor to the start of the current minute
  const currentMinuteStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const tenMinutesAgo = new Date(currentMinuteStart.getTime() - 9 * 60 * 1000);

  // Create buckets keyed by minute timestamp for stable lookups
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

    // Calculate cost for this entry
    const entryCost = await calculateCost(entry.provider, entry.model, entry.tokens);

    stats.totalPromptTokens += promptTokens;
    stats.totalCompletionTokens += completionTokens;
    stats.totalCost += entryCost;

    // Last 10 minutes aggregation - floor entry time to its minute
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
      stats.byProvider[entry.provider] = {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0
      };
    }
    stats.byProvider[entry.provider].requests++;
    stats.byProvider[entry.provider].promptTokens += promptTokens;
    stats.byProvider[entry.provider].completionTokens += completionTokens;
    stats.byProvider[entry.provider].cost += entryCost;

    // By Model
    // Format: "modelName (provider)" if provider is known
    const modelKey = entry.provider ? `${entry.model} (${entry.provider})` : entry.model;

    if (!stats.byModel[modelKey]) {
      stats.byModel[modelKey] = {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        rawModel: entry.model,
        provider: entry.provider,
        lastUsed: entry.timestamp
      };
    }
    stats.byModel[modelKey].requests++;
    stats.byModel[modelKey].promptTokens += promptTokens;
    stats.byModel[modelKey].completionTokens += completionTokens;
    stats.byModel[modelKey].cost += entryCost;
    if (new Date(entry.timestamp) > new Date(stats.byModel[modelKey].lastUsed)) {
      stats.byModel[modelKey].lastUsed = entry.timestamp;
    }

    // By Account (model + oauth account)
    // Use connectionId if available, otherwise fallback to provider name
    if (entry.connectionId) {
      const accountName = connectionMap[entry.connectionId] || `Account ${entry.connectionId.slice(0, 8)}...`;
      const accountKey = `${entry.model} (${entry.provider} - ${accountName})`;

      if (!stats.byAccount[accountKey]) {
        stats.byAccount[accountKey] = {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cost: 0,
          rawModel: entry.model,
          provider: entry.provider,
          connectionId: entry.connectionId,
          accountName: accountName,
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
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cost: 0,
          apiKeyId: keyId,
          apiKeyName: keyName,
          lastUsed: entry.timestamp
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

// ============================================================================
// Call Logs — Structured JSON logs for the enhanced Logger UI
// ============================================================================

// In-memory ring buffer for fast reads (last 500 entries)
let callLogsBuffer = [];
const CALL_LOGS_MAX = 500;

// Call logs LowDB singleton  
let callLogsDbInstance = null;

async function getCallLogsDb() {
  if (!shouldPersistToDisk || !CALL_LOGS_DB_FILE) return null;
  
  if (!callLogsDbInstance) {
    const adapter = new JSONFile(CALL_LOGS_DB_FILE);
    callLogsDbInstance = new Low(adapter, { logs: [] });
    
    try {
      await callLogsDbInstance.read();
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn('[DB] Corrupt call_logs.json, resetting...');
        callLogsDbInstance.data = { logs: [] };
        await callLogsDbInstance.write();
      } else {
        throw error;
      }
    }
    
    if (!callLogsDbInstance.data) {
      callLogsDbInstance.data = { logs: [] };
      await callLogsDbInstance.write();
    }
    
    // Seed in-memory buffer from disk
    callLogsBuffer = (callLogsDbInstance.data.logs || []).slice(-CALL_LOGS_MAX);
  }
  return callLogsDbInstance;
}

// Generate unique ID for each log entry
let logIdCounter = 0;
function generateLogId() {
  logIdCounter++;
  return `${Date.now()}-${logIdCounter}`;
}

/**
 * Save a structured call log entry
 * @param {object} entry
 * @param {string} entry.method - HTTP method (POST)
 * @param {string} entry.path - Request path (/v1/chat/completions)
 * @param {number} entry.status - HTTP status code (200, 500, etc.)
 * @param {string} entry.model - Model name
 * @param {string} entry.provider - Provider ID
 * @param {string} entry.connectionId - Connection ID
 * @param {number} entry.duration - Duration in ms
 * @param {object} entry.tokens - { prompt_tokens, completion_tokens }
 * @param {object} entry.requestBody - Full request JSON (truncated if too large)
 * @param {object} entry.responseBody - Full response JSON (truncated if too large)
 * @param {string} entry.error - Error message if failed
 * @param {string} entry.sourceFormat - Source format (openai, claude, etc.)
 * @param {string} entry.targetFormat - Target format
 * @param {string} entry.apiKeyId - API key ID used by the client request
 * @param {string} entry.apiKeyName - API key display name used by the client request
 */
export async function saveCallLog(entry) {
  if (!shouldPersistToDisk) return;
  
  try {
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
    
    // Truncate large payloads for in-memory/DB storage (keep under 8KB each)
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
    
    // 2. Persist to LowDB (async, no await to avoid blocking)
    const persistToDb = async () => {
      try {
        const db = await getCallLogsDb();
        if (!db) return;
        if (!Array.isArray(db.data.logs)) db.data.logs = [];
        db.data.logs.push(logEntry);
        // Keep DB lean — max 500 entries
        if (db.data.logs.length > CALL_LOGS_MAX) {
          db.data.logs = db.data.logs.slice(-CALL_LOGS_MAX);
        }
        await db.write();
      } catch (err) {
        console.error("[callLogs] Failed to persist to DB:", err.message);
      }
    };
    persistToDb();
    
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
 * @param {object} filter
 * @param {string} filter.status - "error" or "ok" or number
 * @param {string} filter.model - Model name substring
 * @param {string} filter.provider - Provider ID
 * @param {string} filter.account - Account name substring
 * @param {string} filter.apiKey - API key ID or name substring
 * @param {string} filter.search - Free text search across model, path, account, provider, apiKey, comboName
 * @param {number} filter.limit - Max entries (default 200)
 */
export async function getCallLogs(filter = {}) {
  // Always re-read from DB to pick up entries written by the SSE handler
  const db = await getCallLogsDb();
  if (db) {
    await db.read();
    callLogsBuffer = (db.data?.logs || []).slice(-CALL_LOGS_MAX);
  }
  
  let logs = [...callLogsBuffer];
  
  // Apply filters
  if (filter.status) {
    if (filter.status === "error") {
      logs = logs.filter(l => l.status >= 400 || l.error);
    } else if (filter.status === "ok") {
      logs = logs.filter(l => l.status >= 200 && l.status < 300);
    } else {
      const statusCode = parseInt(filter.status);
      if (!isNaN(statusCode)) {
        logs = logs.filter(l => l.status === statusCode);
      }
    }
  }
  
  if (filter.model) {
    const q = filter.model.toLowerCase();
    logs = logs.filter(l => l.model?.toLowerCase().includes(q));
  }
  
  if (filter.provider) {
    const q = filter.provider.toLowerCase();
    logs = logs.filter(l => l.provider?.toLowerCase().includes(q));
  }
  
  if (filter.account) {
    const q = filter.account.toLowerCase();
    logs = logs.filter(l => l.account?.toLowerCase().includes(q));
  }

  if (filter.apiKey) {
    const q = filter.apiKey.toLowerCase();
    logs = logs.filter(l =>
      l.apiKeyName?.toLowerCase().includes(q) ||
      l.apiKeyId?.toLowerCase().includes(q)
    );
  }
  
  if (filter.search) {
    const q = filter.search.toLowerCase();
    logs = logs.filter(l => 
      l.model?.toLowerCase().includes(q) ||
      l.path?.toLowerCase().includes(q) ||
      l.account?.toLowerCase().includes(q) ||
      l.provider?.toLowerCase().includes(q) ||
      l.apiKeyName?.toLowerCase().includes(q) ||
      l.apiKeyId?.toLowerCase().includes(q) ||
      l.comboName?.toLowerCase().includes(q) ||
      String(l.status).includes(q)
    );
  }
  
  const limit = filter.limit || 200;
  
  // Return newest first, without large payloads in list view
  return logs.slice(-limit).reverse().map(l => ({
    id: l.id,
    timestamp: l.timestamp,
    method: l.method,
    path: l.path,
    status: l.status,
    model: l.model,
    provider: l.provider,
    account: l.account,
    duration: l.duration,
    tokens: l.tokens,
    sourceFormat: l.sourceFormat,
    targetFormat: l.targetFormat,
    error: l.error,
    comboName: l.comboName || null,
    apiKeyId: l.apiKeyId || null,
    apiKeyName: l.apiKeyName || null,
    hasRequestBody: !!l.requestBody,
    hasResponseBody: !!l.responseBody,
  }));
}

/**
 * Get a single call log by ID (with full payloads from disk when available)
 */
export async function getCallLogById(id) {
  // Always re-read from DB to pick up entries written by the SSE handler
  const db = await getCallLogsDb();
  if (db) {
    await db.read();
    callLogsBuffer = (db.data?.logs || []).slice(-CALL_LOGS_MAX);
  }
  
  const entry = callLogsBuffer.find(l => l.id === id);
  if (!entry) return null;
  
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
}

/**
 * Read the full (untruncated) log entry from disk by matching timestamp + model + status
 */
function readFullLogFromDisk(entry) {
  if (!CALL_LOGS_DIR || !entry.timestamp) return null;
  
  try {
    const date = new Date(entry.timestamp);
    const dateFolder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dir = path.join(CALL_LOGS_DIR, dateFolder);
    
    if (!fs.existsSync(dir)) return null;
    
    // Build expected filename prefix: HHMMSS_model_status.json
    const time = `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
    const safeModel = (entry.model || "unknown").replace(/[/:]/g, "-");
    const expectedName = `${time}_${safeModel}_${entry.status}.json`;
    
    // Try exact match first
    const exactPath = path.join(dir, expectedName);
    if (fs.existsSync(exactPath)) {
      return JSON.parse(fs.readFileSync(exactPath, "utf8"));
    }
    
    // Fallback: search by time prefix + status suffix
    const files = fs.readdirSync(dir).filter(f => f.startsWith(time) && f.endsWith(`_${entry.status}.json`));
    if (files.length > 0) {
      return JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"));
    }
  } catch (err) {
    console.error("[callLogs] Disk log read error:", err.message);
  }
  
  return null;
}
