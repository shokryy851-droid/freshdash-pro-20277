/**
 * Structured application errors. A failed request is NEVER turned into empty data.
 */
export type AppErrorCode =
  | 'network'
  | 'not_authenticated'
  | 'forbidden'
  | 'not_found'
  | 'insufficient_stock'
  | 'product_unavailable'
  | 'invalid_input'
  | 'invalid_transition'
  | 'conflict'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly original?: unknown;
  constructor(code: AppErrorCode, message: string, original?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.original = original;
  }
  /** Safe to retry automatically (only transport-level failures). */
  get retryable(): boolean {
    return this.code === 'network';
  }
}

const MESSAGES_AR: Record<AppErrorCode, string> = {
  network: 'تعذّر الاتصال بالخادم. سيُعاد الإرسال تلقائياً عند عودة الشبكة.',
  not_authenticated: 'انتهت الجلسة، يرجى تسجيل الدخول.',
  forbidden: 'ليست لديك صلاحية لهذا الإجراء.',
  not_found: 'العنصر غير موجود.',
  insufficient_stock: 'الكمية المطلوبة غير متوفرة في المخزون.',
  product_unavailable: 'أحد المنتجات لم يعد متاحاً.',
  invalid_input: 'البيانات المدخلة غير صحيحة.',
  invalid_transition: 'لا يمكن نقل الطلب إلى هذه الحالة.',
  conflict: 'تم تعديل البيانات من مستخدم آخر، حدّث الصفحة.',
  unknown: 'حدث خطأ غير متوقع.'
};

export function userMessage(err: unknown): string {
  return err instanceof AppError ? MESSAGES_AR[err.code] : MESSAGES_AR.unknown;
}

interface PgLikeError {
  code?: string;
  message?: string;
}

/** Map a Supabase/PostgREST/Postgres error (or fetch failure) to an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof TypeError) return new AppError('network', err.message, err); // fetch failed
  const e = (err ?? {}) as PgLikeError;
  const msg = e.message ?? String(err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return new AppError('network', msg, err);
  if (msg.includes('insufficient_stock')) return new AppError('insufficient_stock', msg, err);
  if (msg.includes('product_unavailable')) return new AppError('product_unavailable', msg, err);
  if (msg.includes('invalid_transition')) return new AppError('invalid_transition', msg, err);
  switch (e.code) {
    case '28000':
    case 'PGRST301':
      return new AppError('not_authenticated', msg, err);
    case '42501':
      return new AppError('forbidden', msg, err);
    case 'P0002':
    case 'PGRST116':
      return new AppError('not_found', msg, err);
    case '22023':
    case '22P02':
    case '23514':
      return new AppError('invalid_input', msg, err);
    case '23505':
      return new AppError('conflict', msg, err);
    default:
      return new AppError('unknown', msg, err);
  }
}

/** Unwrap a supabase-js `{ data, error }` result, throwing a typed error. */
export function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw toAppError(result.error);
  if (result.data === null) throw new AppError('not_found', 'empty result');
  return result.data;
}
