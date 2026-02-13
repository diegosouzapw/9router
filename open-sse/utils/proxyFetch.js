import { AsyncLocalStorage } from "node:async_hooks";
import { ProxyAgent } from "undici";

const isCloud = typeof caches !== "undefined" && typeof caches === "object";
const PATCH_STATE_KEY = Symbol.for("9router.proxyFetch.state");

function getPatchState() {
  if (!globalThis[PATCH_STATE_KEY]) {
    globalThis[PATCH_STATE_KEY] = {
      originalFetch: globalThis.fetch,
      proxyContext: new AsyncLocalStorage(),
      dispatcherCache: new Map(),
      isPatched: false,
    };
  }
  return globalThis[PATCH_STATE_KEY];
}

const patchState = getPatchState();
const originalFetch = patchState.originalFetch;
const proxyContext = patchState.proxyContext;
const dispatcherCache = patchState.dispatcherCache;

const SUPPORTED_PROXY_PROTOCOLS = new Set(["http:", "https:"]);
const UNSUPPORTED_SOCKS_PROTOCOLS = new Set(["socks:", "socks4:", "socks5:"]);

function noProxyMatch(targetUrl) {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  if (!noProxy) return false;

  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    return false;
  }

  const hostname = target.hostname.toLowerCase();
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  const patterns = noProxy
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  return patterns.some((pattern) => {
    if (pattern === "*") return true;

    const [patternHost, patternPort] = pattern.split(":");
    if (patternPort && patternPort !== port) return false;

    if (!patternHost) return false;
    if (patternHost.startsWith(".")) {
      return hostname.endsWith(patternHost) || hostname === patternHost.slice(1);
    }
    return hostname === patternHost || hostname.endsWith(`.${patternHost}`);
  });
}

function normalizeProxyUrl(proxyUrl, source = "proxy") {
  let parsed;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new Error(`[ProxyFetch] Invalid ${source} URL`);
  }

  if (UNSUPPORTED_SOCKS_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("[ProxyFetch] SOCKS/SOCKS5 proxies are not supported in outbound runtime");
  }
  if (!SUPPORTED_PROXY_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `[ProxyFetch] Unsupported ${source} protocol: ${parsed.protocol.replace(":", "")}`
    );
  }
  if (!parsed.hostname) {
    throw new Error(`[ProxyFetch] Invalid ${source} host`);
  }

  return parsed.toString();
}

function proxyConfigToUrl(proxyConfig) {
  if (!proxyConfig) return null;

  if (typeof proxyConfig === "string") {
    return normalizeProxyUrl(proxyConfig, "context proxy");
  }

  if (typeof proxyConfig !== "object") {
    throw new Error("[ProxyFetch] Invalid context proxy config");
  }

  const type = String(proxyConfig.type || "http").toLowerCase();
  const protocol = `${type}:`;

  if (UNSUPPORTED_SOCKS_PROTOCOLS.has(protocol)) {
    throw new Error("[ProxyFetch] SOCKS/SOCKS5 proxies are not supported in outbound runtime");
  }
  if (!SUPPORTED_PROXY_PROTOCOLS.has(protocol)) {
    throw new Error(`[ProxyFetch] Unsupported context proxy protocol: ${type}`);
  }
  if (!proxyConfig.host) {
    throw new Error("[ProxyFetch] Context proxy host is required");
  }

  const port = String(proxyConfig.port || (type === "https" ? "443" : "8080"));
  const proxyUrl = new URL(`${type}://${proxyConfig.host}:${port}`);

  if (proxyConfig.username) {
    proxyUrl.username = proxyConfig.username;
    proxyUrl.password = proxyConfig.password || "";
  }

  return normalizeProxyUrl(proxyUrl.toString(), "context proxy");
}

function resolveEnvProxyUrl(targetUrl) {
  if (noProxyMatch(targetUrl)) return null;

  let protocol;
  try {
    protocol = new URL(targetUrl).protocol;
  } catch {
    return null;
  }

  const proxyUrl =
    protocol === "https:"
      ? process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.ALL_PROXY ||
        process.env.all_proxy
      : process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        process.env.ALL_PROXY ||
        process.env.all_proxy;

  if (!proxyUrl) return null;
  return normalizeProxyUrl(proxyUrl, "environment proxy");
}

function resolveProxyForRequest(targetUrl) {
  const contextProxy = proxyContext.getStore();
  if (contextProxy) {
    return { source: "context", proxyUrl: proxyConfigToUrl(contextProxy) };
  }

  const envProxyUrl = resolveEnvProxyUrl(targetUrl);
  if (envProxyUrl) {
    return { source: "env", proxyUrl: envProxyUrl };
  }

  return { source: "direct", proxyUrl: null };
}

function getProxyDispatcher(proxyUrl) {
  let dispatcher = dispatcherCache.get(proxyUrl);
  if (!dispatcher) {
    dispatcher = new ProxyAgent(proxyUrl);
    dispatcherCache.set(proxyUrl, dispatcher);
  }
  return dispatcher;
}

function getTargetUrl(input) {
  if (typeof input === "string") return input;
  if (input && typeof input.url === "string") return input.url;
  return String(input);
}

export async function runWithProxyContext(proxyConfig, fn) {
  if (typeof fn !== "function") {
    throw new TypeError("runWithProxyContext requires a callback function");
  }

  return proxyContext.run(proxyConfig || null, async () => {
    if (proxyConfig) {
      const proxyUrl = proxyConfigToUrl(proxyConfig);
      const parsed = new URL(proxyUrl);
      console.log(`[ProxyFetch] Applied request proxy context: ${parsed.protocol}//${parsed.host}`);
    }
    return fn();
  });
}

async function patchedFetch(input, options = {}) {
  if (options?.dispatcher) {
    return originalFetch(input, options);
  }

  const targetUrl = getTargetUrl(input);
  let resolved;
  try {
    resolved = resolveProxyForRequest(targetUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ProxyFetch] Proxy configuration error: ${message}`);
    throw error;
  }
  const { source, proxyUrl } = resolved;

  if (!proxyUrl) {
    return originalFetch(input, options);
  }

  try {
    const dispatcher = getProxyDispatcher(proxyUrl);
    return await originalFetch(input, { ...options, dispatcher });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ProxyFetch] Proxy request failed (${source}, fail-closed): ${message}`);
    throw error;
  }
}

if (!isCloud && !patchState.isPatched) {
  globalThis.fetch = patchedFetch;
  patchState.isPatched = true;
}

export default isCloud ? originalFetch : patchedFetch;
