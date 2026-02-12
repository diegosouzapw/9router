/**
 * SQLite Database Layer — replaces LowDB/JSON with better-sqlite3.
 *
 * API-compatible drop-in replacement for localDb.js.
 * All exported async functions maintain the same signatures.
 *
 * Storage: ~/.9router/storage.sqlite (WAL mode for concurrency)
 * Backup: ~/.9router/db_backups/*.sqlite (native db.backup())
 * Migration: Auto-detects db.json on first run and imports data.
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "node:path";
import fs from "node:fs";
import { resolveDataDir, getLegacyDotDataDir, isSamePath } from "./dataPaths.js";

// ──────────────── Environment Detection ────────────────

const isCloud =
  typeof globalThis.caches === "object" && globalThis.caches !== null;

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

// ──────────────── Paths ────────────────

const DATA_DIR = resolveDataDir({ isCloud });
const LEGACY_DATA_DIR = isCloud ? null : getLegacyDotDataDir();
const SQLITE_FILE = isCloud ? null : path.join(DATA_DIR, "storage.sqlite");
const JSON_DB_FILE = isCloud ? null : path.join(DATA_DIR, "db.json");
const DB_BACKUPS_DIR = isCloud ? null : path.join(DATA_DIR, "db_backups");

// Ensure data directory exists
if (!isCloud && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ──────────────── Backup Config ────────────────

let _lastBackupAt = 0;
const BACKUP_THROTTLE_MS = 60 * 60 * 1000; // 60 minutes
const MAX_DB_BACKUPS = 20;

// ──────────────── Schema ────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS provider_connections (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    auth_type TEXT,
    name TEXT,
    email TEXT,
    priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    token_expires_at TEXT,
    scope TEXT,
    project_id TEXT,
    test_status TEXT,
    error_code TEXT,
    last_error TEXT,
    last_error_at TEXT,
    last_error_type TEXT,
    last_error_source TEXT,
    backoff_level INTEGER DEFAULT 0,
    rate_limited_until TEXT,
    health_check_interval INTEGER,
    last_health_check_at TEXT,
    last_tested TEXT,
    api_key TEXT,
    id_token TEXT,
    provider_specific_data TEXT,
    expires_in INTEGER,
    display_name TEXT,
    global_priority INTEGER,
    default_model TEXT,
    token_type TEXT,
    consecutive_use_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pc_provider ON provider_connections(provider);
  CREATE INDEX IF NOT EXISTS idx_pc_active ON provider_connections(is_active);
  CREATE INDEX IF NOT EXISTS idx_pc_priority ON provider_connections(provider, priority);

  CREATE TABLE IF NOT EXISTS provider_nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    prefix TEXT,
    api_type TEXT,
    base_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS key_value (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );

  CREATE TABLE IF NOT EXISTS combos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    machine_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ak_key ON api_keys(key);

  CREATE TABLE IF NOT EXISTS db_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

// ──────────────── Column Mapping ────────────────

// camelCase ↔ snake_case conversion
function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
}
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Convert JS object keys to snake_case for DB
function objToSnake(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[toSnakeCase(k)] = v;
  }
  return result;
}

// Convert DB row (snake_case) to JS object (camelCase)
function rowToCamel(row) {
  if (!row) return null;
  const result = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = toCamelCase(k);
    // Special handling for boolean fields stored as INTEGER
    if (camelKey === "isActive") {
      result[camelKey] = v === 1 || v === true;
    } else if (camelKey === "providerSpecificData" && typeof v === "string") {
      try { result[camelKey] = JSON.parse(v); } catch { result[camelKey] = v; }
    } else {
      result[camelKey] = v;
    }
  }
  return result;
}

// Clean null/undefined fields from object (matches JSON behavior)
function cleanNulls(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

// ──────────────── Singleton DB Instance ────────────────

let _db = null;

function getDbInstance() {
  if (_db) return _db;

  if (isCloud || isBuildPhase) {
    if (isBuildPhase) {
      console.log("[DB] Build phase detected — using in-memory SQLite (read-only)");
    }
    _db = new Database(":memory:");
    _db.pragma("journal_mode = WAL");
    _db.exec(SCHEMA_SQL);
    return _db;
  }

  // Detect and replace old incompatible schema (from previous migration attempt)
  if (fs.existsSync(SQLITE_FILE)) {
    try {
      const probe = new Database(SQLITE_FILE, { readonly: true });
      const hasOldSchema = probe.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      ).get();
      probe.close();

      if (hasOldSchema) {
        const oldPath = SQLITE_FILE + ".old-schema";
        console.log(`[DB] Old incompatible schema detected — renaming to ${path.basename(oldPath)}`);
        fs.renameSync(SQLITE_FILE, oldPath);
        // WAL/SHM companion files
        for (const ext of ["-wal", "-shm"]) {
          try { if (fs.existsSync(SQLITE_FILE + ext)) fs.unlinkSync(SQLITE_FILE + ext); } catch { /* ok */ }
        }
      }
    } catch (e) {
      console.warn("[DB] Could not probe existing DB, will create fresh:", e.message);
      try { fs.unlinkSync(SQLITE_FILE); } catch { /* ok */ }
    }
  }

  _db = new Database(SQLITE_FILE);
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");
  _db.pragma("synchronous = NORMAL");
  _db.exec(SCHEMA_SQL);

  // Auto-migrate from db.json if exists
  if (JSON_DB_FILE && fs.existsSync(JSON_DB_FILE)) {
    migrateFromJson(_db, JSON_DB_FILE);
  }

  // Store schema version
  const versionStmt = _db.prepare("INSERT OR REPLACE INTO db_meta (key, value) VALUES ('schema_version', '1')");
  versionStmt.run();

  console.log(`[DB] SQLite database ready: ${SQLITE_FILE}`);
  return _db;
}

// ──────────────── JSON → SQLite Migration ────────────────

function migrateFromJson(db, jsonPath) {
  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    const data = JSON.parse(raw);

    // Check if there's actually data worth migrating
    const connCount = (data.providerConnections || []).length;
    const nodeCount = (data.providerNodes || []).length;
    const keyCount = (data.apiKeys || []).length;

    if (connCount === 0 && nodeCount === 0 && keyCount === 0) {
      console.log("[DB] db.json has no data to migrate, skipping");
      // Rename anyway to prevent re-check
      fs.renameSync(jsonPath, jsonPath + ".empty");
      return;
    }

    console.log(`[DB] Migrating db.json → SQLite (${connCount} connections, ${nodeCount} nodes, ${keyCount} keys)...`);

    const migrate = db.transaction(() => {
      // 1. Provider Connections
      const insertConn = db.prepare(`
        INSERT OR REPLACE INTO provider_connections (
          id, provider, auth_type, name, email, priority, is_active,
          access_token, refresh_token, expires_at, token_expires_at,
          scope, project_id, test_status, error_code, last_error,
          last_error_at, last_error_type, last_error_source, backoff_level,
          rate_limited_until, health_check_interval, last_health_check_at,
          last_tested, api_key, id_token, provider_specific_data,
          expires_in, display_name, global_priority, default_model,
          token_type, consecutive_use_count, created_at, updated_at
        ) VALUES (
          @id, @provider, @authType, @name, @email, @priority, @isActive,
          @accessToken, @refreshToken, @expiresAt, @tokenExpiresAt,
          @scope, @projectId, @testStatus, @errorCode, @lastError,
          @lastErrorAt, @lastErrorType, @lastErrorSource, @backoffLevel,
          @rateLimitedUntil, @healthCheckInterval, @lastHealthCheckAt,
          @lastTested, @apiKey, @idToken, @providerSpecificData,
          @expiresIn, @displayName, @globalPriority, @defaultModel,
          @tokenType, @consecutiveUseCount, @createdAt, @updatedAt
        )
      `);

      for (const conn of data.providerConnections || []) {
        insertConn.run({
          id: conn.id,
          provider: conn.provider,
          authType: conn.authType || "oauth",
          name: conn.name || null,
          email: conn.email || null,
          priority: conn.priority || 0,
          isActive: conn.isActive === false ? 0 : 1,
          accessToken: conn.accessToken || null,
          refreshToken: conn.refreshToken || null,
          expiresAt: conn.expiresAt || null,
          tokenExpiresAt: conn.tokenExpiresAt || null,
          scope: conn.scope || null,
          projectId: conn.projectId || null,
          testStatus: conn.testStatus || null,
          errorCode: conn.errorCode || null,
          lastError: conn.lastError || null,
          lastErrorAt: conn.lastErrorAt || null,
          lastErrorType: conn.lastErrorType || null,
          lastErrorSource: conn.lastErrorSource || null,
          backoffLevel: conn.backoffLevel || 0,
          rateLimitedUntil: conn.rateLimitedUntil || null,
          healthCheckInterval: conn.healthCheckInterval || null,
          lastHealthCheckAt: conn.lastHealthCheckAt || null,
          lastTested: conn.lastTested || null,
          apiKey: conn.apiKey || null,
          idToken: conn.idToken || null,
          providerSpecificData: conn.providerSpecificData ? JSON.stringify(conn.providerSpecificData) : null,
          expiresIn: conn.expiresIn || null,
          displayName: conn.displayName || null,
          globalPriority: conn.globalPriority || null,
          defaultModel: conn.defaultModel || null,
          tokenType: conn.tokenType || null,
          consecutiveUseCount: conn.consecutiveUseCount || 0,
          createdAt: conn.createdAt || new Date().toISOString(),
          updatedAt: conn.updatedAt || new Date().toISOString(),
        });
      }

      // 2. Provider Nodes
      const insertNode = db.prepare(`
        INSERT OR REPLACE INTO provider_nodes (id, type, name, prefix, api_type, base_url, created_at, updated_at)
        VALUES (@id, @type, @name, @prefix, @apiType, @baseUrl, @createdAt, @updatedAt)
      `);
      for (const node of data.providerNodes || []) {
        insertNode.run({
          id: node.id,
          type: node.type,
          name: node.name,
          prefix: node.prefix || null,
          apiType: node.apiType || null,
          baseUrl: node.baseUrl || null,
          createdAt: node.createdAt || new Date().toISOString(),
          updatedAt: node.updatedAt || new Date().toISOString(),
        });
      }

      // 3. Key-Value pairs (modelAliases, mitmAlias, settings, pricing, proxyConfig, customModels)
      const insertKv = db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)");

      // Model Aliases
      for (const [alias, model] of Object.entries(data.modelAliases || {})) {
        insertKv.run("modelAliases", alias, JSON.stringify(model));
      }

      // MITM Alias
      for (const [toolName, mappings] of Object.entries(data.mitmAlias || {})) {
        insertKv.run("mitmAlias", toolName, JSON.stringify(mappings));
      }

      // Settings (each setting as separate key)
      for (const [key, value] of Object.entries(data.settings || {})) {
        insertKv.run("settings", key, JSON.stringify(value));
      }

      // Pricing (stored as provider→JSON blob)
      for (const [provider, models] of Object.entries(data.pricing || {})) {
        insertKv.run("pricing", provider, JSON.stringify(models));
      }

      // Custom Models
      for (const [providerId, models] of Object.entries(data.customModels || {})) {
        insertKv.run("customModels", providerId, JSON.stringify(models));
      }

      // Proxy Config (stored as level→JSON)
      if (data.proxyConfig) {
        insertKv.run("proxyConfig", "global", JSON.stringify(data.proxyConfig.global || null));
        insertKv.run("proxyConfig", "providers", JSON.stringify(data.proxyConfig.providers || {}));
        insertKv.run("proxyConfig", "combos", JSON.stringify(data.proxyConfig.combos || {}));
        insertKv.run("proxyConfig", "keys", JSON.stringify(data.proxyConfig.keys || {}));
      }

      // 4. Combos
      const insertCombo = db.prepare(`
        INSERT OR REPLACE INTO combos (id, name, data, created_at, updated_at)
        VALUES (@id, @name, @data, @createdAt, @updatedAt)
      `);
      for (const combo of data.combos || []) {
        insertCombo.run({
          id: combo.id,
          name: combo.name,
          data: JSON.stringify(combo),
          createdAt: combo.createdAt || new Date().toISOString(),
          updatedAt: combo.updatedAt || new Date().toISOString(),
        });
      }

      // 5. API Keys
      const insertKey = db.prepare(`
        INSERT OR REPLACE INTO api_keys (id, name, key, machine_id, created_at)
        VALUES (@id, @name, @key, @machineId, @createdAt)
      `);
      for (const apiKey of data.apiKeys || []) {
        insertKey.run({
          id: apiKey.id,
          name: apiKey.name,
          key: apiKey.key,
          machineId: apiKey.machineId || null,
          createdAt: apiKey.createdAt || new Date().toISOString(),
        });
      }
    });

    migrate();

    // Rename original db.json (preserve, don't delete)
    const migratedPath = jsonPath + ".migrated";
    fs.renameSync(jsonPath, migratedPath);
    console.log(`[DB] ✓ Migration complete. Original saved as ${migratedPath}`);

    // Also try to migrate legacy directory backups
    const legacyBackupDir = path.join(DATA_DIR, "db_backups");
    if (fs.existsSync(legacyBackupDir)) {
      const jsonBackups = fs.readdirSync(legacyBackupDir).filter(f => f.endsWith(".json"));
      if (jsonBackups.length > 0) {
        console.log(`[DB] Note: ${jsonBackups.length} legacy .json backups remain in ${legacyBackupDir}`);
      }
    }
  } catch (err) {
    console.error("[DB] Migration from db.json failed:", err.message);
    // Don't rename — let user retry or manually investigate
  }
}

// ──────────────── Backup System ────────────────

export function backupDbFile(reason = "auto") {
  try {
    if (isBuildPhase || isCloud) return null;
    if (!SQLITE_FILE || !fs.existsSync(SQLITE_FILE)) return null;

    const stat = fs.statSync(SQLITE_FILE);
    if (stat.size < 4096) {
      console.warn(`[DB] Backup SKIPPED — DB too small (${stat.size}B)`);
      return null;
    }

    // Throttle
    const now = Date.now();
    if (reason !== "manual" && reason !== "pre-restore" && now - _lastBackupAt < BACKUP_THROTTLE_MS) return null;
    _lastBackupAt = now;

    const backupDir = DB_BACKUPS_DIR || path.join(DATA_DIR, "db_backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    // Shrink check vs latest backup
    const existingBackups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith("db_") && f.endsWith(".sqlite"))
      .sort();
    if (existingBackups.length > 0) {
      const latestBackup = existingBackups[existingBackups.length - 1];
      const latestStat = fs.statSync(path.join(backupDir, latestBackup));
      if (latestStat.size > 4096 && stat.size < latestStat.size * 0.5) {
        console.warn(`[DB] Backup SKIPPED — DB shrank from ${latestStat.size}B to ${stat.size}B`);
        return null;
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `db_${timestamp}_${reason}.sqlite`);

    // Use native SQLite backup API for consistency
    const db = getDbInstance();
    db.backup(backupFile).then(() => {
      console.log(`[DB] Backup created: ${backupFile} (${stat.size} bytes)`);
    }).catch(err => {
      console.error("[DB] Backup failed:", err.message);
    });

    // Rotation — keep only last N, delete smallest first
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith("db_") && f.endsWith(".sqlite")).sort();
    while (files.length > MAX_DB_BACKUPS) {
      let smallestIdx = 0;
      let smallestSize = Infinity;
      for (let i = 0; i < files.length - 1; i++) {
        try {
          const fStat = fs.statSync(path.join(backupDir, files[i]));
          if (fStat.size < smallestSize) {
            smallestSize = fStat.size;
            smallestIdx = i;
          }
        } catch { smallestIdx = i; break; }
      }
      try { fs.unlinkSync(path.join(backupDir, files[smallestIdx])); } catch { /* gone */ }
      files.splice(smallestIdx, 1);
    }

    return { filename: path.basename(backupFile), size: stat.size };
  } catch (err) {
    console.error("[DB] Backup failed:", err.message);
    return null;
  }
}

export async function listDbBackups() {
  const backupDir = DB_BACKUPS_DIR || path.join(DATA_DIR, "db_backups");
  try {
    if (!fs.existsSync(backupDir)) return [];

    const entries = fs.readdirSync(backupDir)
      .filter(f => f.startsWith("db_") && f.endsWith(".sqlite"))
      .sort()
      .reverse();

    return entries.map(filename => {
      const filePath = path.join(backupDir, filename);
      const stat = fs.statSync(filePath);
      const match = filename.match(/^db_(.+?)_([^.]+)\.sqlite$/);
      const reason = match ? match[2] : "unknown";

      // Count connections in backup
      let connectionCount = 0;
      try {
        const backupDb = new Database(filePath, { readonly: true });
        const row = backupDb.prepare("SELECT COUNT(*) as cnt FROM provider_connections").get();
        connectionCount = row?.cnt || 0;
        backupDb.close();
      } catch { /* ignore */ }

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

export async function restoreDbBackup(backupId) {
  const backupDir = DB_BACKUPS_DIR || path.join(DATA_DIR, "db_backups");
  const backupPath = path.join(backupDir, backupId);

  if (!backupId.startsWith("db_") || !backupId.endsWith(".sqlite")) {
    throw new Error("Invalid backup ID");
  }
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  // Validate backup integrity
  try {
    const testDb = new Database(backupPath, { readonly: true });
    const result = testDb.pragma("integrity_check");
    testDb.close();
    if (result[0]?.integrity_check !== "ok") {
      throw new Error("Backup integrity check failed");
    }
  } catch (e) {
    if (e.message === "Backup integrity check failed") throw e;
    throw new Error(`Backup file is corrupt: ${e.message}`);
  }

  // Force pre-restore backup (bypass throttle)
  _lastBackupAt = 0;
  backupDbFile("pre-restore");

  // Close current connection
  if (_db) {
    _db.close();
    _db = null;
  }

  // Copy backup over current DB
  fs.copyFileSync(backupPath, SQLITE_FILE);

  // Reopen
  const db = getDbInstance();
  const connCount = db.prepare("SELECT COUNT(*) as cnt FROM provider_connections").get()?.cnt || 0;
  const nodeCount = db.prepare("SELECT COUNT(*) as cnt FROM provider_nodes").get()?.cnt || 0;
  const comboCount = db.prepare("SELECT COUNT(*) as cnt FROM combos").get()?.cnt || 0;
  const keyCount = db.prepare("SELECT COUNT(*) as cnt FROM api_keys").get()?.cnt || 0;

  console.log(`[DB] Restored backup: ${backupId} (${connCount} connections)`);

  return {
    restored: true,
    backupId,
    connectionCount: connCount,
    nodeCount,
    comboCount,
    apiKeyCount: keyCount,
  };
}

// ──────────────── Provider Connections ────────────────

export async function getProviderConnections(filter = {}) {
  const db = getDbInstance();
  let sql = "SELECT * FROM provider_connections";
  const conditions = [];
  const params = {};

  if (filter.provider) {
    conditions.push("provider = @provider");
    params.provider = filter.provider;
  }
  if (filter.isActive !== undefined) {
    conditions.push("is_active = @isActive");
    params.isActive = filter.isActive ? 1 : 0;
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY priority ASC, updated_at DESC";

  const rows = db.prepare(sql).all(params);
  return rows.map(r => cleanNulls(rowToCamel(r)));
}

export async function getProviderConnectionById(id) {
  const db = getDbInstance();
  const row = db.prepare("SELECT * FROM provider_connections WHERE id = ?").get(id);
  return row ? cleanNulls(rowToCamel(row)) : null;
}

export async function createProviderConnection(data) {
  const db = getDbInstance();
  const now = new Date().toISOString();

  // Upsert check (same provider + email for OAuth, same provider + name for API key)
  let existing = null;
  if (data.authType === "oauth" && data.email) {
    existing = db.prepare(
      "SELECT * FROM provider_connections WHERE provider = ? AND auth_type = 'oauth' AND email = ?"
    ).get(data.provider, data.email);
  } else if (data.authType === "apikey" && data.name) {
    existing = db.prepare(
      "SELECT * FROM provider_connections WHERE provider = ? AND auth_type = 'apikey' AND name = ?"
    ).get(data.provider, data.name);
  }

  if (existing) {
    // Update existing
    const merged = { ...rowToCamel(existing), ...data, updatedAt: now };
    _updateConnectionRow(db, existing.id, merged);
    backupDbFile("pre-write");
    return cleanNulls(merged);
  }

  // Generate name
  let connectionName = data.name || null;
  if (!connectionName && data.authType === "oauth") {
    if (data.email) {
      connectionName = data.email;
    } else {
      const count = db.prepare("SELECT COUNT(*) as cnt FROM provider_connections WHERE provider = ?").get(data.provider)?.cnt || 0;
      connectionName = `Account ${count + 1}`;
    }
  }

  // Auto-increment priority
  let connectionPriority = data.priority;
  if (!connectionPriority) {
    const max = db.prepare("SELECT MAX(priority) as maxP FROM provider_connections WHERE provider = ?").get(data.provider);
    connectionPriority = (max?.maxP || 0) + 1;
  }

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

  // Optional fields
  const optionalFields = [
    "displayName", "email", "globalPriority", "defaultModel",
    "accessToken", "refreshToken", "expiresAt", "tokenType",
    "scope", "idToken", "projectId", "apiKey", "testStatus",
    "lastTested", "lastError", "lastErrorAt", "lastErrorType",
    "lastErrorSource", "rateLimitedUntil", "expiresIn", "errorCode",
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

  _insertConnectionRow(db, connection);
  _reorderConnections(db, data.provider);
  backupDbFile("pre-write");

  return cleanNulls(connection);
}

function _insertConnectionRow(db, conn) {
  db.prepare(`
    INSERT INTO provider_connections (
      id, provider, auth_type, name, email, priority, is_active,
      access_token, refresh_token, expires_at, token_expires_at,
      scope, project_id, test_status, error_code, last_error,
      last_error_at, last_error_type, last_error_source, backoff_level,
      rate_limited_until, health_check_interval, last_health_check_at,
      last_tested, api_key, id_token, provider_specific_data,
      expires_in, display_name, global_priority, default_model,
      token_type, consecutive_use_count, created_at, updated_at
    ) VALUES (
      @id, @provider, @authType, @name, @email, @priority, @isActive,
      @accessToken, @refreshToken, @expiresAt, @tokenExpiresAt,
      @scope, @projectId, @testStatus, @errorCode, @lastError,
      @lastErrorAt, @lastErrorType, @lastErrorSource, @backoffLevel,
      @rateLimitedUntil, @healthCheckInterval, @lastHealthCheckAt,
      @lastTested, @apiKey, @idToken, @providerSpecificData,
      @expiresIn, @displayName, @globalPriority, @defaultModel,
      @tokenType, @consecutiveUseCount, @createdAt, @updatedAt
    )
  `).run({
    id: conn.id,
    provider: conn.provider,
    authType: conn.authType || null,
    name: conn.name || null,
    email: conn.email || null,
    priority: conn.priority || 0,
    isActive: conn.isActive === false ? 0 : 1,
    accessToken: conn.accessToken || null,
    refreshToken: conn.refreshToken || null,
    expiresAt: conn.expiresAt || null,
    tokenExpiresAt: conn.tokenExpiresAt || null,
    scope: conn.scope || null,
    projectId: conn.projectId || null,
    testStatus: conn.testStatus || null,
    errorCode: conn.errorCode || null,
    lastError: conn.lastError || null,
    lastErrorAt: conn.lastErrorAt || null,
    lastErrorType: conn.lastErrorType || null,
    lastErrorSource: conn.lastErrorSource || null,
    backoffLevel: conn.backoffLevel || 0,
    rateLimitedUntil: conn.rateLimitedUntil || null,
    healthCheckInterval: conn.healthCheckInterval || null,
    lastHealthCheckAt: conn.lastHealthCheckAt || null,
    lastTested: conn.lastTested || null,
    apiKey: conn.apiKey || null,
    idToken: conn.idToken || null,
    providerSpecificData: conn.providerSpecificData ? JSON.stringify(conn.providerSpecificData) : null,
    expiresIn: conn.expiresIn || null,
    displayName: conn.displayName || null,
    globalPriority: conn.globalPriority || null,
    defaultModel: conn.defaultModel || null,
    tokenType: conn.tokenType || null,
    consecutiveUseCount: conn.consecutiveUseCount || 0,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  });
}

function _updateConnectionRow(db, id, data) {
  const now = data.updatedAt || new Date().toISOString();
  db.prepare(`
    UPDATE provider_connections SET
      provider = @provider, auth_type = @authType, name = @name, email = @email,
      priority = @priority, is_active = @isActive, access_token = @accessToken,
      refresh_token = @refreshToken, expires_at = @expiresAt, token_expires_at = @tokenExpiresAt,
      scope = @scope, project_id = @projectId, test_status = @testStatus, error_code = @errorCode,
      last_error = @lastError, last_error_at = @lastErrorAt, last_error_type = @lastErrorType,
      last_error_source = @lastErrorSource, backoff_level = @backoffLevel,
      rate_limited_until = @rateLimitedUntil, health_check_interval = @healthCheckInterval,
      last_health_check_at = @lastHealthCheckAt, last_tested = @lastTested, api_key = @apiKey,
      id_token = @idToken, provider_specific_data = @providerSpecificData,
      expires_in = @expiresIn, display_name = @displayName, global_priority = @globalPriority,
      default_model = @defaultModel, token_type = @tokenType,
      consecutive_use_count = @consecutiveUseCount, updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id: id,
    provider: data.provider,
    authType: data.authType || null,
    name: data.name || null,
    email: data.email || null,
    priority: data.priority || 0,
    isActive: data.isActive === false ? 0 : 1,
    accessToken: data.accessToken || null,
    refreshToken: data.refreshToken || null,
    expiresAt: data.expiresAt || null,
    tokenExpiresAt: data.tokenExpiresAt || null,
    scope: data.scope || null,
    projectId: data.projectId || null,
    testStatus: data.testStatus || null,
    errorCode: data.errorCode || null,
    lastError: data.lastError || null,
    lastErrorAt: data.lastErrorAt || null,
    lastErrorType: data.lastErrorType || null,
    lastErrorSource: data.lastErrorSource || null,
    backoffLevel: data.backoffLevel || 0,
    rateLimitedUntil: data.rateLimitedUntil || null,
    healthCheckInterval: data.healthCheckInterval || null,
    lastHealthCheckAt: data.lastHealthCheckAt || null,
    lastTested: data.lastTested || null,
    apiKey: data.apiKey || null,
    idToken: data.idToken || null,
    providerSpecificData: data.providerSpecificData ? JSON.stringify(data.providerSpecificData) : null,
    expiresIn: data.expiresIn || null,
    displayName: data.displayName || null,
    globalPriority: data.globalPriority || null,
    defaultModel: data.defaultModel || null,
    tokenType: data.tokenType || null,
    consecutiveUseCount: data.consecutiveUseCount || 0,
    updatedAt: now,
  });
}

export async function updateProviderConnection(id, data) {
  const db = getDbInstance();
  const existing = db.prepare("SELECT * FROM provider_connections WHERE id = ?").get(id);
  if (!existing) return null;

  const merged = { ...rowToCamel(existing), ...data, updatedAt: new Date().toISOString() };
  _updateConnectionRow(db, id, merged);
  backupDbFile("pre-write");

  if (data.priority !== undefined) {
    _reorderConnections(db, existing.provider);
  }

  return cleanNulls(merged);
}

export async function deleteProviderConnection(id) {
  const db = getDbInstance();
  const existing = db.prepare("SELECT provider FROM provider_connections WHERE id = ?").get(id);
  if (!existing) return false;

  db.prepare("DELETE FROM provider_connections WHERE id = ?").run(id);
  _reorderConnections(db, existing.provider);
  backupDbFile("pre-write");
  return true;
}

export async function deleteProviderConnectionsByProvider(providerId) {
  const db = getDbInstance();
  const result = db.prepare("DELETE FROM provider_connections WHERE provider = ?").run(providerId);
  backupDbFile("pre-write");
  return result.changes;
}

export async function reorderProviderConnections(providerId) {
  const db = getDbInstance();
  _reorderConnections(db, providerId);
}

function _reorderConnections(db, providerId) {
  const rows = db.prepare(
    "SELECT id, priority, updated_at FROM provider_connections WHERE provider = ? ORDER BY priority ASC, updated_at DESC"
  ).all(providerId);

  const update = db.prepare("UPDATE provider_connections SET priority = ? WHERE id = ?");
  rows.forEach((row, index) => {
    update.run(index + 1, row.id);
  });
}

export async function cleanupProviderConnections() {
  // In SQLite, null fields don't take space — this is essentially a no-op
  // but we keep the function for API compatibility
  return 0;
}

// ──────────────── Provider Nodes ────────────────

export async function getProviderNodes(filter = {}) {
  const db = getDbInstance();
  let sql = "SELECT * FROM provider_nodes";
  const params = {};

  if (filter.type) {
    sql += " WHERE type = @type";
    params.type = filter.type;
  }

  return db.prepare(sql).all(params).map(rowToCamel);
}

export async function getProviderNodeById(id) {
  const db = getDbInstance();
  const row = db.prepare("SELECT * FROM provider_nodes WHERE id = ?").get(id);
  return row ? rowToCamel(row) : null;
}

export async function createProviderNode(data) {
  const db = getDbInstance();
  const now = new Date().toISOString();

  const node = {
    id: data.id || uuidv4(),
    type: data.type,
    name: data.name,
    prefix: data.prefix || null,
    apiType: data.apiType || null,
    baseUrl: data.baseUrl || null,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO provider_nodes (id, type, name, prefix, api_type, base_url, created_at, updated_at)
    VALUES (@id, @type, @name, @prefix, @apiType, @baseUrl, @createdAt, @updatedAt)
  `).run(node);

  backupDbFile("pre-write");
  return node;
}

export async function updateProviderNode(id, data) {
  const db = getDbInstance();
  const existing = db.prepare("SELECT * FROM provider_nodes WHERE id = ?").get(id);
  if (!existing) return null;

  const merged = { ...rowToCamel(existing), ...data, updatedAt: new Date().toISOString() };

  db.prepare(`
    UPDATE provider_nodes SET type = @type, name = @name, prefix = @prefix,
    api_type = @apiType, base_url = @baseUrl, updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    type: merged.type,
    name: merged.name,
    prefix: merged.prefix || null,
    apiType: merged.apiType || null,
    baseUrl: merged.baseUrl || null,
    updatedAt: merged.updatedAt,
  });

  backupDbFile("pre-write");
  return merged;
}

export async function deleteProviderNode(id) {
  const db = getDbInstance();
  const existing = db.prepare("SELECT * FROM provider_nodes WHERE id = ?").get(id);
  if (!existing) return null;

  db.prepare("DELETE FROM provider_nodes WHERE id = ?").run(id);
  backupDbFile("pre-write");
  return rowToCamel(existing);
}

// ──────────────── Model Aliases ────────────────

export async function getModelAliases() {
  const db = getDbInstance();
  const rows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'modelAliases'").all();
  const result = {};
  for (const row of rows) {
    result[row.key] = JSON.parse(row.value);
  }
  return result;
}

export async function setModelAlias(alias, model) {
  const db = getDbInstance();
  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('modelAliases', ?, ?)").run(alias, JSON.stringify(model));
  backupDbFile("pre-write");
}

export async function deleteModelAlias(alias) {
  const db = getDbInstance();
  db.prepare("DELETE FROM key_value WHERE namespace = 'modelAliases' AND key = ?").run(alias);
  backupDbFile("pre-write");
}

// ──────────────── MITM Alias ────────────────

export async function getMitmAlias(toolName) {
  const db = getDbInstance();
  if (toolName) {
    const row = db.prepare("SELECT value FROM key_value WHERE namespace = 'mitmAlias' AND key = ?").get(toolName);
    return row ? JSON.parse(row.value) : {};
  }
  const rows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'mitmAlias'").all();
  const result = {};
  for (const row of rows) {
    result[row.key] = JSON.parse(row.value);
  }
  return result;
}

export async function setMitmAliasAll(toolName, mappings) {
  const db = getDbInstance();
  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('mitmAlias', ?, ?)").run(toolName, JSON.stringify(mappings || {}));
  backupDbFile("pre-write");
}

// ──────────────── Combos ────────────────

export async function getCombos() {
  const db = getDbInstance();
  return db.prepare("SELECT data FROM combos ORDER BY name").all().map(r => JSON.parse(r.data));
}

export async function getComboById(id) {
  const db = getDbInstance();
  const row = db.prepare("SELECT data FROM combos WHERE id = ?").get(id);
  return row ? JSON.parse(row.data) : null;
}

export async function getComboByName(name) {
  const db = getDbInstance();
  const row = db.prepare("SELECT data FROM combos WHERE name = ?").get(name);
  return row ? JSON.parse(row.data) : null;
}

export async function createCombo(data) {
  const db = getDbInstance();
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

  db.prepare("INSERT INTO combos (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    combo.id, combo.name, JSON.stringify(combo), now, now
  );

  backupDbFile("pre-write");
  return combo;
}

export async function updateCombo(id, data) {
  const db = getDbInstance();
  const existing = db.prepare("SELECT data FROM combos WHERE id = ?").get(id);
  if (!existing) return null;

  const current = JSON.parse(existing.data);
  const merged = { ...current, ...data, updatedAt: new Date().toISOString() };

  db.prepare("UPDATE combos SET name = ?, data = ?, updated_at = ? WHERE id = ?").run(
    merged.name, JSON.stringify(merged), merged.updatedAt, id
  );

  backupDbFile("pre-write");
  return merged;
}

export async function deleteCombo(id) {
  const db = getDbInstance();
  const result = db.prepare("DELETE FROM combos WHERE id = ?").run(id);
  if (result.changes === 0) return false;
  backupDbFile("pre-write");
  return true;
}

// ──────────────── API Keys ────────────────

export async function getApiKeys() {
  const db = getDbInstance();
  return db.prepare("SELECT * FROM api_keys ORDER BY created_at").all().map(rowToCamel);
}

export async function createApiKey(name, machineId) {
  if (!machineId) {
    throw new Error("machineId is required");
  }

  const db = getDbInstance();
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

  db.prepare("INSERT INTO api_keys (id, name, key, machine_id, created_at) VALUES (?, ?, ?, ?, ?)").run(
    apiKey.id, apiKey.name, apiKey.key, apiKey.machineId, apiKey.createdAt
  );

  backupDbFile("pre-write");
  return apiKey;
}

export async function deleteApiKey(id) {
  const db = getDbInstance();
  const result = db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  if (result.changes === 0) return false;
  backupDbFile("pre-write");
  return true;
}

export async function validateApiKey(key) {
  const db = getDbInstance();
  const row = db.prepare("SELECT 1 FROM api_keys WHERE key = ?").get(key);
  return !!row;
}

export async function getApiKeyMetadata(key) {
  if (!key) return null;
  const db = getDbInstance();
  const row = db.prepare("SELECT id, name, machine_id FROM api_keys WHERE key = ?").get(key);
  if (!row) return null;
  return { id: row.id, name: row.name, machineId: row.machine_id };
}

// ──────────────── Settings ────────────────

export async function getSettings() {
  const db = getDbInstance();
  const rows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'settings'").all();
  const settings = { cloudEnabled: false, stickyRoundRobinLimit: 3, requireLogin: true };
  for (const row of rows) {
    settings[row.key] = JSON.parse(row.value);
  }
  return settings;
}

export async function updateSettings(updates) {
  const db = getDbInstance();
  const insert = db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('settings', ?, ?)");
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      insert.run(key, JSON.stringify(value));
    }
  });
  tx();
  backupDbFile("pre-write");
  return getSettings();
}

export async function isCloudEnabled() {
  const settings = await getSettings();
  return settings.cloudEnabled === true;
}

// ──────────────── Pricing ────────────────

export async function getPricing() {
  const db = getDbInstance();
  const rows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'pricing'").all();
  const userPricing = {};
  for (const row of rows) {
    userPricing[row.key] = JSON.parse(row.value);
  }

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

export async function getPricingForModel(provider, model) {
  const pricing = await getPricing();
  if (pricing[provider]?.[model]) return pricing[provider][model];

  const { PROVIDER_ID_TO_ALIAS } = await import("open-sse/config/providerModels.js");
  const alias = PROVIDER_ID_TO_ALIAS[provider];
  if (alias && pricing[alias]) return pricing[alias][model] || null;

  const normalizedProvider = provider?.replace(/-cn$/, "");
  if (normalizedProvider && normalizedProvider !== provider && pricing[normalizedProvider]) {
    return pricing[normalizedProvider][model] || null;
  }

  return null;
}

export async function updatePricing(pricingData) {
  const db = getDbInstance();
  const insert = db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('pricing', ?, ?)");

  // Read existing
  const rows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'pricing'").all();
  const existing = {};
  for (const row of rows) {
    existing[row.key] = JSON.parse(row.value);
  }

  const tx = db.transaction(() => {
    for (const [provider, models] of Object.entries(pricingData)) {
      const merged = { ...(existing[provider] || {}), ...models };
      insert.run(provider, JSON.stringify(merged));
    }
  });
  tx();
  backupDbFile("pre-write");

  // Return raw user pricing
  const updated = {};
  const allRows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'pricing'").all();
  for (const row of allRows) {
    updated[row.key] = JSON.parse(row.value);
  }
  return updated;
}

export async function resetPricing(provider, model) {
  const db = getDbInstance();

  if (model) {
    const row = db.prepare("SELECT value FROM key_value WHERE namespace = 'pricing' AND key = ?").get(provider);
    if (row) {
      const models = JSON.parse(row.value);
      delete models[model];
      if (Object.keys(models).length === 0) {
        db.prepare("DELETE FROM key_value WHERE namespace = 'pricing' AND key = ?").run(provider);
      } else {
        db.prepare("UPDATE key_value SET value = ? WHERE namespace = 'pricing' AND key = ?").run(JSON.stringify(models), provider);
      }
    }
  } else {
    db.prepare("DELETE FROM key_value WHERE namespace = 'pricing' AND key = ?").run(provider);
  }

  backupDbFile("pre-write");

  const allRows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'pricing'").all();
  const result = {};
  for (const row of allRows) result[row.key] = JSON.parse(row.value);
  return result;
}

export async function resetAllPricing() {
  const db = getDbInstance();
  db.prepare("DELETE FROM key_value WHERE namespace = 'pricing'").run();
  backupDbFile("pre-write");
  return {};
}

// ──────────────── Custom Models ────────────────

export async function getCustomModels(providerId) {
  const db = getDbInstance();
  if (providerId) {
    const row = db.prepare("SELECT value FROM key_value WHERE namespace = 'customModels' AND key = ?").get(providerId);
    return row ? JSON.parse(row.value) : [];
  }
  const rows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'customModels'").all();
  const result = {};
  for (const row of rows) result[row.key] = JSON.parse(row.value);
  return result;
}

export async function getAllCustomModels() {
  const db = getDbInstance();
  const rows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'customModels'").all();
  const result = {};
  for (const row of rows) result[row.key] = JSON.parse(row.value);
  return result;
}

export async function addCustomModel(providerId, modelId, modelName) {
  const db = getDbInstance();
  const row = db.prepare("SELECT value FROM key_value WHERE namespace = 'customModels' AND key = ?").get(providerId);
  const models = row ? JSON.parse(row.value) : [];

  const exists = models.find(m => m.id === modelId);
  if (exists) return exists;

  const model = { id: modelId, name: modelName || modelId };
  models.push(model);
  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('customModels', ?, ?)").run(providerId, JSON.stringify(models));
  backupDbFile("pre-write");
  return model;
}

export async function removeCustomModel(providerId, modelId) {
  const db = getDbInstance();
  const row = db.prepare("SELECT value FROM key_value WHERE namespace = 'customModels' AND key = ?").get(providerId);
  if (!row) return false;

  const models = JSON.parse(row.value);
  const before = models.length;
  const filtered = models.filter(m => m.id !== modelId);

  if (filtered.length === before) return false;

  if (filtered.length === 0) {
    db.prepare("DELETE FROM key_value WHERE namespace = 'customModels' AND key = ?").run(providerId);
  } else {
    db.prepare("UPDATE key_value SET value = ? WHERE namespace = 'customModels' AND key = ?").run(JSON.stringify(filtered), providerId);
  }

  backupDbFile("pre-write");
  return true;
}

// ──────────────── Proxy Config ────────────────

const DEFAULT_PROXY_CONFIG = { global: null, providers: {}, combos: {}, keys: {} };

function migrateProxyEntry(value) {
  if (!value) return null;
  if (typeof value === "object" && value.type) return value;
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

export async function getProxyConfig() {
  const db = getDbInstance();
  const rows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'proxyConfig'").all();

  const raw = { ...DEFAULT_PROXY_CONFIG };
  for (const row of rows) {
    raw[row.key] = JSON.parse(row.value);
  }

  // Migrate legacy string values
  let migrated = false;
  if (raw.global && typeof raw.global === "string") {
    raw.global = migrateProxyEntry(raw.global);
    migrated = true;
  }
  if (raw.providers) {
    for (const [k, v] of Object.entries(raw.providers)) {
      if (typeof v === "string") {
        raw.providers[k] = migrateProxyEntry(v);
        migrated = true;
      }
    }
  }

  if (migrated) {
    const insert = db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('proxyConfig', ?, ?)");
    if (raw.global !== undefined) insert.run("global", JSON.stringify(raw.global));
    if (raw.providers) insert.run("providers", JSON.stringify(raw.providers));
  }

  return raw;
}

export async function getProxyForLevel(level, id) {
  const config = await getProxyConfig();
  if (level === "global") return config.global || null;
  const map = config[level + "s"] || config[level] || {};
  return (id ? map[id] : null) || null;
}

export async function setProxyForLevel(level, id, proxy) {
  const db = getDbInstance();
  const config = await getProxyConfig();

  if (level === "global") {
    config.global = proxy || null;
    db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('proxyConfig', 'global', ?)").run(JSON.stringify(config.global));
  } else {
    const mapKey = level + "s";
    if (!config[mapKey]) config[mapKey] = {};
    if (proxy) {
      config[mapKey][id] = proxy;
    } else {
      delete config[mapKey][id];
    }
    db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('proxyConfig', ?, ?)").run(mapKey, JSON.stringify(config[mapKey]));
  }

  backupDbFile("pre-write");
  return config;
}

export async function deleteProxyForLevel(level, id) {
  return setProxyForLevel(level, id, null);
}

export async function resolveProxyForConnection(connectionId) {
  const config = await getProxyConfig();

  // Level 1: Key
  if (connectionId && config.keys?.[connectionId]) {
    return { proxy: config.keys[connectionId], level: "key", levelId: connectionId };
  }

  // Need connection info for combo/provider lookup
  const db = getDbInstance();
  const connection = db.prepare("SELECT provider FROM provider_connections WHERE id = ?").get(connectionId);

  if (connection) {
    // Level 2: Combo
    if (config.combos && Object.keys(config.combos).length > 0) {
      const combos = db.prepare("SELECT id, data FROM combos").all();
      for (const comboRow of combos) {
        if (config.combos[comboRow.id]) {
          const combo = JSON.parse(comboRow.data);
          const usesProvider = (combo.models || []).some(m => m.provider === connection.provider);
          if (usesProvider) {
            return { proxy: config.combos[comboRow.id], level: "combo", levelId: comboRow.id };
          }
        }
      }
    }

    // Level 3: Provider
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

export async function setProxyConfig(config) {
  if (config.level !== undefined) {
    return setProxyForLevel(config.level, config.id || null, config.proxy);
  }

  const db = getDbInstance();
  const current = await getProxyConfig();
  const insert = db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('proxyConfig', ?, ?)");

  const tx = db.transaction(() => {
    if (config.global !== undefined) {
      current.global = config.global || null;
      insert.run("global", JSON.stringify(current.global));
    }
    for (const mapKey of ["providers", "combos", "keys"]) {
      if (config[mapKey]) {
        current[mapKey] = { ...(current[mapKey] || {}), ...config[mapKey] };
        for (const [k, v] of Object.entries(current[mapKey])) {
          if (!v) delete current[mapKey][k];
        }
        insert.run(mapKey, JSON.stringify(current[mapKey]));
      }
    }
  });
  tx();

  backupDbFile("pre-write");
  return current;
}

// ──────────────── Legacy compatibility (getDb not exported) ────────────────
// These are internal to the old localDb.js but some consumers may use getDb directly.
// We don't export getDb — all access should go through the domain functions above.
