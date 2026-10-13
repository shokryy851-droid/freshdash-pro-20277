import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { t } from '@/i18n/ar';
import { Button } from '@/ui/Button';
import { useAuth } from './AuthProvider';

const schema = z.object({ email: z.string().email(), password: z.string().min(8) });

export function LoginPage() {
  const { session } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) {
    const to = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={to} replace />;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = schema.safeParse({ email: form.get('email'), password: form.get('password') });
    if (!parsed.success) {
      setError('تحقق من البريد وكلمة المرور (8 أحرف على الأقل).');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    // Same message for wrong email or password — no account enumeration
    if (authError) setError('بيانات الدخول غير صحيحة أو تعذّر الاتصال.');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-center text-2xl font-bold text-brand-600">{t.appName}</h1>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-6 shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t.email}</span>
          <input name="email" type="email" autoComplete="email" dir="ltr" required
            className="min-h-12 rounded-xl border border-brand-100 bg-canvas px-4" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t.password}</span>
          <input name="password" type="password" autoComplete="current-password" dir="ltr" required minLength={8}
            className="min-h-12 rounded-xl border border-brand-100 bg-canvas px-4" />
        </label>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" loading={busy}>{t.login}</Button>
      </form>
    </main>
  );
}
