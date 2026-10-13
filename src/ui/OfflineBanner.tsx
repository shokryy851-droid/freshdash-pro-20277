import { useSyncExternalStore } from 'react';
import { t } from '@/i18n/ar';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="bg-accent-400 px-4 py-2 text-center text-sm font-semibold text-ink">
      {t.offline}
    </div>
  );
}
