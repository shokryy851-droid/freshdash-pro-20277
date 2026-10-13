// GET /api/health — liveness + Supabase reachability (no secrets, no data)
export async function GET(): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL;
  const started = Date.now();
  let supabase: 'ok' | 'down' | 'unconfigured' = 'unconfigured';
  if (url) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY ?? '' },
        signal: AbortSignal.timeout(3000)
      });
      supabase = res.ok ? 'ok' : 'down';
    } catch {
      supabase = 'down';
    }
  }
  const body = { status: supabase === 'ok' ? 'ok' : 'degraded', supabase, latencyMs: Date.now() - started };
  return Response.json(body, { status: supabase === 'down' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
