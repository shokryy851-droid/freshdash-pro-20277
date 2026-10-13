import { z } from 'zod';

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20)
});

const parsed = schema.safeParse(import.meta.env);

/** Names of missing/invalid variables; empty when configuration is valid. */
export const configErrors: string[] = parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'));

/**
 * Validated environment. Only modules loaded AFTER main.tsx has checked `configErrors`
 * may read it, so an unconfigured deployment shows a clear screen instead of crashing.
 */
export const env = (parsed.success ? parsed.data : {}) as z.infer<typeof schema>;
