import type { Env } from "./types";
import { checkAuth, unauthorized } from "./auth";
import { handleIngest } from "./ingest";
import { handleStats } from "./stats";
import { handleExport } from "./export";
import { handleDashboard } from "./dashboard";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/telemetry" && request.method === "POST") {
      return handleIngest(request, env);
    }

    if (url.pathname === "/api/stats") {
      if (!checkAuth(request, url, env)) return unauthorized();
      return handleStats(url, env);
    }

    if (url.pathname === "/api/export") {
      if (!checkAuth(request, url, env)) return unauthorized();
      return handleExport(url, env);
    }

    if (url.pathname === "/stats") {
      if (!checkAuth(request, url, env)) return unauthorized();
      return handleDashboard(env.TELEMETRY_SECRET);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
