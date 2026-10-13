const money = new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 3 });
const dateTime = new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' });

export const formatMoney = (n: number | string): string => `${money.format(Number(n))} ر.ي`;
export const formatQty = (n: number | string): string => qty.format(Number(n));
export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));

/** Display-only estimate; the server's total is always authoritative. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
