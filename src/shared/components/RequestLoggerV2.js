"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Card from "./Card";

// Protocol badge colors
const PROTOCOL_COLORS = {
  openai: { bg: "#10A37F", text: "#fff", label: "OpenAI" },
  claude: { bg: "#D97757", text: "#fff", label: "Claude" },
  gemini: { bg: "#4285F4", text: "#fff", label: "Gemini" },
  warmup: { bg: "#F59E0B", text: "#000", label: "Warmup" },
  bypass: { bg: "#6B7280", text: "#fff", label: "Bypass" },
};

// Status badge styling
function getStatusStyle(status) {
  if (status >= 200 && status < 300) return { bg: "#059669", text: "#fff" };
  if (status >= 400 && status < 500) return { bg: "#D97706", text: "#fff" };
  if (status >= 500) return { bg: "#DC2626", text: "#fff" };
  if (status === 0) return { bg: "#6366F1", text: "#fff" }; // pending
  return { bg: "#6B7280", text: "#fff" };
}

// Quick filter definitions
const QUICK_FILTERS = [
  { key: "all", label: "All", icon: null },
  { key: "error", label: "Error", icon: "error" },
  { key: "gemini", label: "Gemini", provider: "gemini" },
  { key: "claude", label: "Claude", provider: "claude" },
  { key: "openai", label: "OpenAI", provider: "openai" },
  { key: "kimi", label: "Kimi", provider: "kimi" },
  { key: "fireworks", label: "Fireworks", provider: "fireworks" },
  { key: "codex", label: "Codex", provider: "codex" },
];

function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "-";
  }
}

function formatDuration(ms) {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function maskAccount(account) {
  if (!account || account === "-") return "-";
  // mask email: show first 3 chars + *** + @domain
  const atIdx = account.indexOf("@");
  if (atIdx > 3) {
    return account.slice(0, 3) + "***" + account.slice(atIdx);
  }
  if (account.length > 8) {
    return account.slice(0, 5) + "***";
  }
  return account;
}

export default function RequestLoggerV2() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const intervalRef = useRef(null);

  const fetchLogs = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (activeFilter === "error") params.set("status", "error");
      const filterDef = QUICK_FILTERS.find(f => f.key === activeFilter);
      if (filterDef?.provider) params.set("provider", filterDef.provider);
      if (selectedAccount) params.set("account", selectedAccount);
      params.set("limit", "300");

      const res = await fetch(`/api/usage/call-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (error) {
      console.error("Failed to fetch call logs:", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [search, activeFilter, selectedAccount]);

  // Initial load
  useEffect(() => {
    fetchLogs(true);
  }, []);

  // Refetch when filters change
  useEffect(() => {
    fetchLogs(false);
  }, [search, activeFilter, selectedAccount]);

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (recording) {
      intervalRef.current = setInterval(() => fetchLogs(false), 3000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [recording, fetchLogs]);

  // Fetch log detail
  const openDetail = async (logEntry) => {
    setSelectedLog(logEntry);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch(`/api/usage/call-logs/${logEntry.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      }
    } catch (error) {
      console.error("Failed to fetch log detail:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedLog(null);
    setDetailData(null);
  };

  // Copy to clipboard
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for non-HTTPS or older browsers
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        return true;
      } catch {
        return false;
      }
    }
  };

  // Unique accounts for dropdown
  const uniqueAccounts = [...new Set(logs.map(l => l.account).filter(a => a && a !== "-"))];

  // Stats
  const totalCount = logs.length;
  const okCount = logs.filter(l => l.status >= 200 && l.status < 300).length;
  const errorCount = logs.filter(l => l.status >= 400).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Recording Toggle */}
        <button
          onClick={() => setRecording(!recording)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            recording 
              ? "bg-red-500/10 border-red-500/30 text-red-400" 
              : "bg-bg-subtle border-border text-text-muted"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${recording ? "bg-red-500 animate-pulse" : "bg-text-muted"}`} />
          {recording ? "Recording" : "Paused"}
        </button>

        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">search</span>
          <input
            type="text"
            placeholder="Filter by model, path, or status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-bg-subtle border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
          />
        </div>

        {/* Account Dropdown */}
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="px-3 py-2 rounded-lg bg-bg-subtle border border-border text-sm text-text-primary focus:outline-none focus:border-primary appearance-none cursor-pointer min-w-[160px]"
        >
          <option value="">All Accounts</option>
          {uniqueAccounts.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Stats */}
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="px-2 py-1 rounded bg-bg-subtle border border-border font-mono">
            {totalCount} total
          </span>
          <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-mono">
            {okCount} OK
          </span>
          {errorCount > 0 && (
            <span className="px-2 py-1 rounded bg-red-500/10 text-red-400 font-mono">
              {errorCount} ERR
            </span>
          )}
        </div>

        {/* Refresh & Clear */}
        <button
          onClick={() => fetchLogs(false)}
          className="p-2 rounded-lg hover:bg-bg-subtle text-text-muted hover:text-text-primary transition-colors"
          title="Refresh"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
        </button>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted uppercase tracking-wider mr-1">Quick Filters:</span>
        {QUICK_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(activeFilter === f.key ? "all" : f.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              activeFilter === f.key
                ? "bg-primary text-white border-primary"
                : "bg-bg-subtle border-border text-text-muted hover:border-text-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden bg-black/5 dark:bg-black/20">
        <div className="p-0 overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
          {loading && logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <span className="material-symbols-outlined text-[48px] mb-2 block opacity-40">receipt_long</span>
              No logs recorded yet. Make some API calls to see them here.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: "var(--bg-primary, #0f1117)" }}>
                <tr className="border-b border-border" style={{ backgroundColor: "var(--bg-primary, #0f1117)" }}>
                  <th className="px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px]">Status</th>
                  <th className="px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px]">Method</th>
                  <th className="px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px]">Model</th>
                  <th className="px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px]">Protocol</th>
                  <th className="px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px]">Account</th>
                  <th className="px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px]">Path</th>
                  <th className="px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px] text-right">Tokens</th>
                  <th className="px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px] text-right">Duration</th>
                  <th className="px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px] text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {logs.map((log) => {
                  const statusStyle = getStatusStyle(log.status);
                  const protocolKey = log.sourceFormat || log.provider;
                  const protocol = PROTOCOL_COLORS[protocolKey] || PROTOCOL_COLORS[log.provider] || { bg: "#6B7280", text: "#fff", label: (protocolKey || log.provider || "-").toUpperCase() };
                  const isError = log.status >= 400;

                  return (
                    <tr
                      key={log.id}
                      onClick={() => openDetail(log)}
                      className={`cursor-pointer hover:bg-primary/5 transition-colors ${isError ? "bg-red-500/5" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[10px] font-bold min-w-[36px] text-center"
                          style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                        >
                          {log.status || "..."}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-text-muted font-mono">{log.method}</td>
                      <td className="px-3 py-2 font-medium text-primary font-mono">{log.model}</td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase"
                          style={{ backgroundColor: protocol.bg, color: protocol.text }}
                        >
                          {protocol.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-text-muted truncate max-w-[120px]" title={log.account}>
                        {maskAccount(log.account)}
                      </td>
                      <td className="px-3 py-2 text-text-muted font-mono truncate max-w-[200px]" title={log.path}>
                        {log.path}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className="text-text-muted">I:</span>{" "}
                        <span className="text-primary">{log.tokens?.in?.toLocaleString() || 0}</span>
                        <span className="mx-1 text-border">|</span>
                        <span className="text-text-muted">O:</span>{" "}
                        <span className="text-emerald-400">{log.tokens?.out?.toLocaleString() || 0}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-text-muted font-mono">{formatDuration(log.duration)}</td>
                      <td className="px-3 py-2 text-right text-text-muted">{formatTime(log.timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <div className="text-[10px] text-text-muted italic">
        Call logs are also saved as JSON files to <code>~/.9router/call_logs/</code> with 7-day rotation.
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <DetailModal
          log={selectedLog}
          detail={detailData}
          loading={detailLoading}
          onClose={closeDetail}
          onCopy={copyToClipboard}
        />
      )}
    </div>
  );
}

// ─── Detail Modal ───────────────────────────────────────────────────────────

function DetailModal({ log, detail, loading, onClose, onCopy }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const statusStyle = getStatusStyle(log.status);
  const protocolKey = log.sourceFormat || log.provider;
  const protocol = PROTOCOL_COLORS[protocolKey] || PROTOCOL_COLORS[log.provider] || { bg: "#6B7280", text: "#fff", label: (protocolKey || log.provider || "-").toUpperCase() };

  const formatDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("pt-BR") + ", " + d.toLocaleTimeString("en-US", { hour12: false });
    } catch {
      return iso;
    }
  };

  const requestJson = detail?.requestBody ? JSON.stringify(detail.requestBody, null, 2) : null;
  const responseJson = detail?.responseBody ? JSON.stringify(detail.responseBody, null, 2) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-bg-primary border border-border rounded-xl w-full max-w-[900px] max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-bg-primary/95 backdrop-blur-sm rounded-t-xl">
          <div className="flex items-center gap-3">
            <span
              className="inline-block px-2.5 py-1 rounded text-xs font-bold"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
            >
              {log.status}
            </span>
            <span className="font-bold text-lg">{log.method}</span>
            <span className="text-text-muted font-mono text-sm">{log.path}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-subtle text-text-muted hover:text-text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-bg-subtle rounded-xl border border-border">
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Time</div>
              <div className="text-sm font-medium">{formatDate(log.timestamp)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Duration</div>
              <div className="text-sm font-medium">{formatDuration(log.duration)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Tokens (I/O)</div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-xs font-bold">
                  In: {(detail?.tokens?.in || log.tokens?.in || 0).toLocaleString()}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                  Out: {(detail?.tokens?.out || log.tokens?.out || 0).toLocaleString()}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Protocol</div>
              <span
                className="inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase"
                style={{ backgroundColor: protocol.bg, color: protocol.text }}
              >
                {protocol.label}
              </span>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Model</div>
              <div className="text-sm font-medium text-primary font-mono">{log.model}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Account</div>
              <div className="text-sm font-medium">{detail?.account || log.account || "-"}</div>
            </div>
          </div>

          {/* Error Message */}
          {(detail?.error || log.error) && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1 font-bold">Error</div>
              <div className="text-sm text-red-300 font-mono">{detail?.error || log.error}</div>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-text-muted animate-pulse">Loading request details...</div>
          ) : (
            <>
              {/* Request Payload */}
              {requestJson && (
                <PayloadSection
                  title="Request Payload"
                  json={requestJson}
                  onCopy={() => onCopy(requestJson)}
                />
              )}

              {/* Response Payload */}
              {responseJson && (
                <PayloadSection
                  title="Response Payload"
                  json={responseJson}
                  onCopy={() => onCopy(responseJson)}
                />
              )}

              {!requestJson && !responseJson && !loading && (
                <div className="p-6 text-center text-text-muted">
                  <span className="material-symbols-outlined text-[32px] mb-2 block opacity-40">info</span>
                  <p className="text-sm">No payload data available for this log entry.</p>
                  <p className="text-xs mt-1">Request/response bodies are only captured for non-streaming calls or when streaming completes normally.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Payload Code Block ─────────────────────────────────────────────────────

function PayloadSection({ title, json, onCopy }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await onCopy();
    if (success !== false) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] text-text-muted uppercase tracking-wider font-bold">{title}</h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">{copied ? "check" : "content_copy"}</span>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 rounded-xl bg-black/30 border border-border overflow-x-auto text-xs font-mono text-text-primary max-h-[600px] overflow-y-auto leading-relaxed whitespace-pre-wrap break-words">
        {json}
      </pre>
    </div>
  );
}
