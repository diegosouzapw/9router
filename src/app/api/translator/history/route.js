import { NextResponse } from "next/server";

/**
 * GET /api/translator/history
 * Returns recent translation events for the Live Monitor.
 * 
 * For now, returns an empty array. To enable live monitoring,
 * translation events need to be logged from the chat pipeline
 * (chatCore.js) into a ring buffer or SQLite table.
 */

// In-memory ring buffer for translation events (max 200)
const MAX_EVENTS = 200;

// Global buffer (persists across requests in the same process)
if (!globalThis.__translatorEvents) {
  globalThis.__translatorEvents = [];
}

export function logTranslationEvent(event) {
  const events = globalThis.__translatorEvents;
  events.unshift({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...event,
  });
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), MAX_EVENTS);

    const events = (globalThis.__translatorEvents || []).slice(0, limit);

    return NextResponse.json({ success: true, events, total: globalThis.__translatorEvents?.length || 0 });
  } catch (error) {
    console.error("Error fetching history:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
