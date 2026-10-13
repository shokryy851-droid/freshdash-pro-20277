# قاعدة البيانات

المصدر: `supabase/migrations/` (تُنفّذ بالترتيب، ولا تُعدَّل بعد تنفيذها — أي تغيير = migration جديدة).

| Migration | المحتوى |
|---|---|
| `0001_core_schema` | 19 جدولاً، enums، triggers (updated_at، حماية الأدوار، سجل المخزون)، view أرصدة العملاء |
| `0002_rpc_and_rls` | دوال الأعمال + RLS على كل الجداول + Realtime |
| `0003_dashboard_storage` | `dashboard_summary()` + bucket الصور وسياساته |

## الجداول الرئيسية
- `profiles` (1:1 مع auth.users، فيه الدور) · `customers` · `suppliers`
- `categories` · `units` · `products` (`stock_on_hand` يُحدَّث من السجل فقط)
- `orders` · `order_items` (لقطة الاسم/الوحدة/السعر) · `order_status_history` · `deliveries`
- `inventory_movements` (سجل موقّع غير قابل للتعديل/الحذف، فهرس فريد يمنع المعالجة المزدوجة)
- `payments` · `supplier_payments` · `purchases` · `purchase_items` · `expenses`
- `notifications` (dedupe_key) · `audit_logs` (غير قابل للتعديل) · `settings`
- View: `customer_balances` = المفوتر − المدفوع (تشغيلي، ليس محاسبة)

## دوال الأعمال (RPC)
| الدالة | من يستطيع | ما تضمنه |
|---|---|---|
| `create_order` | العميل لنفسه، المبيعات فما فوق | تسعير من الخادم، قفل المنتجات بترتيب ثابت، منع البيع فوق المخزون، idempotency، تدقيق، إشعار |
| `change_order_status` | حسب الدور والانتقال | آلة حالات صارمة، إرجاع المخزون عند الإلغاء مرة واحدة |
| `assign_delivery` | المبيعات فما فوق | السائق يجب أن يكون نشطاً بدور driver |
| `record_payment` | المبيعات، السائق | idempotency، تطابق الطلب مع العميل |
| `adjust_stock` | المستودع، المدراء | سبب إلزامي، التالف سالب دائماً |
| `create_purchase` | المستودع، المدراء | إدخال مخزون ذرّي |
| `dashboard_summary` | المكتب | مؤشرات اليوم + الأكثر مبيعاً + أفضل العملاء |

## آلة حالات الطلب
`pending → confirmed → preparing → ready → out_for_delivery → delivered`
الإلغاء ممكن قبل الخروج للتوصيل؛ `failed` بعد الخروج فقط.
