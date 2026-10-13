import { supabase } from '@/lib/supabase';
import { t } from '@/i18n/ar';
import { Button } from '@/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';

const ROLE_AR: Record<string, string> = {
  super_admin: 'المدير العام', admin: 'مدير', manager: 'مشرف', sales: 'مبيعات',
  warehouse: 'مستودع', driver: 'سائق', viewer: 'مشاهد', customer: 'عميل'
};

export function AccountPage() {
  const { profile } = useAuth();
  const toggleTheme = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('fdp-theme', next);
  };
  return (
    <section className="flex flex-col gap-3 p-4">
      <div className="rounded-2xl bg-surface p-5">
        <p className="text-lg font-bold">{profile?.full_name || '—'}</p>
        <p className="text-muted">{profile ? ROLE_AR[profile.role] : ''}</p>
      </div>
      <Button variant="secondary" onClick={toggleTheme}>الوضع الليلي / النهاري</Button>
      <Button variant="danger" onClick={() => void supabase.auth.signOut()}>{t.logout}</Button>
    </section>
  );
}
