export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold text-brand-600">توصيل فرش</h1>
      <p className="rounded-2xl bg-surface p-5">
        التطبيق قيد الإعداد. متغيرات البيئة التالية غير مضبوطة في Vercel:
      </p>
      <ul dir="ltr" className="rounded-2xl bg-surface p-4 font-mono text-sm">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </main>
  );
}
