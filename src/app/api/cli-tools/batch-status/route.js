"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  CLI_TOOL_IDS,
  getCliRuntimeStatus,
  getCliPrimaryConfigPath,
} from "@/shared/services/cliRuntime";

// Lightweight config-detection for each tool
async function getToolConfigStatus(toolId, runtime) {
  const home = os.homedir();
  try {
    switch (toolId) {
      case "claude": {
        if (!runtime.installed || !runtime.runnable) return "not_ready";
        const settingsPath = getCliPrimaryConfigPath("claude");
        try {
          const content = await fs.readFile(settingsPath, "utf-8");
          const settings = JSON.parse(content);
          const baseUrl = settings?.env?.ANTHROPIC_BASE_URL;
          if (!baseUrl) return "not_configured";
          if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) return "configured";
          return "other";
        } catch { return "not_configured"; }
      }
      case "codex": {
        if (!runtime.installed || !runtime.runnable) return "not_ready";
        const configPath = path.join(home, ".codex", "config.toml");
        try {
          const content = await fs.readFile(configPath, "utf-8");
          if (content.includes("localhost") || content.includes("127.0.0.1") || content.includes("9router")) return "configured";
          return "other";
        } catch { return "not_configured"; }
      }
      case "droid": {
        if (!runtime.installed || !runtime.runnable) return "not_ready";
        const configPath = getCliPrimaryConfigPath("droid");
        try {
          const content = await fs.readFile(configPath, "utf-8");
          const config = JSON.parse(content);
          const providers = config?.mcpServers || config?.providers || {};
          const has9Router = JSON.stringify(providers).includes("localhost") || JSON.stringify(providers).includes("127.0.0.1");
          return has9Router ? "configured" : "not_configured";
        } catch { return "not_configured"; }
      }
      case "openclaw": {
        if (!runtime.installed || !runtime.runnable) return "not_ready";
        const configPath = getCliPrimaryConfigPath("openclaw");
        try {
          const content = await fs.readFile(configPath, "utf-8");
          const config = JSON.parse(content);
          const has9Router = JSON.stringify(config).includes("localhost") || JSON.stringify(config).includes("127.0.0.1");
          return has9Router ? "configured" : "not_configured";
        } catch { return "not_configured"; }
      }
      case "cline": {
        if (!runtime.installed || !runtime.runnable) return "not_ready";
        const configPath = getCliPrimaryConfigPath("cline");
        try {
          const content = await fs.readFile(configPath, "utf-8");
          const config = JSON.parse(content);
          const has9Router = JSON.stringify(config).includes("localhost") || JSON.stringify(config).includes("127.0.0.1");
          return has9Router ? "configured" : "not_configured";
        } catch { return "not_configured"; }
      }
      case "kilo": {
        if (!runtime.installed || !runtime.runnable) return "not_ready";
        const authPath = path.join(home, ".local", "share", "kilo", "auth.json");
        try {
          const content = await fs.readFile(authPath, "utf-8");
          const parsed = JSON.parse(content);
          const has9Router = JSON.stringify(parsed).includes("localhost") || JSON.stringify(parsed).includes("127.0.0.1") || JSON.stringify(parsed).includes("9router");
          return has9Router ? "configured" : "not_configured";
        } catch { return "not_configured"; }
      }
      case "antigravity": {
        // MITM status — check if process is running
        try {
          const res = await fetch("http://localhost:20128/api/cli-tools/antigravity-mitm", { signal: AbortSignal.timeout(2000) });
          if (res.ok) {
            const data = await res.json();
            return data.running ? "active" : "inactive";
          }
        } catch { /* ignore */ }
        return "inactive";
      }
      // Guide-based tools
      case "cursor":
      case "continue":
        return "guide";
      default:
        return "unknown";
    }
  } catch {
    return "error";
  }
}

// GET /api/cli-tools/batch-status — lightweight status for all tools
export async function GET() {
  try {
    const statuses = {};

    // Check all tools in parallel
    const results = await Promise.allSettled(
      CLI_TOOL_IDS.map(async (toolId) => {
        const runtime = await getCliRuntimeStatus(toolId);
        const configStatus = await getToolConfigStatus(toolId, runtime);
        return {
          toolId,
          installed: runtime.installed,
          runnable: runtime.runnable,
          reason: runtime.reason,
          configStatus,
        };
      })
    );

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        const { toolId, ...data } = result.value;
        statuses[toolId] = data;
      }
    });

    return NextResponse.json({ statuses });
  } catch (error) {
    console.log("Error checking batch status:", error.message);
    return NextResponse.json(
      { error: "Failed to check batch status" },
      { status: 500 }
    );
  }
}
