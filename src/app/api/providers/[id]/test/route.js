import { NextResponse } from "next/server";
import { getProviderConnectionById, updateProviderConnection, isCloudEnabled } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { syncToCloud } from "@/app/api/sync/cloud/route";
import {
  KIRO_CONFIG,
} from "@/lib/oauth/constants/oauth";
import { validateProviderApiKey } from "@/lib/providers/validation";
// Use the shared open-sse token refresh with built-in dedup/race-condition cache
import { getAccessToken } from "open-sse/services/tokenRefresh.js";

// OAuth provider test endpoints
const OAUTH_TEST_CONFIG = {
  claude: {
    // Claude doesn't have userinfo, we verify token exists and not expired
    checkExpiry: true,
  },
  codex: {
    url: "https://api.openai.com/v1/models",
    method: "GET",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    refreshable: true,
  },
  "gemini-cli": {
    url: "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
    method: "GET",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    refreshable: true,
  },
  antigravity: {
    url: "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
    method: "GET",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    refreshable: true,
  },
  github: {
    url: "https://api.github.com/user",
    method: "GET",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    extraHeaders: { "User-Agent": "9Router", "Accept": "application/vnd.github+json" },
  },
  iflow: {
    url: "https://iflow.cn/api/oauth/getUserInfo",
    method: "GET",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
  qwen: {
    url: "https://portal.qwen.ai/v1/models",
    method: "GET",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
  kiro: {
    checkExpiry: true,
    refreshable: true,
  },
};

/**
 * Refresh OAuth token using the shared open-sse getAccessToken.
 * This shares the in-flight promise cache with the SSE layer,
 * preventing race conditions where two code paths attempt to
 * refresh the same token concurrently.
 *
 * @returns {object} { accessToken, expiresIn, refreshToken } or null if failed
 */
async function refreshOAuthToken(connection) {
  const { provider, refreshToken } = connection;
  if (!refreshToken) return null;

  try {
    // Kiro needs extra fields the generic function expects
    const credentials = {
      refreshToken,
      providerSpecificData: connection.providerSpecificData || {},
    };

    const result = await getAccessToken(provider, credentials, console);
    return result; // { accessToken, expiresIn, refreshToken } or null
  } catch (err) {
    console.log(`Error refreshing ${provider} token:`, err.message);
    return null;
  }
}

/**
 * Check if token is expired or about to expire (within 5 minutes)
 */
function isTokenExpired(connection) {
  if (!connection.expiresAt) return false;
  const expiresAt = new Date(connection.expiresAt).getTime();
  const buffer = 5 * 60 * 1000; // 5 minutes
  return expiresAt <= Date.now() + buffer;
}

/**
 * Sync to cloud if enabled
 */
async function syncToCloudIfEnabled() {
  try {
    const cloudEnabled = await isCloudEnabled();
    if (!cloudEnabled) return;

    const machineId = await getConsistentMachineId();
    await syncToCloud(machineId);
  } catch (error) {
    console.log("Error syncing to cloud after token refresh:", error);
  }
}

/**
 * Test OAuth connection by calling provider API
 * Auto-refreshes token if expired
 * @returns {{ valid: boolean, error: string|null, refreshed: boolean, newTokens: object|null }}
 */
async function testOAuthConnection(connection) {
  const config = OAUTH_TEST_CONFIG[connection.provider];

  if (!config) {
    return { valid: false, error: "Provider test not supported", refreshed: false };
  }

  // Check if token exists
  if (!connection.accessToken) {
    return { valid: false, error: "No access token", refreshed: false };
  }

  let accessToken = connection.accessToken;
  let refreshed = false;
  let newTokens = null;

  // Auto-refresh if token is expired and provider supports refresh
  const tokenExpired = isTokenExpired(connection);
  if (config.refreshable && tokenExpired && connection.refreshToken) {
    const tokens = await refreshOAuthToken(connection);
    if (tokens) {
      accessToken = tokens.accessToken;
      refreshed = true;
      newTokens = tokens;
    } else {
      // Refresh failed
      return { valid: false, error: "Token expired and refresh failed", refreshed: false };
    }
  }

  // For providers that only check expiry (no test endpoint available)
  if (config.checkExpiry) {
    // If we already refreshed successfully, token is valid
    if (refreshed) {
      return { valid: true, error: null, refreshed, newTokens };
    }
    // Check if token is expired (no refresh available)
    if (tokenExpired) {
      return { valid: false, error: "Token expired", refreshed: false };
    }
    return { valid: true, error: null, refreshed: false, newTokens: null };
  }

  // Call test endpoint
  try {
    const headers = {
      [config.authHeader]: `${config.authPrefix}${accessToken}`,
      ...config.extraHeaders,
    };

    const res = await fetch(config.url, {
      method: config.method,
      headers,
    });

    if (res.ok) {
      return { valid: true, error: null, refreshed, newTokens };
    }

    // If 401 and we haven't tried refresh yet, try refresh now
    if (res.status === 401 && config.refreshable && !refreshed && connection.refreshToken) {
      const tokens = await refreshOAuthToken(connection);
      if (tokens) {
        // Retry with new token
        const retryRes = await fetch(config.url, {
          method: config.method,
          headers: {
            [config.authHeader]: `${config.authPrefix}${tokens.accessToken}`,
            ...config.extraHeaders,
          },
        });

        if (retryRes.ok) {
          return { valid: true, error: null, refreshed: true, newTokens: tokens };
        }
      }
      return { valid: false, error: "Token invalid or revoked", refreshed: false };
    }

    if (res.status === 401) {
      return { valid: false, error: "Token invalid or revoked", refreshed };
    }
    if (res.status === 403) {
      return { valid: false, error: "Access denied", refreshed };
    }

    return { valid: false, error: `API returned ${res.status}`, refreshed };
  } catch (err) {
    return { valid: false, error: err.message, refreshed };
  }
}

/**
 * Test API key connection
 */
async function testApiKeyConnection(connection) {
  if (!connection.apiKey) {
    return { valid: false, error: "Missing API key" };
  }

  const result = await validateProviderApiKey({
    provider: connection.provider,
    apiKey: connection.apiKey,
    providerSpecificData: connection.providerSpecificData,
  });

  if (result.unsupported) {
    return { valid: false, error: "Provider test not supported" };
  }

  return {
    valid: !!result.valid,
    error: result.valid ? null : (result.error || "Invalid API key"),
  };
}

// POST /api/providers/[id]/test - Test connection
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    let result;

    if (connection.authType === "apikey") {
      result = await testApiKeyConnection(connection);
    } else {
      result = await testOAuthConnection(connection);
    }

    // Build update data
    const updateData = {
      testStatus: result.valid ? "active" : "error",
      lastError: result.valid ? null : result.error,
      lastErrorAt: result.valid ? null : new Date().toISOString(),
    };

    // If token was refreshed, update tokens in DB
    if (result.refreshed && result.newTokens) {
      updateData.accessToken = result.newTokens.accessToken;
      if (result.newTokens.refreshToken) {
        updateData.refreshToken = result.newTokens.refreshToken;
      }
      if (result.newTokens.expiresIn) {
        updateData.expiresAt = new Date(Date.now() + result.newTokens.expiresIn * 1000).toISOString();
      }
    }

    // Update status in db
    await updateProviderConnection(id, updateData);

    // Sync to cloud if token was refreshed
    if (result.refreshed) {
      await syncToCloudIfEnabled();
    }

    return NextResponse.json({
      valid: result.valid,
      error: result.error,
      refreshed: result.refreshed || false,
    });
  } catch (error) {
    console.log("Error testing connection:", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
