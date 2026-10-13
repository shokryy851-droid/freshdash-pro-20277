import { t } from '@/i18n/ar';
import { userMessage } from '@/lib/errors';
import { Button } from './Button';

export function LoadingState({ label = t.loading }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3 p-4">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-[var(--radius-card)] bg-surface" />
      ))}
    </div>
  );
}

/** Errors are shown, never swallowed into an "empty" state. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 rounded-[var(--radius-card)] border border-danger/30 bg-surface p-5 text-center">
      <p className="mb-4 text-danger">{userMessage(error)}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t.retry}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="m-4 rounded-[var(--radius-card)] bg-surface p-8 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {hint ? <p className="mt-1 text-muted">{hint}</p> : null}
    </div>
  );
}
