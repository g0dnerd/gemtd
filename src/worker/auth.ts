import type { Env } from "./types";

export function checkAuth(
  request: Request,
  url: URL,
  env: Env,
): boolean {
  const secret = env.TELEMETRY_SECRET;
  if (!secret) return false;

  const fromParam = url.searchParams.get("secret");
  if (fromParam === secret) return true;

  const authHeader = request.headers.get("Authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  return false;
}

export function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}
