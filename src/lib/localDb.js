/**
 * localDb.js — Re-export layer for backward compatibility.
 *
 * All 27+ consumer files import from "@/lib/localDb".
 * This thin layer re-exports everything from the new SQLite backend,
 * so zero consumer changes are needed.
 */

export {
  // Provider Connections
  getProviderConnections,
  getProviderConnectionById,
  createProviderConnection,
  updateProviderConnection,
  deleteProviderConnection,
  deleteProviderConnectionsByProvider,
  reorderProviderConnections,
  cleanupProviderConnections,

  // Provider Nodes
  getProviderNodes,
  getProviderNodeById,
  createProviderNode,
  updateProviderNode,
  deleteProviderNode,

  // Model Aliases
  getModelAliases,
  setModelAlias,
  deleteModelAlias,

  // MITM Alias
  getMitmAlias,
  setMitmAliasAll,

  // Combos
  getCombos,
  getComboById,
  getComboByName,
  createCombo,
  updateCombo,
  deleteCombo,

  // API Keys
  getApiKeys,
  createApiKey,
  deleteApiKey,
  validateApiKey,
  getApiKeyMetadata,

  // Settings
  getSettings,
  updateSettings,
  isCloudEnabled,

  // Pricing
  getPricing,
  getPricingForModel,
  updatePricing,
  resetPricing,
  resetAllPricing,

  // Custom Models
  getCustomModels,
  getAllCustomModels,
  addCustomModel,
  removeCustomModel,

  // Proxy Config
  getProxyConfig,
  getProxyForLevel,
  setProxyForLevel,
  deleteProxyForLevel,
  resolveProxyForConnection,
  setProxyConfig,

  // Backup Management
  backupDbFile,
  listDbBackups,
  restoreDbBackup,
} from "./sqliteDb.js";
