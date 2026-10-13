# متغيرات البيئة

| المتغير | أين | سري؟ | الوصف |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Vercel + محلي | لا | `https://ahzvrhkepzujjaakubha.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Vercel + محلي | لا (محمي بـ RLS) | Project Settings → API Keys (المفتاح العام anon/publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel فقط | **نعم** | للدوال الخادمية المستقبلية (دعوة المستخدمين). لا يوضع في الواجهة أبداً |

إن كانت المتغيرات مفقودة يعرض التطبيق شاشة توضح الناقص بدل التعطل (`src/lib/env.ts`). متغيرات `VITE_*` تُضمَّن وقت البناء، لذلك يلزم Redeploy بعد تغييرها.
