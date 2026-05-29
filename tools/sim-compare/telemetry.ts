// Telemetry transport for headless sim runs. Posts collector payloads to the
// configured ingest endpoint (local server by default, or a remote URL).
// Used by both the parallel worker (worker.ts) and the sequential runner.

export interface TelemetryConfig {
  url: string;
  version: string;
}

const MAX_ATTEMPTS = 4;

export function makeTransport(
  url: string,
): (payload: Record<string, unknown>) => Promise<void> {
  return async (payload) => {
    const body = JSON.stringify(payload);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (res.ok) return;
        // 4xx won't be fixed by retrying (bad payload) — give up.
        if (res.status < 500) {
          console.error(`Telemetry POST rejected: HTTP ${res.status}`);
          return;
        }
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (err) {
        // Transient failure — e.g. ECONNRESET from a stale keep-alive socket
        // reused between games, or a brief stall under concurrent load. The
        // retry opens a fresh connection.
        lastErr = err;
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
      }
    }
    // A telemetry failure must never abort the sim batch — log and move on.
    const cause = lastErr instanceof Error && lastErr.cause ? ` (cause: ${lastErr.cause})` : '';
    console.error(`Telemetry POST failed after ${MAX_ATTEMPTS} attempts: ${lastErr}${cause}`);
  };
}
