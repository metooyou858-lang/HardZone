"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  ClientDuplicateGroup,
  fetchClientDuplicateGroups,
  resolveClientDuplicateGroup,
} from "@/lib/api/clients";

function fullName(client: ClientDuplicateGroup["clients"][number]) {
  return [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function score(client: ClientDuplicateGroup["clients"][number]) {
  return (
    (client.has_telegram ? 1000 : 0) +
    client.active_subscriptions_count * 120 +
    client.subscriptions_count * 40 +
    client.visits_count * 20 +
    client.bookings_count * 15 +
    client.orders_count * 20 +
    client.profile_values_count * 5
  );
}

function DuplicateClientCard({
  client,
  selected,
  onSelect,
}: {
  client: ClientDuplicateGroup["clients"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  const metrics = [
    ["Активные", client.active_subscriptions_count],
    ["Абонементы", client.subscriptions_count],
    ["Посещения", client.visits_count],
    ["Записи", client.bookings_count],
    ["Заказы", client.orders_count],
  ];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-w-0 rounded-[20px] border p-4 text-left transition-colors ${
        selected
          ? "border-[var(--accent)] bg-[rgba(0,191,165,0.1)]"
          : "border-[var(--line-soft)] bg-[var(--bg-card-soft)] hover:border-[rgba(0,191,165,0.35)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[var(--text-main)]">{fullName(client)}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">#{client.id}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
            selected ? "bg-[var(--accent)] text-[#062b26]" : "bg-[rgba(255,255,255,0.06)] text-[var(--text-muted)]"
          }`}
        >
          {selected ? "Главная" : "Выбрать"}
        </span>
      </div>

      <div className="mt-4 space-y-1 text-sm text-[var(--text-muted)]">
        <p>{client.phone || "Телефон не указан"}</p>
        <p>{client.email || "Email не указан"}</p>
        <p>Создана: {formatDate(client.created_at)}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-[14px] border border-[var(--line-soft)] px-3 py-2">
            <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-main)]">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        {client.suggested_master && (
          <span className="rounded-full bg-[rgba(0,191,165,0.12)] px-2.5 py-1 text-[var(--accent)]">
            Рекомендация системы
          </span>
        )}
        {client.has_telegram && (
          <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2.5 py-1 text-[var(--text-main)]">
            Telegram
          </span>
        )}
        {client.has_barcode && (
          <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2.5 py-1 text-[var(--text-main)]">
            Штрихкод
          </span>
        )}
        <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2.5 py-1 text-[var(--text-muted)]">
          Вес {score(client)}
        </span>
      </div>

      <Link
        href={`/clients/${client.id}`}
        onClick={(event) => event.stopPropagation()}
        className="mt-4 inline-flex text-sm text-[var(--accent)] underline underline-offset-4"
      >
        Открыть карточку
      </Link>
    </button>
  );
}

export function ClientDuplicatesPanel() {
  const [groups, setGroups] = useState<ClientDuplicateGroup[]>([]);
  const [selectedMasters, setSelectedMasters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadGroups() {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchClientDuplicateGroups();
      setGroups(data);
      setSelectedMasters(
        Object.fromEntries(
          data.map((group) => [
            group.group_key,
            String(group.clients.find((client) => client.suggested_master)?.id ?? group.clients[0]?.id ?? ""),
          ])
        )
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить дубли");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGroups();
  }, []);

  const totalCandidates = useMemo(
    () => groups.reduce((sum, group) => sum + group.clients.length, 0),
    [groups]
  );

  async function handleSave(group: ClientDuplicateGroup) {
    const masterClientId = selectedMasters[group.group_key];
    const duplicateClientIds = group.clients
      .map((client) => String(client.id))
      .filter((id) => id !== masterClientId);

    if (!masterClientId || duplicateClientIds.length === 0) {
      setError("Выберите главную карточку");
      return;
    }

    setSavingKey(group.group_key);
    setError(null);
    setNotice(null);

    try {
      await resolveClientDuplicateGroup({
        group_key: group.group_key,
        group_type: group.group_type,
        master_client_id: masterClientId,
        duplicate_client_ids: duplicateClientIds,
      });
      setNotice("Карточки объединены");
      await loadGroups();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить решение");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleNotDuplicate(group: ClientDuplicateGroup) {
    const masterClientId = selectedMasters[group.group_key] || String(group.clients[0]?.id ?? "");
    const duplicateClientIds = group.clients
      .map((client) => String(client.id))
      .filter((id) => id !== masterClientId);

    if (!masterClientId || duplicateClientIds.length === 0) {
      return;
    }

    setSavingKey(group.group_key);
    setError(null);
    setNotice(null);

    try {
      await resolveClientDuplicateGroup({
        group_key: group.group_key,
        group_type: group.group_type,
        master_client_id: masterClientId,
        duplicate_client_ids: duplicateClientIds,
        resolution: "not_duplicate",
      });
      setNotice("Группа помечена как разные клиенты");
      await loadGroups();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить решение");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-semibold text-[var(--text-main)]">Дубли клиентов</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Система находит похожие карточки, админ выбирает главную. Недостающие данные переносятся, второстепенная карточка удаляется.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadGroups()}
            disabled={loading}
            className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-50"
          >
            Обновить
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--text-muted)]">
          <span>Групп: {groups.length}</span>
          <span>Карточек: {totalCandidates}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-[20px] border border-[rgba(248,81,73,0.28)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-[20px] border border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.1)] px-4 py-3 text-sm text-[var(--accent)]">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-14 text-center text-[var(--text-muted)]">
          Ищем похожие карточки
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-14 text-center">
          <p className="text-base font-medium text-[var(--text-main)]">Кандидаты не найдены</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Сейчас нет групп, требующих выбора главной карточки.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const selectedMasterId = selectedMasters[group.group_key] || String(group.clients[0]?.id ?? "");
            const saving = savingKey === group.group_key;

            return (
              <div key={group.group_key} className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-[var(--text-main)]">{group.group_label}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{group.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSave(group)}
                      disabled={saving}
                      className="rounded-[16px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      {saving ? "Объединяем..." : "Объединить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleNotDuplicate(group)}
                      disabled={saving}
                      className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-50"
                    >
                      Это разные клиенты
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {group.clients.map((client) => (
                    <DuplicateClientCard
                      key={client.id}
                      client={client}
                      selected={String(client.id) === selectedMasterId}
                      onSelect={() =>
                        setSelectedMasters((current) => ({
                          ...current,
                          [group.group_key]: String(client.id),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
