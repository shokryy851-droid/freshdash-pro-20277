# خطة ترحيل بيانات النظام القديم

> لا يُنفَّذ أي ترحيل إلا بموافقة صريحة. النظام القديم (`evmhwiglhttogoccufjh`) يُقرأ فقط ولا يُعدَّل.

المسار: **قراءة → تحويل → تحقق (تقرير فروقات) → استيراد للمشروع الجديد**.

| القديم | الجديد | ملاحظات |
|---|---|---|
| `fdp_products` (53) | `categories` + `units` + `products` | `cat` نصي → FK؛ الصور base64 → Storage WebP؛ `stock` → حركة `adjustment` افتتاحية |
| `fdp_users` (3) | `auth.users` + `profiles` | كلمات المرور **لا تُرحَّل** (تجزئة ضعيفة) → دعوة وتعيين كلمة جديدة |
| الأدوار `super/admin/editor/client` | `super_admin/admin/manager/customer` | editor → manager (يُؤكَّد) |
| `fdp_orders` + items | `customers` + `orders` + `order_items` | العميل يُستخرج من الاسم/الهاتف |
| `جديد` / `مجدول` / `منجز` / `ملغي` | `pending` / `pending + scheduled_for` / `delivered` / `cancelled` | |
| `محصّل` | `delivered` + سجل `payments` | |
| `آجل` | `payment_method = credit` | |
| `fdp_suppliers` (2) | `suppliers` | الأرصدة المكتوبة يدوياً → ملاحظة افتتاحية |
| `fdp_notifications` | لا تُرحَّل | بيانات مؤقتة |
| `fdp_audit_log` | أرشيف JSON | |
