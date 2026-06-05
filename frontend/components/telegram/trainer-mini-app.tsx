"use client";

import { useEffect, useMemo, useState } from "react";

import {
  attendStaffBooking,
  createStaffBooking,
  fetchStaffBookings,
  fetchStaffToday,
  searchStaffClients,
  type StaffBooking,
  type StaffClientSearchResult,
  type StaffSlot,
  type StaffSlotBookings,
  unattendStaffBooking,
} from "@/lib/api/staff";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

function formatTime(value: string | null | undefined) {
  return String(value || "").slice(0, 5);
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "short" }).format(date);
}

function subscriptionLabel(item: Pick<StaffBooking | StaffClientSearchResult, "subscription_type" | "subscription_status" | "visits_left" | "expires_at">) {
  if (!item.subscription_type) return "Абонемент не выбран";
  if (item.subscription_type === "unlimited") return item.expires_at ? `Безлимит до ${item.expires_at}` : "Безлимит";
  if (item.visits_left !== null && item.visits_left !== undefined) return `Осталось ${item.visits_left}`;
  return item.subscription_status || "Абонемент";
}

function SlotCard({ slot, active, onClick }: { slot: StaffSlot; active: boolean; onClick: () => void }) {
  const confirmed = Number(slot.confirmed_count || 0);
  const attended = Number(slot.attended_count || 0);
  const capacity = Number(slot.capacity || 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        active
          ? "border-[rgba(94,244,216,0.42)] bg-[rgba(94,244,216,0.10)]"
          : "border-[var(--line-soft)] bg-[var(--bg-card)] active:scale-[0.99]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">{formatTime(slot.start_time)}</p>
          <p className="mt-1 text-lg font-semibold leading-tight text-[var(--text-main)]">
            {slot.training_type_name || "Занятие"}
          </p>
        </div>
        <span className="rounded-full border border-[rgba(255,255,255,0.08)] px-3 py-1 text-xs text-[var(--text-muted)]">
          {confirmed}/{capacity}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
        <span className="truncate">{slot.trainer_name || "Тренер не назначен"}</span>
        <span>{attended} пришли</span>
      </div>
    </button>
  );
}

function BookingRow({ booking, busy, onAttend, onUnattend }: {
  booking: StaffBooking;
  busy: boolean;
  onAttend: () => void;
  onUnattend: () => void;
}) {
  const attended = booking.status === "attended";

  return (
    <div className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.025)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[var(--text-main)]">{booking.client_name}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{subscriptionLabel(booking)}</p>
          {booking.client_phone ? <p className="mt-1 text-xs text-[var(--text-muted)]">{booking.client_phone}</p> : null}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs ${attended ? "bg-[rgba(63,185,80,0.14)] text-[#9be7aa]" : "bg-[rgba(245,197,66,0.12)] text-[var(--warning)]"}`}>
          {attended ? "Пришел" : "Ждет"}
        </span>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={attended ? onUnattend : onAttend}
        className={`mt-4 h-11 w-full rounded-xl text-sm font-semibold transition disabled:opacity-60 ${
          attended
            ? "border border-[var(--line-soft)] text-[var(--text-main)]"
            : "bg-[var(--accent)] text-[var(--text-inverse)]"
        }`}
      >
        {attended ? "Снять отметку" : "Отметить пришел"}
      </button>
    </div>
  );
}

function SlotDetails({
  selected,
  query,
  results,
  bookingClientIds,
  busyId,
  searching,
  slotLoading,
  onQueryChange,
  onSearch,
  onBookClient,
  onToggleAttend,
}: {
  selected: StaffSlotBookings;
  query: string;
  results: StaffClientSearchResult[];
  bookingClientIds: Set<string>;
  busyId: string | null;
  searching: boolean;
  slotLoading: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onBookClient: (client: StaffClientSearchResult) => void;
  onToggleAttend: (booking: StaffBooking) => void;
}) {
  return (
    <div className="rounded-b-3xl border-x border-b border-[rgba(94,244,216,0.24)] bg-[var(--bg-panel)] px-3 pb-4 pt-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
          placeholder="Имя, телефон, штрихкод"
          className="col-span-2 h-12 rounded-xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.04)] px-3 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={searching}
          className="h-11 rounded-xl bg-[var(--accent)] text-sm font-semibold text-[var(--text-inverse)] disabled:opacity-60"
        >
          {searching ? "Ищем..." : "Найти"}
        </button>
        <button
          type="button"
          className="h-11 rounded-xl border border-[var(--line-soft)] text-sm text-[var(--text-main)]"
        >
          Сканер позже
        </button>
      </div>

      {results.length > 0 ? (
        <div className="mt-3 space-y-2">
          {results.map((client) => {
            const alreadyBooked = bookingClientIds.has(String(client.id));
            return (
              <div key={`${client.id}-${client.subscription_id || "no-sub"}`} className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.025)] p-3">
                <p className="font-semibold text-[var(--text-main)]">
                  {client.last_name} {client.first_name}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{subscriptionLabel(client)}</p>
                <button
                  type="button"
                  disabled={alreadyBooked || busyId === `client-${client.id}`}
                  onClick={() => onBookClient(client)}
                  className="mt-3 h-10 w-full rounded-xl bg-[var(--accent)] text-sm font-semibold text-[var(--text-inverse)] disabled:bg-[rgba(255,255,255,0.08)] disabled:text-[var(--text-muted)]"
                >
                  {alreadyBooked ? "Уже записан" : "Записать"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--text-main)]">Клиенты</p>
          {slotLoading ? <span className="text-xs text-[var(--text-muted)]">Обновляем...</span> : null}
        </div>
        {selected.bookings.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.025)] p-5 text-center text-sm text-[var(--text-muted)]">
            Записанных клиентов пока нет.
          </div>
        ) : (
          selected.bookings.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              busy={busyId === booking.id}
              onAttend={() => onToggleAttend(booking)}
              onUnattend={() => onToggleAttend(booking)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function TrainerMiniApp() {
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<StaffSlot[]>([]);
  const [selected, setSelected] = useState<StaffSlotBookings | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffClientSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectedSlotId = selected?.slot.id ?? null;
  const bookingClientIds = useMemo(
    () => new Set((selected?.bookings ?? []).map((booking) => String(booking.client_id))),
    [selected?.bookings]
  );

  async function authenticateTelegram() {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();

    const initData = webApp?.initData || "";
    if (!initData) {
      return true;
    }

    const response = await fetch("/auth-api/telegram-miniapp-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ init_data: initData }),
    });

    if (response.ok) {
      return true;
    }

    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error || "Не удалось войти через Telegram");
    return false;
  }

  async function loadToday() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStaffToday();
      setDate(data.date);
      setSlots(data.slots);
      setSelected(null);
      setQuery("");
      setResults([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить расписание");
    } finally {
      setLoading(false);
    }
  }

  async function openSlot(slotId: string | number) {
    setSlotLoading(true);
    setError("");
    setResults([]);
    setQuery("");
    try {
      setSelected(await fetchStaffBookings(slotId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось открыть занятие");
    } finally {
      setSlotLoading(false);
    }
  }

  async function refreshSelected() {
    if (!selectedSlotId) return;
    setSelected(await fetchStaffBookings(selectedSlotId));
  }

  async function toggleAttend(booking: StaffBooking) {
    setBusyId(booking.id);
    setError("");
    try {
      setSelected(booking.status === "attended" ? await unattendStaffBooking(booking.id) : await attendStaffBooking(booking.id));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось изменить посещение");
      await refreshSelected();
    } finally {
      setBusyId(null);
    }
  }

  async function runSearch() {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    setError("");
    try {
      setResults(await searchStaffClients(query.trim()));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Не удалось найти клиента");
    } finally {
      setSearching(false);
    }
  }

  async function bookClient(client: StaffClientSearchResult) {
    if (!selectedSlotId) return;
    setBusyId(`client-${client.id}`);
    setError("");
    try {
      setSelected(await createStaffBooking({
        slot_id: selectedSlotId,
        client_id: client.id,
        subscription_id: client.subscription_id || null,
      }));
      setQuery("");
      setResults([]);
    } catch (bookError) {
      setError(bookError instanceof Error ? bookError.message : "Не удалось записать клиента");
      await refreshSelected();
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        const authenticated = await authenticateTelegram();
        if (!authenticated || cancelled) {
          if (!cancelled) setLoading(false);
          return;
        }
        await loadToday();
      } catch (initError) {
        if (!cancelled) {
          setError(initError instanceof Error ? initError.message : "Не удалось открыть Telegram Mini App");
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--bg-app)] px-4 pb-8 pt-4 text-[var(--text-main)]">
      <div className="mx-auto max-w-md space-y-4">
        <header className="rounded-3xl border border-[var(--line-soft)] bg-[linear-gradient(150deg,rgba(94,244,216,0.16),rgba(22,27,39,0.98))] p-5">
          <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">HardZone</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold leading-none">Расписание</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{date ? formatDateLabel(date) : "Сегодня"}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadToday()}
              className="rounded-xl border border-[rgba(255,255,255,0.12)] px-3 py-2 text-xs text-[var(--text-main)]"
            >
              Обновить
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-[rgba(255,116,57,0.32)] bg-[rgba(255,116,57,0.10)] p-3 text-sm text-[#ffb599]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-muted)]">
            Загружаем занятия...
          </div>
        ) : (
          <>
            <section className="space-y-3">
              {slots.length === 0 ? (
                <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-muted)]">
                  На сегодня занятий нет.
                </div>
              ) : (
                slots.map((slot) => {
                  const active = String(slot.id) === String(selectedSlotId);

                  return (
                    <div key={slot.id} className="space-y-0">
                      <SlotCard
                        slot={slot}
                        active={active}
                        onClick={() => void openSlot(slot.id)}
                      />
                      {active && selected ? (
                        <SlotDetails
                          selected={selected}
                          query={query}
                          results={results}
                          bookingClientIds={bookingClientIds}
                          busyId={busyId}
                          searching={searching}
                          slotLoading={slotLoading}
                          onQueryChange={setQuery}
                          onSearch={() => void runSearch()}
                          onBookClient={(client) => void bookClient(client)}
                          onToggleAttend={(booking) => void toggleAttend(booking)}
                        />
                      ) : null}
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
