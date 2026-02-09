import { getProxyConfig, setProxyConfig } from "@/lib/localDb";

/**
 * GET /api/settings/proxy — get proxy configuration
 */
export async function GET() {
  try {
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
 * Body: { global?: string, providers?: { providerId: string } }
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
