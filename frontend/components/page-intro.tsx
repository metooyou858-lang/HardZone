export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-[24px] border border-black/5 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-[0.32em] text-slate-500">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-[family:var(--font-heading)] text-3xl font-semibold text-slate-950">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{description}</p>
    </section>
  );
}
