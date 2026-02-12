import { getProxyConfig, setProxyConfig, getProxyForLevel, deleteProxyForLevel, resolveProxyForConnection } from "@/lib/localDb";

/**
 * GET /api/settings/proxy — get proxy configuration
 * Optional query params: ?level=global|provider|combo|key&id=xxx
 * Or: ?resolve=connectionId to resolve effective proxy
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level");
    const id = searchParams.get("id");
    const resolveId = searchParams.get("resolve");

    // Resolve effective proxy for a connection
    if (resolveId) {
      const result = await resolveProxyForConnection(resolveId);
      return Response.json(result);
    }

    // Get proxy for a specific level
    if (level) {
      const proxy = await getProxyForLevel(level, id);
      return Response.json({ level, id, proxy });
    }

    // Get full config
    const config = await getProxyConfig();
    return Response.json(config);
  } catch (error) {
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/proxy — update proxy configuration
 * Body: { level, id?, proxy } or legacy { global?, providers? }
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const updated = await setProxyConfig(body);
    return Response.json(updated);
  } catch (error) {
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/proxy — remove proxy at a level
 * Query: ?level=provider&id=xxx
 */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level");
    const id = searchParams.get("id");

    if (!level) {
      return Response.json(
        { error: { message: "level is required", type: "invalid_request" } },
        { status: 400 }
      );
    }

    const updated = await deleteProxyForLevel(level, id);
    return Response.json(updated);
  } catch (error) {
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}
