# توصيل فرش — FreshDash Pro 2027

تطبيق جملة خضروات وفواكه لصنعاء: React + Vite + TypeScript فوق Supabase (Postgres RPC + RLS)، PWA يعمل بدون إنترنت.

## التشغيل محلياً
```bash
cp .env.example .env.local   # ضع VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## الأوامر
| الأمر | الوظيفة |
|---|---|
| `npm run dev` | خادم التطوير |
| `npm run typecheck` | فحص الأنواع |
| `npm test` | اختبارات الوحدة |
| `npm run build` | بناء الإنتاج (يولّد الأيقونات تلقائياً) |
| `npm run db:types` | توليد أنواع قاعدة البيانات من Supabase |

## البنية
- `src/features/*` — وحدة لكل مجال (auth, catalog, cart, orders, notifications)
- `src/lib` — supabase, errors, idempotency, outbox, format
- `supabase/migrations` — مخطط قاعدة البيانات (المصدر الوحيد للحقيقة)
- `supabase/tests` — اختبارات القاعدة (ذاتية التراجع)
- `api/health.ts` — `/api/health`
- `scripts/write-icons.mjs` — توليد أيقونات PWA وقت البناء
- `docs/` — الأمان، النشر، البيئة، الاختبار، النسخ الاحتياطي

## القواعد الثابتة
1. المتصفح يرسل **أوامر** (`create_order`) لا **حالة**. لا مزامنة كاملة.
2. كل أمر مالي/مخزني يحمل `idempotency_key` يُولَّد مرة واحدة لكل ضغطة.
3. الأسعار والإجماليات والمخزون تُحسب في قاعدة البيانات فقط.
4. خطأ قاعدة البيانات لا يتحول أبداً إلى "لا توجد بيانات".
5. لا وحدة محاسبة.
