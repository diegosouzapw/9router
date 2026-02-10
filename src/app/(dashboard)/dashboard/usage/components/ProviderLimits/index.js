"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { parseQuotaData, calculatePercentage } from "./utils";
import Card from "@/shared/components/Card";
import { CardSkeleton } from "@/shared/components/Loading";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";

const REFRESH_INTERVAL_MS = 120000;
const MIN_FETCH_INTERVAL_MS = 30000; // Debounce per-connection fetches

// Provider display config
const PROVIDER_CONFIG = {
  antigravity: { label: "Antigravity", color: "#F59E0B" },
  github: { label: "GitHub Copilot", color: "#333" },
  kiro: { label: "Kiro AI", color: "#FF6B35" },
  codex: { label: "OpenAI Codex", color: "#10A37F" },
  claude: { label: "Claude Code", color: "#D97757" },
};

// Short model display names for quota bars
function getShortModelName(name) {
  const map = {
    "gemini-3-pro-high": "G3 Pro",
    "gemini-3-pro-low": "G3 Pro Low",
    "gemini-3-flash": "G3 Flash",
    "gemini-2.5-flash": "G2.5 Flash",
    "claude-opus-4-6-thinking": "Opus 4.6 Tk",
    "claude-opus-4-5-thinking": "Opus 4.5 Tk",
    "claude-opus-4-5": "Opus 4.5",
    "claude-sonnet-4-5-thinking": "Sonnet 4.5 Tk",
    "claude-sonnet-4-5": "Sonnet 4.5",
    chat: "Chat",
    completions: "Completions",
    premium_interactions: "Premium",
    session: "Session",
    weekly: "Weekly",
    agentic_request: "Agentic",
    agentic_request_freetrial: "Agentic (Trial)",
  };
  return map[name] || name;
}

// Get bar color based on remaining percentage
function getBarColor(remaining) {
  if (remaining > 70) return { bar: "#22c55e", text: "#22c55e", bg: "rgba(34,197,94,0.12)" };
  if (remaining >= 30) return { bar: "#eab308", text: "#eab308", bg: "rgba(234,179,8,0.12)" };
  return { bar: "#ef4444", text: "#ef4444", bg: "rgba(239,68,68,0.12)" };
}

// Format countdown
function formatCountdown(resetAt) {
  if (!resetAt) return null;
  try {
    const diff = new Date(resetAt) - new Date();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 24) {
      const d = Math.floor(h / 24);
      return `${d}d ${h % 24}h`;
    }
    return `${h}h ${m}m`;
  } catch { return null; }
}

export default function ProviderLimits() {
  const [connections, setConnections] = useState([]);
  const [quotaData, setQuotaData] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const [initialLoading, setInitialLoading] = useState(true);

  const intervalRef = useRef(null);
  const countdownRef = useRef(null);
  const lastFetchTimeRef = useRef({});

  const fetchConnections = useCallback(async () => {
    try {
      const response = await fetch("/api/providers/client");
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      const list = data.connections || [];
      setConnections(list);
      return list;
    } catch {
      setConnections([]);
      return [];
    }
  }, []);

  const fetchQuota = useCallback(async (connectionId, provider) => {
    // Debounce: skip if last fetch was < MIN_FETCH_INTERVAL_MS ago
    const now = Date.now();
    const lastFetch = lastFetchTimeRef.current[connectionId] || 0;
    if (now - lastFetch < MIN_FETCH_INTERVAL_MS) {
      return; // Skip, data is still fresh
    }
    lastFetchTimeRef.current[connectionId] = now;

    setLoading((prev) => ({ ...prev, [connectionId]: true }));
    setErrors((prev) => ({ ...prev, [connectionId]: null }));
    try {
      const response = await fetch(`/api/usage/${connectionId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || response.statusText;
        if (response.status === 404) return;
        if (response.status === 401) {
          setQuotaData((prev) => ({
            ...prev,
            [connectionId]: { quotas: [], message: errorMsg },
          }));
          return;
        }
        throw new Error(`HTTP ${response.status}: ${errorMsg}`);
      }
      const data = await response.json();
      const parsedQuotas = parseQuotaData(provider, data);
      setQuotaData((prev) => ({
        ...prev,
        [connectionId]: {
          quotas: parsedQuotas,
          plan: data.plan || null,
          message: data.message || null,
          raw: data,
        },
      }));
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        [connectionId]: error.message || "Failed to fetch quota",
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, []);

  const refreshProvider = useCallback(
    async (connectionId, provider) => {
      await fetchQuota(connectionId, provider);
      setLastUpdated(new Date());
    },
    [fetchQuota]
  );

  const refreshAll = useCallback(async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    setCountdown(120);
    try {
      const conns = await fetchConnections();
      const oauthConnections = conns.filter(
        (conn) => USAGE_SUPPORTED_PROVIDERS.includes(conn.provider) && conn.authType === "oauth"
      );
      await Promise.all(oauthConnections.map((conn) => fetchQuota(conn.id, conn.provider)));
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error refreshing all:", error);
    } finally {
      setRefreshingAll(false);
    }
  }, [refreshingAll, fetchConnections, fetchQuota]);

  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      await refreshAll();
      setInitialLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    intervalRef.current = setInterval(refreshAll, REFRESH_INTERVAL_MS);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 120 : prev - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, refreshAll]);

  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      } else if (autoRefresh) {
        intervalRef.current = setInterval(refreshAll, REFRESH_INTERVAL_MS);
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => (prev <= 1 ? 120 : prev - 1));
        }, 1000);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [autoRefresh, refreshAll]);

  const filteredConnections = connections.filter(
    (conn) => USAGE_SUPPORTED_PROVIDERS.includes(conn.provider) && conn.authType === "oauth"
  );

  const sortedConnections = [...filteredConnections].sort((a, b) => {
    const priority = { antigravity: 1, github: 2, codex: 3, claude: 4, kiro: 5 };
    return (priority[a.provider] || 9) - (priority[b.provider] || 9);
  });

  if (initialLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (sortedConnections.length === 0) {
    return (
      <Card padding="lg">
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 64, opacity: 0.15 }}>cloud_off</span>
          <h3 style={{ marginTop: 16, fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
            No Providers Connected
          </h3>
          <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-muted)", maxWidth: 400, margin: "8px auto 0" }}>
            Connect to providers with OAuth to track your API quota limits and usage.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Provider Limits
          </h2>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {sortedConnections.length} account{sortedConnections.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setAutoRefresh((p) => !p)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "transparent", cursor: "pointer",
              color: "var(--text-primary)", fontSize: 13,
            }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: 18,
              color: autoRefresh ? "#22c55e" : "var(--text-muted)",
            }}>
              {autoRefresh ? "toggle_on" : "toggle_off"}
            </span>
            Auto-refresh
            {autoRefresh && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>({countdown}s)</span>
            )}
          </button>

          <button
            onClick={refreshAll}
            disabled={refreshingAll}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              cursor: refreshingAll ? "not-allowed" : "pointer",
              opacity: refreshingAll ? 0.5 : 1,
              color: "var(--text-primary)", fontSize: 13,
            }}
          >
            <span className={`material-symbols-outlined ${refreshingAll ? "animate-spin" : ""}`}
              style={{ fontSize: 16 }}>refresh</span>
            Refresh All
          </button>
        </div>
      </div>

      {/* Account rows */}
      <div style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
        background: "rgba(0,0,0,0.15)",
      }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr 100px 48px",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
        }}>
          <div>Account</div>
          <div>Model Quotas</div>
          <div style={{ textAlign: "center" }}>Last Used</div>
          <div style={{ textAlign: "center" }}>Actions</div>
        </div>

        {sortedConnections.map((conn, idx) => {
          const quota = quotaData[conn.id];
          const isLoading = loading[conn.id];
          const error = errors[conn.id];
          const config = PROVIDER_CONFIG[conn.provider] || { label: conn.provider, color: "#666" };

          return (
            <div
              key={conn.id}
              style={{
                display: "grid",
                gridTemplateColumns: "280px 1fr 100px 48px",
                alignItems: "center",
                padding: "14px 16px",
                borderBottom: idx < sortedConnections.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {/* Account Info */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", flexShrink: 0,
                }}>
                  <Image
                    src={`/providers/${conn.provider}.png`}
                    alt={conn.provider}
                    width={32} height={32}
                    className="object-contain"
                    sizes="32px"
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {conn.name || config.label}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    {quota?.plan && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        padding: "1px 6px", borderRadius: 4,
                        background: config.color + "33",
                        color: config.color,
                        letterSpacing: "0.03em",
                      }}>
                        {quota.plan}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quota Bars */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", paddingRight: 12 }}>
                {isLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 12 }}>
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
                    Loading...
                  </div>
                ) : error ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ef4444" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
                      {error}
                    </span>
                  </div>
                ) : quota?.message && (!quota.quotas || quota.quotas.length === 0) ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                    {quota.message}
                  </div>
                ) : quota?.quotas?.length > 0 ? (
                  quota.quotas.map((q, i) => {
                    const remaining = q.remainingPercentage !== undefined
                      ? Math.round(q.remainingPercentage)
                      : calculatePercentage(q.used, q.total);
                    const colors = getBarColor(remaining);
                    const cd = formatCountdown(q.resetAt);
                    const shortName = getShortModelName(q.name);

                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        minWidth: 200, flex: "0 0 auto",
                      }}>
                        {/* Model label */}
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          padding: "2px 8px", borderRadius: 4,
                          background: colors.bg, color: colors.text,
                          whiteSpace: "nowrap", minWidth: 60, textAlign: "center",
                        }}>
                          {shortName}
                        </span>

                        {/* Countdown */}
                        {cd && (
                          <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                            ⏱ {cd}
                          </span>
                        )}

                        {/* Progress bar */}
                        <div style={{
                          flex: 1, height: 6, borderRadius: 3,
                          background: "rgba(255,255,255,0.06)",
                          minWidth: 60, overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 3,
                            width: `${Math.min(remaining, 100)}%`,
                            background: colors.bar,
                            transition: "width 0.3s ease",
                          }} />
                        </div>

                        {/* Percentage */}
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: colors.text, minWidth: 32, textAlign: "right",
                        }}>
                          {remaining}%
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                    No quota data
                  </div>
                )}
              </div>

              {/* Last Used */}
              <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>
                {lastUpdated ? (
                  <span>{lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                ) : "-"}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
                <button
                  onClick={() => refreshProvider(conn.id, conn.provider)}
                  disabled={isLoading}
                  title="Refresh quota"
                  style={{
                    padding: 4, borderRadius: 6, border: "none",
                    background: "transparent", cursor: isLoading ? "not-allowed" : "pointer",
                    opacity: isLoading ? 0.3 : 0.6,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = isLoading ? "0.3" : "0.6"; }}
                >
                  <span className={`material-symbols-outlined ${isLoading ? "animate-spin" : ""}`}
                    style={{ fontSize: 16, color: "var(--text-muted)" }}>refresh</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
