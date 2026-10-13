// GET /api/health — liveness, Supabase reachability and configuration diagnostics.
// Reports only WHICH variables exist (booleans) and the public project ref — never any value or key.
const URL_NAMES = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
const KEY_NAMES = [
  'VITE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY'
];
const OTHER_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'POSTGRES_URL', 'DATABASE_URL'];

const first = (names: string[]): string | undefined => names.map((n) => process.env[n]).find(Boolean);

export async function GET(): Promise<Response> {
  const url = first(URL_NAMES);
  const key = first(KEY_NAMES);
  const started = Date.now();
  let supabase: 'ok' | 'down' | 'unconfigured' = 'unconfigured';
  if (url && key) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: AbortSignal.timeout(3000) });
      supabase = res.ok ? 'ok' : 'down';
    } catch {
      supabase = 'down';
    }
  }
  const present = Object.fromEntries([...URL_NAMES, ...KEY_NAMES, ...OTHER_NAMES].map((n) => [n, Boolean(process.env[n])]));
  const projectRef = url ? new globalThis.URL(url).hostname.split('.')[0] : null;
  const body = { status: supabase === 'ok' ? 'ok' : 'degraded', supabase, projectRef, env: present, latencyMs: Date.now() - started };
  return Response.json(body, { status: supabase === 'down' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
