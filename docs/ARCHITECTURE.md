# المعمارية

## الصورة العامة
```
Android (Median APK) / Chrome / Desktop
        │
  SPA: React 19 + Vite 6 + TypeScript (PWA, RTL)
  ├─ features/  catalog · cart · orders · admin · driver · auth · notifications
  ├─ lib/       supabase · errors · idempotency · outbox (IndexedDB) · format
  └─ ui/        Button · Field · States · OfflineBanner
        │  supabase-js (JWT المستخدم + anon key فقط)
Supabase
  ├─ Auth + RLS (مغلق افتراضياً على كل جدول)
  ├─ Postgres: جداول علائقية + دوال RPC ذرّية (منطق الأعمال)
  ├─ Realtime: orders · deliveries · notifications
  └─ Storage: product-images (WebP، 2MB، كتابة للمدراء)
Vercel: استضافة ثابتة + /api/health
```

## المبادئ
1. **أوامر لا حالة:** الواجهة تستدعي `create_order` / `change_order_status` / `record_payment`… ولا ترفع قاعدة البيانات كاملة.
2. **قاعدة البيانات مصدر الحقيقة:** الأسعار والإجماليات والمخزون والصلاحيات تُحسب وتُفرض في Postgres.
3. **منع التكرار:** كل أمر مالي/مخزني يحمل `idempotency_key`؛ إعادة الإرسال تعيد نفس النتيجة.
4. **لا أخطاء صامتة:** `unwrap()` يرمي `AppError` مصنفاً؛ الواجهة تعرض حالة خطأ مع إعادة المحاولة.
5. **Offline مقصود:** الطلب يُحفظ في outbox (IndexedDB) ثم يُرسل؛ عند انقطاع الشبكة يُعاد بنفس المفتاح.

## الأدوار والواجهات
| الدور | الواجهة |
|---|---|
| customer | الكتالوج، السلة، طلباتي |
| sales / manager / admin / super_admin | + الإدارة: لوحة التحكم، لوحة الطلبات، العملاء والمدفوعات، الطلب نيابة عن عميل |
| manager / admin / super_admin | + المنتجات، الصور، المخزون |
| warehouse | لوحة الطلبات (تجهيز/جاهز) |
| driver | توصيلاتي: استلام، تسليم، فشل، تحصيل نقدي |

إخفاء الأزرار في الواجهة للراحة فقط؛ كل صلاحية مفروضة في RLS/RPC.

## قرارات التقنية (ملخص)
- **React + Vite بدل Next.js:** التطبيق تشغيلي خلف تسجيل دخول (لا حاجة لـ SSR/SEO)، ويحتاج PWA offline داخل WebView.
- **منطق الأعمال في Postgres RPC بدل خادم منفصل:** ذرّية حقيقية (transaction واحدة) بدون بنية إضافية.
- **TanStack Query** لبيانات الخادم، **Zustand** للسلة فقط، **Zod** للتحقق.
- **Tailwind 4 + خط IBM Plex Sans Arabic مضمّن** (لا CDN — Google Fonts محجوبة في اليمن).
- **plugin-legacy** لأجهزة Android القديمة داخل Median.
