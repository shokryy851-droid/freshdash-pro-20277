import type { OrderStatus, PaymentMethod } from '@/types/database';

export const ORDER_STATUS_AR: Record<OrderStatus, string> = {
  pending: 'جديد',
  confirmed: 'مؤكد',
  preparing: 'قيد التجهيز',
  ready: 'جاهز',
  out_for_delivery: 'في الطريق',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  failed: 'فشل التسليم'
};

export const PAYMENT_METHOD_AR: Record<PaymentMethod, string> = {
  cash: 'كاش عند الاستلام',
  credit: 'آجل',
  ewallet: 'محفظة إلكترونية',
  bank_transfer: 'تحويل بنكي'
};

export const t = {
  appName: 'توصيل فرش',
  tagline: 'خضروات وفواكه طازجة • بيع بالجملة فقط',
  nav: { home: 'الرئيسية', cart: 'السلة', orders: 'طلباتي', account: 'حسابي' },
  search: 'ابحث عن منتج… (طماطم، تفاح…)',
  all: 'الكل',
  addToCart: 'أضف للسلة',
  emptyCart: 'السلة فارغة',
  checkout: 'إرسال الطلب',
  estimatedTotal: 'الإجمالي التقديري',
  serverPriceNote: 'السعر النهائي يُحسب عند تأكيد الطلب',
  login: 'تسجيل الدخول',
  logout: 'تسجيل الخروج',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  retry: 'إعادة المحاولة',
  loading: 'جارٍ التحميل…',
  pendingSync: 'بانتظار الإرسال',
  offline: 'لا يوجد اتصال — يمكنك متابعة التصفح وسيُرسل طلبك تلقائياً'
} as const;
