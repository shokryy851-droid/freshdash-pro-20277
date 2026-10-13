# الأمان

- **RLS مفعّل على كل الجداول** ومُغلق افتراضياً. لا توجد سياسات INSERT على `orders`, `order_items`, `payments`, `inventory_movements`, `purchases` — الكتابة عبر دوال RPC فقط.
- دوال RPC كلها `SECURITY DEFINER` مع `search_path = ''` وأسماء مؤهلة، وتتحقق من الدور داخلياً.
- `products.stock_on_hand` لا يُكتب إلا من trigger سجل الحركات؛ أي تعديل مباشر يُرفض.
- `audit_logs` و`inventory_movements` غير قابلين للتعديل أو الحذف.
- ترقية الأدوار: trigger يمنع ترقية النفس؛ `super_admin` فقط يمنح `super_admin`. الاستثناء الوحيد: جلسة مالك القاعدة (SQL Editor) لتعيين أول مدير.
- المتصفح يحمل `anon key` فقط. `SUPABASE_SERVICE_ROLE_KEY` في Vercel env للدوال الخادمية فقط، ولا يبدأ بـ `VITE_`.
- رسائل الدخول موحّدة (لا كشف لوجود الحساب). حدود محاولات الدخول من Supabase Auth.
- ترويسات أمان في `vercel.json` (nosniff, DENY framing, referrer policy).

## بعد إنشاء القاعدة
1. شغّل Advisors (Security + Performance) وأصلح كل تحذير.
2. Auth → عطّل التسجيل العام إن كان العملاء يُضافون من الإدارة فقط.
3. أنشئ bucket `product-images` عاماً للقراءة، حد 2MB، أنواع `image/webp,image/jpeg,image/png`، الكتابة للمدراء فقط.
