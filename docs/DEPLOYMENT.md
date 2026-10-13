# النشر

| المورد | القيمة |
|---|---|
| GitHub | `shokryy851-droid/freshdash-pro-20277` |
| Supabase | `ahzvrhkepzujjaakubha` (منظمة `seomczgrajbnwmeqkfus`) |
| Vercel | `freshdash-pro/freshdash-pro-20277` — مربوط بالمستودع أعلاه فقط |

⚠️ المشاريع المحمية التي لا تُلمس: Supabase `evmhwiglhttogoccufjh`, `vjcmnfrpxldubixmjhbw`، ومستودع وVercel النظام القديم.

## الترتيب
1. Supabase: نفّذ `supabase/migrations/*` بالترتيب، ثم `supabase/tests/01_verify_tests.sql` (يجب أن يظهر `FAILED: 0`).
2. عيّن أول مدير من SQL Editor: `update public.profiles set role = 'super_admin' where id = '<uuid>';`
3. Vercel: أضف متغيرات البيئة (ENVIRONMENT.md) لـ Production و Preview، ثم Redeploy.
4. تحقق: `https://<domain>/api/health` يعيد `"supabase":"ok"`.
5. Median.co: وجّه التطبيق للدومين الجديد واختبر على جهاز Android قديم.

## التراجع
Vercel → Deployments → Promote أي نشر سابق. تغييرات القاعدة تُعالج بـ migration جديدة، لا بتعديل migration منفّذة.
