import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { v4 as uuidv4 } from "uuid";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Detect Cloudflare Workers / edge runtime.
// Workers expose a `caches` global (CacheStorage). In Node.js this is undefined.
const isCloud =
  typeof globalThis.caches === "object" && globalThis.caches !== null;

// Get app name - fixed constant to avoid Windows path issues in standalone build
function getAppName() {
  return "9router";
}

// Get user data directory based on platform
function getUserDataDir() {
  if (isCloud) return "/tmp"; // Fallback for Workers

  if (process.env.DATA_DIR) return process.env.DATA_DIR;

  const platform = process.platform;
  const homeDir = os.homedir();
  const appName = getAppName();

  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), appName);
  } else {
    // macOS & Linux: ~/.{appName}
    return path.join(homeDir, `.${appName}`);
  }
}

// Data file path - stored in user home directory
const DATA_DIR = getUserDataDir();
const DB_FILE = isCloud ? null : path.join(DATA_DIR, "db.json");

// Ensure data directory exists
if (!isCloud && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
  return {
    providerConnections: [],
    providerNodes: [],
    modelAliases: {},
    mitmAlias: {},
    combos: [],
    apiKeys: [],
    settings: {
      cloudEnabled: false,
      stickyRoundRobinLimit: 3,
      requireLogin: true,
    },
    pricing: {},
  };
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

/**
 * Execute a function with exclusive access to the database (Read-Modify-Write cycle).
 * @param {Function} callback - Async function that gets exclusive access
 * @returns {Promise<any>} Result of the callback
 */
async function withWriteLock(callback) {
  // Enqueue the callback
  const resultPromise = mutexPromise.then(async () => {
    try {
      return await callback();
    } catch (error) {
      console.error("[DB] Write lock error:", error);
      throw error;
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

  if (!dbInstance) {
    const adapter = new JSONFile(DB_FILE);
    dbInstance = new Low(adapter, cloneDefaultData());
  }

  // Always read latest disk state to avoid stale singleton data across route workers.
  try {
    await dbInstance.read();
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn('[DB] Corrupt JSON detected, resetting to defaults...');
      dbInstance.data = cloneDefaultData();
      await dbInstance.write();
    } else {
      throw error;
    }
  }

  // Initialize/migrate missing keys for older DB schema versions.
  if (!dbInstance.data) {
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
      "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn", "errorCode",
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

// ============ Data Cleanup ============

export async function cleanupProviderConnections() {
  return withWriteLock(async () => {
    const db = await getDb();
    const fieldsToCheck = [
      "displayName", "email", "globalPriority", "defaultModel",
      "accessToken", "refreshToken", "expiresAt", "tokenType",
      "scope", "idToken", "projectId", "apiKey", "testStatus",
      "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn",
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
