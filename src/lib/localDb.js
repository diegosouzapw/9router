import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { v4 as uuidv4 } from "uuid";
import path from "node:path";
import fs from "node:fs";
import { resolveDataDir, getLegacyDotDataDir, isSamePath } from "./dataPaths.js";

// Detect Cloudflare Workers / edge runtime.
// Workers expose a `caches` global (CacheStorage). In Node.js this is undefined.
const isCloud =
  typeof globalThis.caches === "object" && globalThis.caches !== null;

// Detect Next.js build phase — NEVER write to the real DB during build.
// This prevents `npx next build` from evaluating server modules and
// overwriting the production database with empty defaults.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

// Data file path - stored in user home directory
const DATA_DIR = resolveDataDir({ isCloud });
const LEGACY_DATA_DIR = isCloud ? null : getLegacyDotDataDir();
const DB_FILE = isCloud ? null : path.join(DATA_DIR, "db.json");
const LEGACY_DB_FILE = isCloud || !LEGACY_DATA_DIR ? null : path.join(LEGACY_DATA_DIR, "db.json");
const DB_BACKUPS_DIR = isCloud ? null : path.join(DATA_DIR, "db_backups");
const LEGACY_DB_BACKUPS_DIR = isCloud || !LEGACY_DATA_DIR ? null : path.join(LEGACY_DATA_DIR, "db_backups");

// Ensure data directory exists
if (!isCloud && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function migrateLegacyDbFiles() {
  if (isCloud || isBuildPhase || !LEGACY_DATA_DIR) return;
  if (isSamePath(DATA_DIR, LEGACY_DATA_DIR)) return;

  try {
    if (LEGACY_DB_FILE && fs.existsSync(LEGACY_DB_FILE) && DB_FILE && !fs.existsSync(DB_FILE)) {
      fs.copyFileSync(LEGACY_DB_FILE, DB_FILE);
      console.log(`[DB] Migrated legacy db.json: ${LEGACY_DB_FILE} -> ${DB_FILE}`);
    }

    if (
      LEGACY_DB_BACKUPS_DIR &&
      DB_BACKUPS_DIR &&
      fs.existsSync(LEGACY_DB_BACKUPS_DIR) &&
      !fs.existsSync(DB_BACKUPS_DIR)
    ) {
      fs.cpSync(LEGACY_DB_BACKUPS_DIR, DB_BACKUPS_DIR, { recursive: true });
      console.log(`[DB] Migrated legacy backups: ${LEGACY_DB_BACKUPS_DIR} -> ${DB_BACKUPS_DIR}`);
    }
  } catch (error) {
    console.error("[DB] Legacy migration failed:", error.message);
  }
}

migrateLegacyDbFiles();

// Default data structure
const defaultData = {
  providerConnections: [],
  providerNodes: [],
  modelAliases: {},
  mitmAlias: {},
  combos: [],
  apiKeys: [],
  settings: {
    cloudEnabled: false,
    stickyRoundRobinLimit: 3,
    requireLogin: true
  },
  pricing: {} // NEW: pricing configuration
};

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(defaultData));
}

// Throttle: track last backup time to avoid flooding during rapid writes.
let _lastBackupAt = 0;
const BACKUP_THROTTLE_MS = 5000; // 5 seconds
const MAX_DB_BACKUPS = 10;

/**
 * Create a timestamped backup of the DB file.
 * Called automatically before every write via withWriteLock.
 * Throttled to at most once every 5 seconds to avoid flooding.
 */
function backupDbFile(reason = "auto") {
  try {
    if (!DB_FILE || !fs.existsSync(DB_FILE)) return;
    const stat = fs.statSync(DB_FILE);
    // Skip if file is essentially empty (just default structure, no real data)
    if (stat.size <= 100) return;

    // Throttle: skip if we already backed up recently
    const now = Date.now();
    if (now - _lastBackupAt < BACKUP_THROTTLE_MS) return;
    _lastBackupAt = now;

    const backupDir = DB_BACKUPS_DIR || path.join(DATA_DIR, "db_backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `db_${timestamp}_${reason}.json`);
    fs.copyFileSync(DB_FILE, backupFile);
    console.log(`[DB] Backup created: ${backupFile} (${stat.size} bytes)`);
    // Enforce rotation — keep only last N backups
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith("db_") && f.endsWith(".json")).sort();
    while (files.length > MAX_DB_BACKUPS) {
      const oldest = files.shift();
      fs.unlinkSync(path.join(backupDir, oldest));
    }
  } catch (err) {
    console.error("[DB] Backup failed:", err.message);
  }
}

function ensureDbShape(data) {
  const defaults = cloneDefaultData();
  const next = data && typeof data === "object" ? data : {};
  let changed = false;

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (next[key] === undefined || next[key] === null) {
      next[key] = defaultValue;
      changed = true;
      continue;
    }

    if (
      key === "settings" &&
      (typeof next.settings !== "object" || Array.isArray(next.settings))
    ) {
      next.settings = { ...defaultValue };
      changed = true;
      continue;
    }

    if (
      key === "settings" &&
      typeof next.settings === "object" &&
      !Array.isArray(next.settings)
    ) {
      for (const [settingKey, settingDefault] of Object.entries(defaultValue)) {
        if (next.settings[settingKey] === undefined) {
          next.settings[settingKey] = settingDefault;
          changed = true;
        }
      }
    }
  }

  return { data: next, changed };
}

// ---------- Write Lock (Mutex) ----------
// Prevents race conditions by processing read-modify-write operations sequentially.
// LowDB is synchronous in memory but async on disk. Without this lock, concurrent
// requests could read stale data, modify it, and overwrite each other's changes.

let mutexPromise = Promise.resolve();

// Guard flag: when true, getDb() skips await dbInstance.read() because the
// write lock already guarantees in-memory consistency.  This prevents the
// ENOENT race condition where LowDB's atomic rename of .db.json.tmp → db.json
// collides with a concurrent read triggered by a queued write-lock callback.
let _insideWriteLock = false;

/**
 * Execute a function with exclusive access to the database (Read-Modify-Write cycle).
 * @param {Function} callback - Async function that gets exclusive access
 * @returns {Promise<any>} Result of the callback
 */
async function withWriteLock(callback) {
  // Enqueue the callback
  const resultPromise = mutexPromise.then(async () => {
    _insideWriteLock = true;
    try {
      // Auto-backup BEFORE every write operation (throttled)
      backupDbFile("pre-write");
      return await callback();
    } catch (error) {
      console.error("[DB] Write lock error:", error);
      throw error;
    } finally {
      _insideWriteLock = false;
    }
  });

  // Advance the queue tail, ensuring we catch errors so the queue doesn't stall
  mutexPromise = resultPromise.catch(() => {});
  
  return resultPromise;
}

// Singleton instance
let dbInstance = null;

/**
 * Get database instance (singleton)
 */
export async function getDb() {
  if (isCloud) {
    // Return in-memory DB for Workers
    if (!dbInstance) {
      const data = cloneDefaultData();
      dbInstance = new Low({ read: async () => {}, write: async () => {} }, data);
      dbInstance.data = data;
    }
    return dbInstance;
  }

  // During build phase, return an in-memory DB to prevent overwriting real data
  if (isBuildPhase) {
    if (!dbInstance) {
      const data = cloneDefaultData();
      dbInstance = new Low({ read: async () => {}, write: async () => {} }, data);
      dbInstance.data = data;
      console.log('[DB] Build phase detected — using in-memory DB (read-only)');
    }
    return dbInstance;
  }

  if (!dbInstance) {
    const adapter = new JSONFile(DB_FILE);
    dbInstance = new Low(adapter, cloneDefaultData());
  }

  // Skip disk read when called from inside withWriteLock — the mutex already
  // guarantees in-memory consistency andthe disk re-read causes ENOENT race
  // conditions with LowDB's atomic .tmp → .json rename.
  if (!_insideWriteLock) {
    // Read latest disk state for non-locked reads (API GET routes, etc.)
    try {
      await dbInstance.read();
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn('[DB] Corrupt JSON detected — creating backup before reset...');
        backupDbFile('corrupt');
        dbInstance.data = cloneDefaultData();
        await dbInstance.write();
      } else {
        throw error;
      }
    }
  }

  // Initialize/migrate missing keys for older DB schema versions.
  if (!dbInstance.data) {
    // File exists but read returned null — likely empty or unreadable.
    // Backup first in case there's recoverable content.
    console.warn('[DB] No data after read — creating backup before initializing...');
    backupDbFile('null-data');
    dbInstance.data = cloneDefaultData();
    await dbInstance.write();
  } else {
    const { data, changed } = ensureDbShape(dbInstance.data);
    dbInstance.data = data;
    if (changed) {
      await dbInstance.write();
    }
  }

  return dbInstance;
}

// ============ Provider Connections ============

/**
 * Get all provider connections
 */
export async function getProviderConnections(filter = {}) {
  const db = await getDb();
  let connections = db.data.providerConnections || [];
  
  if (filter.provider) {
    connections = connections.filter(c => c.provider === filter.provider);
  }
  if (filter.isActive !== undefined) {
    connections = connections.filter(c => c.isActive === filter.isActive);
  }
  
  // Sort by priority (lower = higher priority)
  connections.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  
  return connections;
}

// ============ Provider Nodes ============

/**
 * Get provider nodes
 */
export async function getProviderNodes(filter = {}) {
  const db = await getDb();
  let nodes = db.data.providerNodes || [];

  if (filter.type) {
    nodes = nodes.filter((node) => node.type === filter.type);
  }

  return nodes;
}

/**
 * Get provider node by ID
 */
export async function getProviderNodeById(id) {
  const db = await getDb();
  return db.data.providerNodes.find((node) => node.id === id) || null;
}

/**
 * Create provider node
 */
export async function createProviderNode(data) {
  return withWriteLock(async () => {
    const db = await getDb();
    
    if (!db.data.providerNodes) {
      db.data.providerNodes = [];
    }
    
    const now = new Date().toISOString();

    const node = {
      id: data.id || uuidv4(),
      type: data.type,
      name: data.name,
      prefix: data.prefix,
      apiType: data.apiType,
      baseUrl: data.baseUrl,
      createdAt: now,
      updatedAt: now,
    };

    db.data.providerNodes.push(node);
    await db.write();

    return node;
  });
}

/**
 * Update provider node
 */
export async function updateProviderNode(id, data) {
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.providerNodes) {
      db.data.providerNodes = [];
    }
    
    const index = db.data.providerNodes.findIndex((node) => node.id === id);

    if (index === -1) return null;

    db.data.providerNodes[index] = {
      ...db.data.providerNodes[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await db.write();

    return db.data.providerNodes[index];
  });
}

/**
 * Delete provider node
 */
export async function deleteProviderNode(id) {
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.providerNodes) {
      db.data.providerNodes = [];
    }
    
    const index = db.data.providerNodes.findIndex((node) => node.id === id);

    if (index === -1) return null;

    const [removed] = db.data.providerNodes.splice(index, 1);
    await db.write();

    return removed;
  });
}

/**
 * Delete all provider connections by provider ID
 */
export async function deleteProviderConnectionsByProvider(providerId) {
  return withWriteLock(async () => {
    const db = await getDb();
    const beforeCount = db.data.providerConnections.length;
    db.data.providerConnections = db.data.providerConnections.filter(
      (connection) => connection.provider !== providerId
    );
    const deletedCount = beforeCount - db.data.providerConnections.length;
    await db.write();
    return deletedCount;
  });
}

/**
 * Get provider connection by ID
 */
export async function getProviderConnectionById(id) {
  const db = await getDb();
  return db.data.providerConnections.find(c => c.id === id) || null;
}

/**
 * Create or update provider connection (upsert by provider + email/name)
 */
export async function createProviderConnection(data) {
  return withWriteLock(async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    
    // Check for existing connection with same provider and email (for OAuth)
    // or same provider and name (for API key)
    let existingIndex = -1;
    if (data.authType === "oauth" && data.email) {
      existingIndex = db.data.providerConnections.findIndex(
        c => c.provider === data.provider && c.authType === "oauth" && c.email === data.email
      );
    } else if (data.authType === "apikey" && data.name) {
      existingIndex = db.data.providerConnections.findIndex(
        c => c.provider === data.provider && c.authType === "apikey" && c.name === data.name
      );
    }
    
    // If exists, update instead of create
    if (existingIndex !== -1) {
      db.data.providerConnections[existingIndex] = {
        ...db.data.providerConnections[existingIndex],
        ...data,
        updatedAt: now,
      };
      await db.write();
      return db.data.providerConnections[existingIndex];
    }
    
    // Generate name for OAuth if not provided
    let connectionName = data.name || null;
    if (!connectionName && data.authType === "oauth") {
      if (data.email) {
        connectionName = data.email;
      } else {
        const existingCount = db.data.providerConnections.filter(
          c => c.provider === data.provider
        ).length;
        connectionName = `Account ${existingCount + 1}`;
      }
    }

    // Auto-increment priority if not provided
    let connectionPriority = data.priority;
    if (!connectionPriority) {
      const providerConnections = db.data.providerConnections.filter(
        c => c.provider === data.provider
      );
      const maxPriority = providerConnections.reduce((max, c) => Math.max(max, c.priority || 0), 0);
      connectionPriority = maxPriority + 1;
    }
    
    // Create new connection - only save fields with actual values
    const connection = {
      id: uuidv4(),
      provider: data.provider,
      authType: data.authType || "oauth",
      name: connectionName,
      priority: connectionPriority,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: now,
      updatedAt: now,
    };

    const optionalFields = [
      "displayName", "email", "globalPriority", "defaultModel",
      "accessToken", "refreshToken", "expiresAt", "tokenType",
      "scope", "idToken", "projectId", "apiKey", "testStatus",
      "lastTested", "lastError", "lastErrorAt", "lastErrorType", "lastErrorSource", "rateLimitedUntil", "expiresIn", "errorCode",
      "consecutiveUseCount"
    ];
    
    for (const field of optionalFields) {
      if (data[field] !== undefined && data[field] !== null) {
        connection[field] = data[field];
      }
    }

    if (data.providerSpecificData && Object.keys(data.providerSpecificData).length > 0) {
      connection.providerSpecificData = data.providerSpecificData;
    }
    
    db.data.providerConnections.push(connection);
    await db.write();

    // Reorder to ensure consistency (nested lock? no, reorder calls getDb/write too)
    // We must call the internal logic of reorder here or call it after lock.
    // reorderProviderConnections uses getDb() which reads from disk (safe) and writes.
    // Ideally we should do it in the same lock or right after.
    // Since we are in a lock, let's call the logic directly to avoid releasing lock.
    
    await _reorderProviderConnectionsInternal(db, data.provider);

    return connection;
  });
}

/**
 * Update provider connection
 */
export async function updateProviderConnection(id, data) {
  return withWriteLock(async () => {
    const db = await getDb();
    const index = db.data.providerConnections.findIndex(c => c.id === id);

    if (index === -1) return null;

    const providerId = db.data.providerConnections[index].provider;

    db.data.providerConnections[index] = {
      ...db.data.providerConnections[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await db.write();

    if (data.priority !== undefined) {
      await _reorderProviderConnectionsInternal(db, providerId);
    }

    return db.data.providerConnections[index];
  });
}

/**
 * Delete provider connection
 */
export async function deleteProviderConnection(id) {
  return withWriteLock(async () => {
    const db = await getDb();
    const index = db.data.providerConnections.findIndex(c => c.id === id);

    if (index === -1) return false;

    const providerId = db.data.providerConnections[index].provider;

    db.data.providerConnections.splice(index, 1);
    await db.write();

    await _reorderProviderConnectionsInternal(db, providerId);

    return true;
  });
}

/**
 * Reorder provider connections (Public wrapper)
 */
export async function reorderProviderConnections(providerId) {
  return withWriteLock(async () => {
    const db = await getDb();
    await _reorderProviderConnectionsInternal(db, providerId);
  });
}

/**
 * Internal reorder logic (reuses db instance)
 */
async function _reorderProviderConnectionsInternal(db, providerId) {
  if (!db.data.providerConnections) return;

  const providerConnections = db.data.providerConnections
    .filter(c => c.provider === providerId)
    .sort((a, b) => {
      const pDiff = (a.priority || 0) - (b.priority || 0);
      if (pDiff !== 0) return pDiff;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });

  providerConnections.forEach((conn, index) => {
    conn.priority = index + 1;
  });

  await db.write();
}

// ============ Model Aliases ============

export async function getModelAliases() {
  const db = await getDb();
  return db.data.modelAliases || {};
}

export async function setModelAlias(alias, model) {
  return withWriteLock(async () => {
    const db = await getDb();
    db.data.modelAliases[alias] = model;
    await db.write();
  });
}

export async function deleteModelAlias(alias) {
  return withWriteLock(async () => {
    const db = await getDb();
    delete db.data.modelAliases[alias];
    await db.write();
  });
}

// ============ MITM Alias ============

export async function getMitmAlias(toolName) {
  const db = await getDb();
  const all = db.data.mitmAlias || {};
  if (toolName) return all[toolName] || {};
  return all;
}

export async function setMitmAliasAll(toolName, mappings) {
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.mitmAlias) db.data.mitmAlias = {};
    db.data.mitmAlias[toolName] = mappings || {};
    await db.write();
  });
}

// ============ Combos ============

export async function getCombos() {
  const db = await getDb();
  return db.data.combos || [];
}

export async function getComboById(id) {
  const db = await getDb();
  return (db.data.combos || []).find(c => c.id === id) || null;
}

export async function getComboByName(name) {
  const db = await getDb();
  return (db.data.combos || []).find(c => c.name === name) || null;
}

export async function createCombo(data) {
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.combos) db.data.combos = [];
    
    const now = new Date().toISOString();
    const combo = {
      id: uuidv4(),
      name: data.name,
      models: data.models || [],
      strategy: data.strategy || "priority",
      config: data.config || {},
      createdAt: now,
      updatedAt: now,
    };
    
    db.data.combos.push(combo);
    await db.write();
    return combo;
  });
}

export async function updateCombo(id, data) {
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.combos) db.data.combos = [];
    
    const index = db.data.combos.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    db.data.combos[index] = {
      ...db.data.combos[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    await db.write();
    return db.data.combos[index];
  });
}

export async function deleteCombo(id) {
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.combos) return false;
    
    const index = db.data.combos.findIndex(c => c.id === id);
    if (index === -1) return false;
    
    db.data.combos.splice(index, 1);
    await db.write();
    return true;
  });
}

// ============ API Keys ============

export async function getApiKeys() {
  const db = await getDb();
  return db.data.apiKeys || [];
}

function generateShortKey() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createApiKey(name, machineId) {
  if (!machineId) {
    throw new Error("machineId is required");
  }
  
  return withWriteLock(async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    
    const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
    const result = generateApiKeyWithMachine(machineId);
    
    const apiKey = {
      id: uuidv4(),
      name: name,
      key: result.key,
      machineId: machineId,
      createdAt: now,
    };
    
    db.data.apiKeys.push(apiKey);
    await db.write();
    
    return apiKey;
  });
}

export async function deleteApiKey(id) {
  return withWriteLock(async () => {
    const db = await getDb();
    const index = db.data.apiKeys.findIndex(k => k.id === id);
    
    if (index === -1) return false;
    
    db.data.apiKeys.splice(index, 1);
    await db.write();
    
    return true;
  });
}

export async function validateApiKey(key) {
  const db = await getDb();
  return db.data.apiKeys.some(k => k.key === key);
}

export async function getApiKeyMetadata(key) {
  if (!key) return null;
  const db = await getDb();
  const apiKey = (db.data.apiKeys || []).find((k) => k.key === key);
  if (!apiKey) return null;
  return {
    id: apiKey.id,
    name: apiKey.name,
    machineId: apiKey.machineId,
  };
}

// ============ Data Cleanup ============

export async function cleanupProviderConnections() {
  return withWriteLock(async () => {
    const db = await getDb();
    const fieldsToCheck = [
      "displayName", "email", "globalPriority", "defaultModel",
      "accessToken", "refreshToken", "expiresAt", "tokenType",
      "scope", "idToken", "projectId", "apiKey", "testStatus",
      "lastTested", "lastError", "lastErrorAt", "lastErrorType", "lastErrorSource", "rateLimitedUntil", "expiresIn",
      "consecutiveUseCount"
    ];

    let cleaned = 0;
    for (const connection of db.data.providerConnections) {
      for (const field of fieldsToCheck) {
        if (connection[field] === null || connection[field] === undefined) {
          delete connection[field];
          cleaned++;
        }
      }
      if (connection.providerSpecificData && Object.keys(connection.providerSpecificData).length === 0) {
        delete connection.providerSpecificData;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await db.write();
    }
    return cleaned;
  });
}

// ============ Settings ============

export async function getSettings() {
  const db = await getDb();
  return db.data.settings || { cloudEnabled: false };
}

export async function updateSettings(updates) {
  return withWriteLock(async () => {
    const db = await getDb();
    db.data.settings = {
      ...db.data.settings,
      ...updates
    };
    await db.write();
    return db.data.settings;
  });
}

export async function isCloudEnabled() {
  const settings = await getSettings();
  return settings.cloudEnabled === true;
}

// ============ Pricing ============

export async function getPricing() {
  const db = await getDb();
  const userPricing = db.data.pricing || {};
  const { getDefaultPricing } = await import("@/shared/constants/pricing.js");
  const defaultPricing = getDefaultPricing();

  const mergedPricing = {};

  for (const [provider, models] of Object.entries(defaultPricing)) {
    mergedPricing[provider] = { ...models };
    if (userPricing[provider]) {
      for (const [model, pricing] of Object.entries(userPricing[provider])) {
        if (mergedPricing[provider][model]) {
          mergedPricing[provider][model] = { ...mergedPricing[provider][model], ...pricing };
        } else {
          mergedPricing[provider][model] = pricing;
        }
      }
    }
  }

  for (const [provider, models] of Object.entries(userPricing)) {
    if (!mergedPricing[provider]) {
      mergedPricing[provider] = { ...models };
    } else {
      for (const [model, pricing] of Object.entries(models)) {
        if (!mergedPricing[provider][model]) {
          mergedPricing[provider][model] = pricing;
        }
      }
    }
  }

  return mergedPricing;
}

/**
 * Get pricing for a specific provider and model
 */
export async function getPricingForModel(provider, model) {
  const pricing = await getPricing();

  // Try direct lookup
  if (pricing[provider]?.[model]) {
    return pricing[provider][model];
  }

  // Fallback: use generated provider ID -> alias mapping from registry.
  const { PROVIDER_ID_TO_ALIAS } = await import("open-sse/config/providerModels.js");
  const alias = PROVIDER_ID_TO_ALIAS[provider];
  if (alias && pricing[alias]) {
    return pricing[alias][model] || null;
  }

  // Compatibility fallback for regional IDs that may reuse core pricing tables.
  const normalizedProvider = provider?.replace(/-cn$/, "");
  if (normalizedProvider && normalizedProvider !== provider && pricing[normalizedProvider]) {
    return pricing[normalizedProvider][model] || null;
  }

  return null;
}

/**
 * Update pricing configuration
 * @param {object} pricingData - New pricing data to merge
 */
export async function updatePricing(pricingData) {
  return withWriteLock(async () => {
    const db = await getDb();

    if (!db.data.pricing) {
      db.data.pricing = {};
    }

    for (const [provider, models] of Object.entries(pricingData)) {
      if (!db.data.pricing[provider]) {
        db.data.pricing[provider] = {};
      }

      for (const [model, pricing] of Object.entries(models)) {
        db.data.pricing[provider][model] = pricing;
      }
    }

    await db.write();
    return db.data.pricing;
  });
}

/**
 * Reset pricing to defaults for specific provider/model
 * @param {string} provider - Provider ID
 * @param {string} model - Model ID (optional, if not provided resets entire provider)
 */
export async function resetPricing(provider, model) {
  return withWriteLock(async () => {
    const db = await getDb();

    if (!db.data.pricing) {
      db.data.pricing = {};
    }

    if (model) {
      if (db.data.pricing[provider]) {
        delete db.data.pricing[provider][model];
        if (Object.keys(db.data.pricing[provider]).length === 0) {
          delete db.data.pricing[provider];
        }
      }
    } else {
      delete db.data.pricing[provider];
    }

    await db.write();
    return db.data.pricing;
  });
}

/**
 * Reset all pricing to defaults
 */
export async function resetAllPricing() {
  return withWriteLock(async () => {
    const db = await getDb();
    db.data.pricing = {};
    await db.write();
    return db.data.pricing;
  });
}

// ============ Custom Models ============

/**
 * Get custom models for a specific provider
 * @param {string} providerId - Provider ID (e.g., "openai", "anthropic")
 * @returns {Array} Array of { id, name } objects
 */
export async function getCustomModels(providerId) {
  const db = await getDb();
  const all = db.data.customModels || {};
  if (providerId) return all[providerId] || [];
  return all;
}

/**
 * Get all custom models grouped by provider
 * @returns {Object} Map of providerId -> [{ id, name }]
 */
export async function getAllCustomModels() {
  const db = await getDb();
  return db.data.customModels || {};
}

/**
 * Add a custom model to a provider
 * @param {string} providerId - Provider ID
 * @param {string} modelId - Model identifier
 * @param {string} modelName - Display name (optional, defaults to modelId)
 * @returns {Object} The added model { id, name }
 */
export async function addCustomModel(providerId, modelId, modelName) {
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.customModels) db.data.customModels = {};
    if (!db.data.customModels[providerId]) db.data.customModels[providerId] = [];

    // Deduplicate
    const exists = db.data.customModels[providerId].some(m => m.id === modelId);
    if (exists) {
      return db.data.customModels[providerId].find(m => m.id === modelId);
    }

    const model = { id: modelId, name: modelName || modelId };
    db.data.customModels[providerId].push(model);
    await db.write();
    return model;
  });
}

/**
 * Remove a custom model from a provider
 * @param {string} providerId - Provider ID
 * @param {string} modelId - Model identifier to remove
 * @returns {boolean} true if removed
 */
export async function removeCustomModel(providerId, modelId) {
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.customModels?.[providerId]) return false;

    const before = db.data.customModels[providerId].length;
    db.data.customModels[providerId] = db.data.customModels[providerId].filter(m => m.id !== modelId);

    // Clean up empty arrays
    if (db.data.customModels[providerId].length === 0) {
      delete db.data.customModels[providerId];
    }

    const removed = db.data.customModels[providerId]?.length !== before || before > 0;
    if (removed) await db.write();
    return removed;
  });
}

// ============ Proxy Config ============

const DEFAULT_PROXY_CONFIG = { global: null, providers: {}, combos: {}, keys: {} };

/**
 * Migrate legacy string proxy values to structured objects.
 * Old format: "http://user:pass@host:port" or "socks5://host:port"
 * New format: { type, host, port, username, password }
 */
function migrateProxyEntry(value) {
  if (!value) return null;
  if (typeof value === "object" && value.type) return value; // already structured
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return {
      type: url.protocol.replace(":", "").replace("//", "") || "http",
      host: url.hostname,
      port: url.port || (url.protocol === "socks5:" ? "1080" : "8080"),
      username: url.username || "",
      password: url.password || "",
    };
  } catch {
    // Plain host:port format
    const parts = value.split(":");
    return {
      type: "http",
      host: parts[0] || value,
      port: parts[1] || "8080",
      username: "",
      password: "",
    };
  }
}

/**
 * Get full proxy configuration (all 4 levels)
 * @returns {Object} { global, providers, combos, keys }
 */
export async function getProxyConfig() {
  const db = await getDb();
  const raw = db.data.proxyConfig || { ...DEFAULT_PROXY_CONFIG };

  // Ensure all levels exist
  if (!raw.combos) raw.combos = {};
  if (!raw.keys) raw.keys = {};
  if (!raw.providers) raw.providers = {};

  // Migrate legacy string values (one-time on read)
  let migrated = false;
  if (raw.global && typeof raw.global === "string") {
    raw.global = migrateProxyEntry(raw.global);
    migrated = true;
  }
  for (const [k, v] of Object.entries(raw.providers)) {
    if (typeof v === "string") {
      raw.providers[k] = migrateProxyEntry(v);
      migrated = true;
    }
  }
  if (migrated) {
    db.data.proxyConfig = raw;
    // Don't await write here to avoid lock issues — will be saved on next write
  }

  return raw;
}

/**
 * Get proxy for a specific level and id
 * @param {"global"|"provider"|"combo"|"key"} level
 * @param {string} [id] - required for provider/combo/key
 * @returns {Object|null} proxy entry or null
 */
export async function getProxyForLevel(level, id) {
  const config = await getProxyConfig();
  if (level === "global") return config.global || null;
  const map = config[level + "s"] || config[level] || {};
  return (id ? map[id] : null) || null;
}

/**
 * Set proxy for a specific level and id
 * @param {"global"|"provider"|"combo"|"key"} level
 * @param {string|null} id - null for global
 * @param {Object|null} proxy - structured proxy entry or null to clear
 */
export async function setProxyForLevel(level, id, proxy) {
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.proxyConfig) db.data.proxyConfig = { ...DEFAULT_PROXY_CONFIG };
    if (!db.data.proxyConfig.combos) db.data.proxyConfig.combos = {};
    if (!db.data.proxyConfig.keys) db.data.proxyConfig.keys = {};
    if (!db.data.proxyConfig.providers) db.data.proxyConfig.providers = {};

    if (level === "global") {
      db.data.proxyConfig.global = proxy || null;
    } else {
      const mapKey = level + "s"; // providers, combos, keys
      if (!db.data.proxyConfig[mapKey]) db.data.proxyConfig[mapKey] = {};
      if (proxy) {
        db.data.proxyConfig[mapKey][id] = proxy;
      } else {
        delete db.data.proxyConfig[mapKey][id];
      }
    }

    await db.write();
    return db.data.proxyConfig;
  });
}

/**
 * Delete proxy at a specific level and id
 */
export async function deleteProxyForLevel(level, id) {
  return setProxyForLevel(level, id, null);
}

/**
 * Resolve effective proxy for a connection (key) using 4-level cascade:
 * key → combo → provider → global
 * @param {string} connectionId - provider connection ID
 * @returns {{ proxy: Object|null, level: string, levelId: string|null }}
 */
export async function resolveProxyForConnection(connectionId) {
  const config = await getProxyConfig();

  // Level 1: Key-level
  if (connectionId && config.keys?.[connectionId]) {
    return { proxy: config.keys[connectionId], level: "key", levelId: connectionId };
  }

  // To check combo and provider, we need the connection info
  const db = await getDb();
  const connection = db.data.providerConnections?.find(c => c.id === connectionId);

  if (connection) {
    // Level 2: Combo-level — check all combos that contain this provider
    if (config.combos && Object.keys(config.combos).length > 0) {
      const combos = db.data.combos || [];
      for (const combo of combos) {
        if (config.combos[combo.id]) {
          // Check if this combo uses this connection's provider
          const comboModels = combo.models || [];
          const usesProvider = comboModels.some(m => m.provider === connection.provider);
          if (usesProvider) {
            return { proxy: config.combos[combo.id], level: "combo", levelId: combo.id };
          }
        }
      }
    }

    // Level 3: Provider-level
    if (config.providers?.[connection.provider]) {
      return { proxy: config.providers[connection.provider], level: "provider", levelId: connection.provider };
    }
  }

  // Level 4: Global
  if (config.global) {
    return { proxy: config.global, level: "global", levelId: null };
  }

  return { proxy: null, level: "direct", levelId: null };
}

/**
 * Update proxy configuration (merge — backward compatible)
 * @param {Object} config - { global?, providers?, combos?, keys?, level?, id?, proxy? }
 */
export async function setProxyConfig(config) {
  // New-style: level-based update
  if (config.level !== undefined) {
    return setProxyForLevel(config.level, config.id || null, config.proxy);
  }

  // Legacy-style: merge all at once
  return withWriteLock(async () => {
    const db = await getDb();
    if (!db.data.proxyConfig) {
      db.data.proxyConfig = { ...DEFAULT_PROXY_CONFIG };
    }
    if (!db.data.proxyConfig.combos) db.data.proxyConfig.combos = {};
    if (!db.data.proxyConfig.keys) db.data.proxyConfig.keys = {};
    if (!db.data.proxyConfig.providers) db.data.proxyConfig.providers = {};

    if (config.global !== undefined) {
      db.data.proxyConfig.global = config.global || null;
    }
    for (const mapKey of ["providers", "combos", "keys"]) {
      if (config[mapKey]) {
        db.data.proxyConfig[mapKey] = {
          ...db.data.proxyConfig[mapKey],
          ...config[mapKey],
        };
        // Remove null/empty entries
        for (const [k, v] of Object.entries(db.data.proxyConfig[mapKey])) {
          if (!v) delete db.data.proxyConfig[mapKey][k];
        }
      }
    }
    await db.write();
    return db.data.proxyConfig;
  });
}

// ============ DB Backup Management ============

/**
 * List all available DB backups (sorted newest first).
 * Returns array of { id, filename, createdAt, size, reason }
 */
export async function listDbBackups() {
  const backupDir = DB_BACKUPS_DIR || path.join(DATA_DIR, "db_backups");
  try {
    const entries = fs.readdirSync(backupDir)
      .filter(f => f.startsWith("db_") && f.endsWith(".json"))
      .sort()
      .reverse(); // newest first

    return entries.map(filename => {
      const filePath = path.join(backupDir, filename);
      const stat = fs.statSync(filePath);
      // Parse timestamp and reason from filename: db_2026-02-11T14-00-00-000Z_pre-write.json
      const match = filename.match(/^db_(.+?)_([^.]+)\.json$/);
      const timestamp = match ? match[1].replace(/-(\d{3})Z/, '.$1Z').replace(/-/g, (m, offset) => {
        // Restore ISO format: first 10 chars keep dashes, rest convert back
        return offset < 10 ? '-' : ':';
      }) : null;
      const reason = match ? match[2] : 'unknown';
      
      // Read first bit of file to count providerConnections
      let connectionCount = 0;
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        connectionCount = (data.providerConnections || []).length;
      } catch { /* ignore parse errors */ }

      return {
        id: filename,
        filename,
        createdAt: stat.mtime.toISOString(),
        size: stat.size,
        reason,
        connectionCount,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Restore a DB backup by its filename.
 * Creates a safety backup of the current state before restoring.
 */
export async function restoreDbBackup(backupId) {
  const backupDir = DB_BACKUPS_DIR || path.join(DATA_DIR, "db_backups");
  const backupPath = path.join(backupDir, backupId);

  // Validate backup exists and is within the expected directory
  if (!backupId.startsWith("db_") || !backupId.endsWith(".json")) {
    throw new Error("Invalid backup ID");
  }
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  // Validate backup content is valid JSON with expected shape
  let backupData;
  try {
    backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  } catch {
    throw new Error("Backup file is corrupt (invalid JSON)");
  }
  if (!backupData || typeof backupData !== 'object') {
    throw new Error("Backup file has invalid structure");
  }

  // Force a safety backup of current state before restoring (bypass throttle)
  _lastBackupAt = 0;
  backupDbFile('pre-restore');

  // Copy backup over the current db.json
  fs.copyFileSync(backupPath, DB_FILE);

  // Reset the singleton so next getDb() reads the restored file
  dbInstance = null;

  // Reload and ensure DB shape is valid
  const db = await getDb();
  const connectionCount = (db.data.providerConnections || []).length;

  console.log(`[DB] Restored backup: ${backupId} (${connectionCount} connections)`);

  return {
    restored: true,
    backupId,
    connectionCount,
    nodeCount: (db.data.providerNodes || []).length,
    comboCount: (db.data.combos || []).length,
    apiKeyCount: (db.data.apiKeys || []).length,
  };
}
