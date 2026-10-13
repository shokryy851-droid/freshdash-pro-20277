import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-surface text-brand-600 border border-brand-100 hover:bg-brand-50',
  ghost: 'text-brand-600 hover:bg-brand-50',
  danger: 'bg-danger text-white hover:opacity-90'
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({ variant = 'primary', loading = false, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {loading ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}
