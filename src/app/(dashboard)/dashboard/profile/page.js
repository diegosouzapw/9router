"use client";

import { useState, useEffect } from "react";
import { Card, Button, Badge, Toggle, Input } from "@/shared/components";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";

export default function ProfilePage() {
  const { theme, setTheme, isDark } = useTheme();
  const [settings, setSettings] = useState({ fallbackStrategy: "fill-first" });
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [passLoading, setPassLoading] = useState(false);
  
  // Combo defaults state
  const [comboDefaults, setComboDefaults] = useState({
    strategy: "priority",
    maxRetries: 1,
    retryDelayMs: 2000,
    timeoutMs: 120000,
    healthCheckEnabled: true,
    healthCheckTimeoutMs: 3000,
    maxComboDepth: 3,
    trackMetrics: true,
  });
  const [providerOverrides, setProviderOverrides] = useState({});
  const [newOverrideProvider, setNewOverrideProvider] = useState("");
  const [comboDefaultsSaving, setComboDefaultsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        setLoading(false);
      });

    // Fetch combo defaults
    fetch("/api/settings/combo-defaults")
      .then((res) => res.json())
      .then((data) => {
        if (data.comboDefaults) setComboDefaults(data.comboDefaults);
        if (data.providerOverrides) setProviderOverrides(data.providerOverrides);
      })
      .catch((err) => console.error("Failed to fetch combo defaults:", err));
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ type: "error", message: "Passwords do not match" });
      return;
    }

    setPassLoading(true);
    setPassStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPassStatus({ type: "success", message: "Password updated successfully" });
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        setPassStatus({ type: "error", message: data.error || "Failed to update password" });
      }
    } catch (err) {
      setPassStatus({ type: "error", message: "An error occurred" });
    } finally {
      setPassLoading(false);
    }
  };

  const updateFallbackStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackStrategy: strategy }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, fallbackStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const updateRoundRobinConfig = async (field, value) => {
    const numVal = parseInt(value);
    if (isNaN(numVal) || numVal < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: numVal }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, [field]: numVal }));
      }
    } catch (err) {
      console.error("Failed to update round-robin config:", err);
    }
  };

  const updateRequireLogin = async (requireLogin) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireLogin }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, requireLogin }));
      }
    } catch (err) {
      console.error("Failed to update require login:", err);
    }
  };

  const saveComboDefaults = async () => {
    setComboDefaultsSaving(true);
    try {
      const res = await fetch("/api/settings/combo-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboDefaults, providerOverrides }),
      });
      if (!res.ok) console.error("Failed to save combo defaults");
    } catch (err) {
      console.error("Failed to save combo defaults:", err);
    } finally {
      setComboDefaultsSaving(false);
    }
  };

  const addProviderOverride = () => {
    const name = newOverrideProvider.trim().toLowerCase();
    if (!name || providerOverrides[name]) return;
    setProviderOverrides(prev => ({ ...prev, [name]: { maxRetries: 1, timeoutMs: 120000 } }));
    setNewOverrideProvider("");
  };

  const removeProviderOverride = (provider) => {
    setProviderOverrides(prev => {
      const copy = { ...prev };
      delete copy[provider];
      return copy;
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col gap-6">
        {/* Local Mode Info */}
        <Card>
          <div className="flex items-center gap-4 mb-4">
            <div className="size-12 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">computer</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold">Local Mode</h2>
              <p className="text-text-muted">Running on your machine</p>
            </div>
          </div>
          <div className="pt-4 border-t border-border">
            <p className="text-sm text-text-muted">
              All data is stored locally in the <code className="bg-sidebar px-1 rounded">~/.9router/db.json</code> file.
            </p>
          </div>
        </Card>

        {/* Security */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[20px]">shield</span>
            </div>
            <h3 className="text-lg font-semibold">Security</h3>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Require login</p>
                <p className="text-sm text-text-muted">
                  When ON, dashboard requires password. When OFF, access without login.
                </p>
              </div>
              <Toggle
                checked={settings.requireLogin === true}
                onChange={() => updateRequireLogin(!settings.requireLogin)}
                disabled={loading}
              />
            </div>
            {settings.requireLogin === true && (
              <form onSubmit={handlePasswordChange} className="flex flex-col gap-4 pt-4 border-t border-border/50">
                {settings.hasPassword && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Current Password</label>
                    <Input
                      type="password"
                      placeholder="Enter current password"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      required
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">New Password</label>
                    <Input
                      type="password"
                      placeholder="Enter new password"
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Confirm New Password</label>
                    <Input
                      type="password"
                      placeholder="Confirm new password"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {passStatus.message && (
                  <p className={`text-sm ${passStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                    {passStatus.message}
                  </p>
                )}

                <div className="pt-2">
                  <Button type="submit" variant="primary" loading={passLoading}>
                    {settings.hasPassword ? "Update Password" : "Set Password"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>

        {/* Routing Preferences */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <span className="material-symbols-outlined text-[20px]">route</span>
            </div>
            <h3 className="text-lg font-semibold">Routing Strategy</h3>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Round Robin</p>
                <p className="text-sm text-text-muted">
                  Cycle through accounts to distribute load
                </p>
              </div>
              <Toggle
                checked={settings.fallbackStrategy === "round-robin"}
                onChange={() => updateFallbackStrategy(settings.fallbackStrategy === "round-robin" ? "fill-first" : "round-robin")}
                disabled={loading}
              />
            </div>

            {/* Semaphore Config */}
            {settings.fallbackStrategy === "round-robin" && (
              <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Concurrency per Account</p>
                    <p className="text-sm text-text-muted">
                      Max simultaneous requests per account
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={settings.concurrencyPerAccount || 3}
                    onChange={(e) => updateRoundRobinConfig("concurrencyPerAccount", e.target.value)}
                    disabled={loading}
                    className="w-20 text-center"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Queue Timeout</p>
                    <p className="text-sm text-text-muted">
                      Max wait time in queue (ms)
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="1000"
                    max="120000"
                    step="1000"
                    value={settings.queueTimeoutMs || 30000}
                    onChange={(e) => updateRoundRobinConfig("queueTimeoutMs", e.target.value)}
                    disabled={loading}
                    className="w-24 text-center"
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-text-muted italic pt-2 border-t border-border/50">
              {settings.fallbackStrategy === "round-robin"
                ? `Distributing requests with semaphore: max ${settings.concurrencyPerAccount || 3} concurrent per account, ${(settings.queueTimeoutMs || 30000) / 1000}s queue timeout.`
                : "Currently using accounts in priority order (Fill First)."}
            </p>
          </div>
        </Card>

        {/* Combo Defaults */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </div>
            <h3 className="text-lg font-semibold">Combo Defaults</h3>
            <span className="text-xs text-text-muted ml-auto">Global combo configuration</span>
          </div>
          <div className="flex flex-col gap-4">
            {/* Default Strategy */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Default Strategy</p>
                <p className="text-xs text-text-muted">Applied to new combos without explicit strategy</p>
              </div>
              <div className="inline-flex p-0.5 rounded-md bg-black/5 dark:bg-white/5">
                {["priority", "weighted", "round-robin"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setComboDefaults(prev => ({ ...prev, strategy: s }))}
                    className={cn(
                      "px-3 py-1 rounded text-xs font-medium transition-all capitalize",
                      comboDefaults.strategy === s
                        ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                        : "text-text-muted hover:text-text-main"
                    )}
                  >
                    {s === "round-robin" ? "Round-Robin" : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Numeric settings */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
              {[
                { key: "maxRetries", label: "Max Retries", min: 0, max: 5 },
                { key: "retryDelayMs", label: "Retry Delay (ms)", min: 500, max: 10000, step: 500 },
                { key: "timeoutMs", label: "Timeout (ms)", min: 5000, max: 300000, step: 5000 },
                { key: "maxComboDepth", label: "Max Nesting Depth", min: 1, max: 10 },
              ].map(({ key, label, min, max, step }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text-muted">{label}</label>
                  <Input
                    type="number"
                    min={min}
                    max={max}
                    step={step || 1}
                    value={comboDefaults[key] ?? ""}
                    onChange={(e) => setComboDefaults(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>

            {/* Round-Robin specific settings */}
            {comboDefaults.strategy === "round-robin" && (
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text-muted">Concurrency / Model</label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={comboDefaults.concurrencyPerModel ?? ""}
                    placeholder="3"
                    onChange={(e) => setComboDefaults(prev => ({ ...prev, concurrencyPerModel: parseInt(e.target.value) || 0 }))}
                    className="text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text-muted">Queue Timeout (ms)</label>
                  <Input
                    type="number"
                    min={1000}
                    max={120000}
                    step={1000}
                    value={comboDefaults.queueTimeoutMs ?? ""}
                    placeholder="30000"
                    onChange={(e) => setComboDefaults(prev => ({ ...prev, queueTimeoutMs: parseInt(e.target.value) || 0 }))}
                    className="text-sm"
                  />
                </div>
              </div>
            )}

            {/* Toggles */}
            <div className="flex flex-col gap-3 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Health Check</p>
                  <p className="text-xs text-text-muted">Pre-check provider availability</p>
                </div>
                <Toggle
                  checked={comboDefaults.healthCheckEnabled !== false}
                  onChange={() => setComboDefaults(prev => ({ ...prev, healthCheckEnabled: !prev.healthCheckEnabled }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Track Metrics</p>
                  <p className="text-xs text-text-muted">Record per-combo request metrics</p>
                </div>
                <Toggle
                  checked={comboDefaults.trackMetrics !== false}
                  onChange={() => setComboDefaults(prev => ({ ...prev, trackMetrics: !prev.trackMetrics }))}
                />
              </div>
            </div>

            {/* Provider Overrides */}
            <div className="pt-3 border-t border-border/50">
              <p className="font-medium text-sm mb-2">Provider Overrides</p>
              <p className="text-xs text-text-muted mb-3">Override timeout and retries per provider. Provider settings override global defaults.</p>

              {Object.entries(providerOverrides).map(([provider, config]) => (
                <div key={provider} className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
                  <span className="text-xs font-mono font-medium min-w-[80px]">{provider}</span>
                  <Input
                    type="number"
                    min="0"
                    max="5"
                    value={config.maxRetries ?? 1}
                    onChange={(e) => setProviderOverrides(prev => ({
                      ...prev,
                      [provider]: { ...prev[provider], maxRetries: parseInt(e.target.value) || 0 }
                    }))}
                    className="text-xs w-16"
                    title="Max Retries"
                  />
                  <span className="text-[10px] text-text-muted">retries</span>
                  <Input
                    type="number"
                    min="5000"
                    max="300000"
                    step="5000"
                    value={config.timeoutMs ?? 120000}
                    onChange={(e) => setProviderOverrides(prev => ({
                      ...prev,
                      [provider]: { ...prev[provider], timeoutMs: parseInt(e.target.value) || 120000 }
                    }))}
                    className="text-xs w-24"
                    title="Timeout (ms)"
                  />
                  <span className="text-[10px] text-text-muted">ms</span>
                  <button
                    onClick={() => removeProviderOverride(provider)}
                    className="ml-auto text-red-400 hover:text-red-500 transition-colors"
                    title="Remove override"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}

              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="text"
                  placeholder="e.g. google, openai..."
                  value={newOverrideProvider}
                  onChange={(e) => setNewOverrideProvider(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addProviderOverride()}
                  className="text-xs flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addProviderOverride}
                  disabled={!newOverrideProvider.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Save button */}
            <div className="pt-3 border-t border-border/50">
              <Button variant="primary" size="sm" onClick={saveComboDefaults} loading={comboDefaultsSaving}>
                Save Combo Defaults
              </Button>
            </div>
          </div>
        </Card>

        {/* Theme Preferences */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <span className="material-symbols-outlined text-[20px]">palette</span>
            </div>
            <h3 className="text-lg font-semibold">Appearance</h3>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Dark Mode</p>
                <p className="text-sm text-text-muted">
                  Switch between light and dark themes
                </p>
              </div>
              <Toggle
                checked={isDark}
                onChange={() => setTheme(isDark ? "light" : "dark")}
              />
            </div>

            {/* Theme Options */}
            <div className="pt-4 border-t border-border">
              <div className="inline-flex p-1 rounded-lg bg-black/5 dark:bg-white/5">
                {["light", "dark", "system"].map((option) => (
                  <button
                    key={option}
                    onClick={() => setTheme(option)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all",
                      theme === option
                        ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                        : "text-text-muted hover:text-text-main"
                    )}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {option === "light" ? "light_mode" : option === "dark" ? "dark_mode" : "contrast"}
                    </span>
                    <span className="capitalize">{option}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Data Management */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
              <span className="material-symbols-outlined text-[20px]">database</span>
            </div>
            <h3 className="text-lg font-semibold">Data</h3>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between p-4 rounded-lg bg-bg border border-border">
              <div>
                <p className="font-medium">Database Location</p>
                <p className="text-sm text-text-muted font-mono">~/.9router/db.json</p>
              </div>
            </div>
          </div>
        </Card>

        {/* App Info */}
        <div className="text-center text-sm text-text-muted py-4">
          <p>{APP_CONFIG.name} v{APP_CONFIG.version}</p>
          <p className="mt-1">Local Mode - All data stored on your machine</p>
        </div>
      </div>
    </div>
  );
}
