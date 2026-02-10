"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  ensureCliConfigWriteAllowed,
  getCliRuntimeStatus,
} from "@/shared/services/cliRuntime";
import { createBackup } from "@/shared/services/backupService";

const KILO_DATA_DIR = path.join(os.homedir(), ".local", "share", "kilo");
const AUTH_PATH = path.join(KILO_DATA_DIR, "auth.json");
const KILO_CONFIG_DIR = path.join(os.homedir(), ".config", "kilo");

// Read auth.json
const readAuth = async () => {
  try {
    const content = await fs.readFile(AUTH_PATH, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// Check if 9Router OpenAI-compatible provider is configured
const has9RouterConfig = (auth) => {
  if (!auth) return false;
  const routerEntry = auth["openai-compatible"] || auth["9router"];
  if (!routerEntry) return false;
  const baseUrl = routerEntry.baseUrl || routerEntry.baseURL || "";
  return baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") || baseUrl.includes("9router");
};

// GET - Check kilo CLI and read current settings
export async function GET() {
  try {
    const runtime = await getCliRuntimeStatus("kilo");

    if (!runtime.installed || !runtime.runnable) {
      return NextResponse.json({
        installed: runtime.installed,
        runnable: runtime.runnable,
        command: runtime.command,
        commandPath: runtime.commandPath,
        runtimeMode: runtime.runtimeMode,
        reason: runtime.reason,
        settings: null,
        message: runtime.installed && !runtime.runnable
          ? "Kilo Code CLI is installed but not runnable"
          : "Kilo Code CLI is not installed",
      });
    }

    const auth = await readAuth();

    // Read kilo VS Code extension settings if available
    let extensionSettings = null;
    try {
      const vscodeSettingsPath = path.join(os.homedir(), ".config", "Code", "User", "settings.json");
      const raw = await fs.readFile(vscodeSettingsPath, "utf-8");
      const allSettings = JSON.parse(raw);
      // Extract kilo-related settings  
      extensionSettings = {};
      for (const [key, value] of Object.entries(allSettings)) {
        if (key.startsWith("kilocode.") || key.startsWith("kilo-code.") || key.startsWith("kilo.")) {
          extensionSettings[key] = value;
        }
      }
    } catch { /* VS Code settings not available */ }

    return NextResponse.json({
      installed: runtime.installed,
      runnable: runtime.runnable,
      command: runtime.command,
      commandPath: runtime.commandPath,
      runtimeMode: runtime.runtimeMode,
      reason: runtime.reason,
      settings: {
        auth: auth ? Object.keys(auth) : [],
        extensionSettings,
      },
      has9Router: has9RouterConfig(auth),
      authPath: AUTH_PATH,
    });
  } catch (error) {
    console.log("Error checking kilo settings:", error);
    return NextResponse.json({ error: "Failed to check kilo settings" }, { status: 500 });
  }
}

// POST - Configure Kilo Code to use 9Router as OpenAI-compatible provider
export async function POST(request) {
  try {
    const writeGuard = ensureCliConfigWriteAllowed();
    if (writeGuard) {
      return NextResponse.json({ error: writeGuard }, { status: 403 });
    }

    const { baseUrl, apiKey, model } = await request.json();

    if (!baseUrl || !model) {
      return NextResponse.json({ error: "baseUrl and model are required" }, { status: 400 });
    }

    // Ensure directories exist
    await fs.mkdir(KILO_DATA_DIR, { recursive: true });

    // Backup auth before modifying
    await createBackup("kilo", AUTH_PATH);

    // Read existing auth
    let auth = {};
    try {
      const existing = await fs.readFile(AUTH_PATH, "utf-8");
      auth = JSON.parse(existing);
    } catch { /* No existing auth */ }

    // Normalize baseUrl
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;

    // Add/update 9Router as openai-compatible provider
    auth["openai-compatible"] = {
      type: "api-key",
      apiKey: apiKey || "sk_9router",
      baseUrl: normalizedBaseUrl,
      model: model,
    };

    await fs.writeFile(AUTH_PATH, JSON.stringify(auth, null, 2));

    // Also try to update VS Code extension settings if available
    try {
      const vscodeSettingsPath = path.join(os.homedir(), ".config", "Code", "User", "settings.json");
      let vscodeSettings = {};
      try {
        const raw = await fs.readFile(vscodeSettingsPath, "utf-8");
        vscodeSettings = JSON.parse(raw);
      } catch { /* no existing settings */ }

      // Set custom provider config for the extension
      vscodeSettings["kilocode.customProvider"] = {
        name: "9Router",
        baseURL: normalizedBaseUrl,
        apiKey: apiKey || "sk_9router",
      };
      vscodeSettings["kilocode.defaultModel"] = model;

      await fs.writeFile(vscodeSettingsPath, JSON.stringify(vscodeSettings, null, 2));
    } catch {
      // VS Code settings not writable — not a problem for CLI
    }

    return NextResponse.json({
      success: true,
      message: "Kilo Code settings applied successfully!",
      authPath: AUTH_PATH,
    });
  } catch (error) {
    console.log("Error updating kilo settings:", error);
    return NextResponse.json({ error: "Failed to update kilo settings" }, { status: 500 });
  }
}

// DELETE - Remove 9Router config from Kilo
export async function DELETE() {
  try {
    const writeGuard = ensureCliConfigWriteAllowed();
    if (writeGuard) {
      return NextResponse.json({ error: writeGuard }, { status: 403 });
    }

    // Backup before reset
    await createBackup("kilo", AUTH_PATH);

    // Read existing auth
    let auth = {};
    try {
      const existing = await fs.readFile(AUTH_PATH, "utf-8");
      auth = JSON.parse(existing);
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No settings file to reset" });
      }
      throw error;
    }

    // Remove 9Router provider
    delete auth["openai-compatible"];
    delete auth["9router"];

    await fs.writeFile(AUTH_PATH, JSON.stringify(auth, null, 2));

    // Also clean up VS Code extension settings
    try {
      const vscodeSettingsPath = path.join(os.homedir(), ".config", "Code", "User", "settings.json");
      const raw = await fs.readFile(vscodeSettingsPath, "utf-8");
      const vscodeSettings = JSON.parse(raw);
      delete vscodeSettings["kilocode.customProvider"];
      delete vscodeSettings["kilocode.defaultModel"];
      await fs.writeFile(vscodeSettingsPath, JSON.stringify(vscodeSettings, null, 2));
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      message: "9Router settings removed from Kilo Code",
    });
  } catch (error) {
    console.log("Error resetting kilo settings:", error);
    return NextResponse.json({ error: "Failed to reset kilo settings" }, { status: 500 });
  }
}
