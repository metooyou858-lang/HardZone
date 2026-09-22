"use client";

import { useEffect, useState } from "react";
import { fetchClients, type ClientListItem } from "@/lib/api/clients";
import { getClientName } from "@/components/sales/sales-shared";

export function ServiceRecipientPicker({ name, inheritedName, disabled, onChange }: {
  name?: string | null;
  inheritedName?: string | null;
  disabled: boolean;
  onChange: (clientId: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || disabled) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchClients({ search: search.trim() || undefined, limit: 20 });
        if (!cancelled) setClients(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Не удалось найти клиентов");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, search, disabled]);

  async function choose(clientId: string | null) {
    if (disabled || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onChange(clientId);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить получателя");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-2">
    <button type="button" disabled={disabled || saving} onClick={() => setOpen(!open)}
      aria-expanded={open && !disabled}
      className="min-h-11 text-left text-xs text-[var(--accent)] disabled:opacity-50">
      Получатель: {name || inheritedName || "Выбрать клиента"}
    </button>
    {open && !disabled && <div className="rounded-xl border border-[var(--line-soft)] p-2">
      <input autoFocus aria-label="Поиск получателя услуги" placeholder="Имя или телефон" value={search}
        onChange={(event) => setSearch(event.target.value)} disabled={saving}
        className="min-h-11 w-full rounded-lg bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)]" />
      <div className="max-h-48 overflow-y-auto">
        {inheritedName && <button type="button" disabled={saving} onClick={() => void choose(null)}
          className="min-h-11 w-full px-2 text-left text-xs text-[var(--accent)]">Клиент чека: {inheritedName}</button>}
        {loading ? <p className="p-2 text-xs text-[var(--text-muted)]">Загружаем…</p> : clients.map((client) =>
          <button key={client.id} type="button" disabled={saving} onClick={() => void choose(client.id)}
            className="min-h-11 w-full rounded-lg px-2 text-left text-sm text-[var(--text-main)] hover:bg-[var(--bg-panel)] disabled:opacity-50">
            {getClientName(client)}
          </button>)}
        {!loading && clients.length === 0 && <p className="p-2 text-xs text-[var(--text-muted)]">Клиенты не найдены</p>}
      </div>
      {error && <p role="alert" className="p-2 text-xs text-[var(--danger)]">{error}</p>}
    </div>}
  </div>;
}
