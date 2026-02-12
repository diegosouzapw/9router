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

    const proxyType = (proxy.type || "http").toLowerCase();
    const host = proxy.host;
    const port = proxy.port;
    const username = proxy.username || "";
    const password = proxy.password || "";

    // Build proxy URL
    let proxyUrl;
    const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";

    if (proxyType === "socks5") {
      proxyUrl = `socks5://${auth}${host}:${port}`;
    } else {
      proxyUrl = `${proxyType}://${auth}${host}:${port}`;
    }

    // Dynamic import of proxy agents
    let agent;
    try {
      if (proxyType === "socks5") {
        const { SocksProxyAgent } = await import("socks-proxy-agent");
        agent = new SocksProxyAgent(proxyUrl);
      } else {
        const { HttpsProxyAgent } = await import("https-proxy-agent");
        agent = new HttpsProxyAgent(proxyUrl);
      }
    } catch (importError) {
      return Response.json({
        success: false,
        error: `Proxy agent not available: ${importError.message}. Install with: npm install https-proxy-agent socks-proxy-agent`,
      });
    }

    // Test connection by fetching public IP
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      // Use node-fetch or native fetch with agent
      const http = await import("node:http");
      const https = await import("node:https");

      const result = await new Promise((resolve, reject) => {
        const url = new URL("https://api.ipify.org?format=json");
        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: "GET",
          agent: agent,
          signal: controller.signal,
        };

        const req = https.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch {
              resolve({ ip: data.trim() });
            }
          });
        });

        req.on("error", (err) => reject(err));
        req.end();
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      return Response.json({
        success: true,
        publicIp: result.ip || null,
        latencyMs,
        proxyUrl: `${proxyType}://${host}:${port}`,
      });
    } catch (fetchError) {
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      return Response.json({
        success: false,
        error: fetchError.name === "AbortError" 
          ? "Connection timeout (10s)" 
          : fetchError.message || "Connection failed",
        latencyMs,
        proxyUrl: `${proxyType}://${host}:${port}`,
      });
    }
  } catch (error) {
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}
