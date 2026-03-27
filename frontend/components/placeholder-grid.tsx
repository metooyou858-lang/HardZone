export function PlaceholderGrid({
  items,
}: {
  items: Array<{ title: string; text: string; badge: string }>;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.title}
          className="rounded-[24px] border border-black/5 bg-[var(--bg-card-soft)] p-6"
        >
          <div className="inline-flex rounded-full bg-white px-3 py-1 font-[family:var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
            {item.badge}
          </div>
          <h3 className="mt-5 font-[family:var(--font-heading)] text-2xl font-semibold text-slate-950">
            {item.title}
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">{item.text}</p>
        </article>
      ))}
    </section>
  );
}
