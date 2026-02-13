import { ProxyAgent, request as undiciRequest } from "undici";

const SUPPORTED_PROXY_TYPES = new Set(["http", "https"]);

/**
 * POST /api/settings/proxy/test — test proxy connectivity
 * Body: { proxy: { type, host, port, username?, password? } }
 * Returns: { success, publicIp?, latencyMs?, error? }
 */
export async function POST(request) {
  try {
    const { proxy } = await request.json();

    if (!proxy || !proxy.host || !proxy.port) {
      return Response.json(
        { error: { message: "proxy.host and proxy.port are required", type: "invalid_request" } },
        { status: 400 }
      );
    }

    const proxyType = String(proxy.type || "http").toLowerCase();
    if (proxyType.startsWith("socks")) {
      return Response.json(
        {
          error: {
            message: "SOCKS/SOCKS5 proxy is not supported in outbound runtime; use HTTP or HTTPS",
            type: "invalid_request",
          },
        },
        { status: 400 }
      );
    }
    if (!SUPPORTED_PROXY_TYPES.has(proxyType)) {
      return Response.json(
        {
          error: {
            message: "proxy.type must be http or https",
            type: "invalid_request",
          },
        },
        { status: 400 }
      );
    }

    const auth = proxy.username
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password || "")}@`
      : "";
    const proxyUrl = `${proxyType}://${auth}${proxy.host}:${proxy.port}`;

    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const dispatcher = new ProxyAgent(proxyUrl);

    try {
      const result = await undiciRequest("https://api.ipify.org?format=json", {
        method: "GET",
        dispatcher,
        signal: controller.signal,
        headersTimeout: 10000,
        bodyTimeout: 10000,
      });

      const rawBody = await result.body.text();
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = { ip: rawBody.trim() };
      }

      return Response.json({
        success: true,
        publicIp: parsed.ip || null,
        latencyMs: Date.now() - startTime,
        proxyUrl: `${proxyType}://${proxy.host}:${proxy.port}`,
      });
    } catch (fetchError) {
      return Response.json({
        success: false,
        error:
          fetchError.name === "AbortError"
            ? "Connection timeout (10s)"
            : fetchError.message || "Connection failed",
        latencyMs: Date.now() - startTime,
        proxyUrl: `${proxyType}://${proxy.host}:${proxy.port}`,
      });
    } finally {
      clearTimeout(timeout);
      await dispatcher.close().catch(() => {});
    }
  } catch (error) {
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}
