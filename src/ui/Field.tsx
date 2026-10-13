import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const CONTROL = 'min-h-12 w-full rounded-xl border border-brand-100 bg-canvas px-4 text-ink';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-card)] bg-surface p-4 shadow-sm ${className}`}>{children}</div>;
}

export function InlineError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm font-semibold text-danger">
      {message}
    </p>
  ) : null;
}
