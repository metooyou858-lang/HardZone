"use client";

import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";

import {
  bookClientMiniAppSlot,
  cancelClientMiniAppBooking,
  linkClientMiniAppPhone,
  loginClientMiniApp,
  reviewClientMiniAppTrainer,
  type ClientMiniAppAvailableSlot,
  type ClientMiniAppPayload,
  type ClientMiniAppSubscription,
  type ClientMiniAppTrainer,
  type ClientMiniAppVisit,
} from "@/lib/api/client-miniapp";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        viewportHeight?: number;
        viewportStableHeight?: number;
        ready?: () => void;
        expand?: () => void;
        onEvent?: (eventType: "viewportChanged", eventHandler: (eventData: { isStateStable?: boolean }) => void) => void;
        offEvent?: (eventType: "viewportChanged", eventHandler: (eventData: { isStateStable?: boolean }) => void) => void;
      };
    };
  }
}

type ClientTab = "home" | "schedule" | "trainers" | "profile" | "visits";
type AuthMode = "checking" | "linked" | "phone" | "telegram";

function getTelegramStableViewportHeight() {
  if (typeof window === "undefined") return null;
  const webApp = window.Telegram?.WebApp;
  return webApp?.viewportStableHeight || webApp?.viewportHeight || window.innerHeight;
}

function useTelegramStableViewportHeight() {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    const applyHeight = () => setHeight(getTelegramStableViewportHeight());
    const handleViewportChange = (eventData: { isStateStable?: boolean }) => {
      if (eventData.isStateStable) {
        applyHeight();
      }
    };

    applyHeight();
    webApp?.onEvent?.("viewportChanged", handleViewportChange);

    return () => {
      webApp?.offEvent?.("viewportChanged", handleViewportChange);
    };
  }, []);

  return height;
}

function useLockedMiniAppBody() {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, []);
}

function usePreventMiniAppRubberBand(scrollRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scrollRoot = scrollRef.current;
    if (!scrollRoot) return;
    const root = scrollRoot;

    let startY = 0;

    function findScrollableElement(target: EventTarget | null) {
      let element = target instanceof HTMLElement ? target : null;

      while (element && root.contains(element)) {
        const style = window.getComputedStyle(element);
        const canScrollY = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
        if (canScrollY) return element;
        element = element.parentElement;
      }

      return root;
    }

    function handleTouchStart(event: TouchEvent) {
      startY = event.touches[0]?.clientY || 0;
    }

    function handleTouchMove(event: TouchEvent) {
      if (event.touches.length !== 1) return;

      const currentY = event.touches[0]?.clientY || 0;
      const deltaY = currentY - startY;
      const scrollable = findScrollableElement(event.target);
      const canScroll = scrollable.scrollHeight > scrollable.clientHeight;

      if (!canScroll) {
        event.preventDefault();
        return;
      }

      const atTop = scrollable.scrollTop <= 0;
      const atBottom = Math.ceil(scrollable.scrollTop + scrollable.clientHeight) >= scrollable.scrollHeight;

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    }

    root.addEventListener("touchstart", handleTouchStart, { passive: true });
    root.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      root.removeEventListener("touchstart", handleTouchStart);
      root.removeEventListener("touchmove", handleTouchMove);
    };
  });
}

const tabLabels: Record<ClientTab, string> = {
  home: "Главная",
  schedule: "Расписание",
  trainers: "Тренеры",
  profile: "Профиль",
  visits: "Посещения",
};

function formatTime(value: string | null | undefined) {
  return String(value || "").slice(0, 5);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const raw = String(value);
  const datePart = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function formatLongDate(value: string | null | undefined) {
  if (!value) return "";
  const day = dateKey(value);
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(date);
}

function dateKey(value: string | null | undefined) {
  return String(value || "").slice(0, 10);
}

function sortByDateTime<T extends { date: string; start_time: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftValue = `${dateKey(left.date)} ${left.start_time}`;
    const rightValue = `${dateKey(right.date)} ${right.start_time}`;
    return leftValue.localeCompare(rightValue);
  });
}

function clientName(data: ClientMiniAppPayload | null) {
  const client = data?.client;
  if (!client) return "Клиент HardZone";
  return [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ");
}

function cabinetNumber(data: ClientMiniAppPayload | null) {
  return data?.client.barcode || "не указан";
}

function subscriptionTitle(subscription: ClientMiniAppSubscription | null) {
  if (!subscription) return "Нет активного абонемента";
  return subscription.product_name || {
    single: "Разовое посещение",
    visits: "Абонемент по посещениям",
    period: "Периодный абонемент",
    unlimited: "Безлимит",
  }[subscription.type];
}

function subscriptionMeta(subscription: ClientMiniAppSubscription | null) {
  if (!subscription) return "Обратитесь на ресепшн HardZone";
  if (subscription.type === "visits" || subscription.type === "single") {
    return subscription.visits_left === null ? "Посещения не ограничены" : `Осталось ${subscription.visits_left}`;
  }
  return subscription.expires_at ? `Действует до ${formatDate(subscription.expires_at.slice(0, 10))}` : "Активен";
}

const code128Patterns = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function getCode128Pattern(value: string) {
  const text = value.trim();
  if (!text || [...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126)) {
    return null;
  }

  const codes = [104, ...[...text].map((char) => char.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  return [...codes, checksum, 106].map((code) => code128Patterns[code]).join("");
}

function BarcodeSvg({ value }: { value: string | null | undefined }) {
  const pattern = getCode128Pattern(String(value || ""));
  if (!pattern) {
    return (
      <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
        Штрихкод не указан
      </div>
    );
  }

  const quiet = 10;
  let x = quiet;
  const bars = [...pattern].map((width, index) => {
    const moduleWidth = Number(width);
    const bar = index % 2 === 0 ? { x, width: moduleWidth } : null;
    x += moduleWidth;
    return bar;
  }).filter(Boolean) as Array<{ x: number; width: number }>;
  const totalWidth = x + quiet;

  return (
    <div className="rounded-md bg-white px-3 py-2">
      <svg
        viewBox={`0 0 ${totalWidth} 34`}
        className="h-10 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Штрихкод ${value}`}
      >
        <rect x="0" y="0" width={totalWidth} height="44" fill="#ffffff" />
        {bars.map((bar, index) => (
          <rect key={`${bar.x}-${index}`} x={bar.x} y="3" width={bar.width} height="30" fill="#05070b" />
        ))}
      </svg>
    </div>
  );
}

function tabIcon(tab: ClientTab, active: boolean) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (tab === "home") {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 10v9h11v-9" />
        <path d="M10 19v-5h4v5" />
      </svg>
    );
  }

  if (tab === "schedule") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M4 10h16" />
      </svg>
    );
  }

  if (tab === "trainers") {
    return (
      <svg {...common}>
        <circle cx="8.5" cy="8" r="3" />
        <circle cx="16.5" cy="9" r="2.5" />
        <path d="M3.5 19a5 5 0 0 1 10 0" />
        <path d="M13.5 19a4 4 0 0 1 7 0" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function AppHeader({ title, onRefresh }: { title: string; onRefresh: () => void }) {
  return (
    <header className="z-20 shrink-0 bg-[rgba(8,11,16,0.9)] px-3 py-1.5 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="h-8 w-8" />
        <h1 className="text-sm font-medium leading-tight text-[var(--text-main)]">{title}</h1>
        <div className="flex h-8 w-8 items-center justify-end">
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-xs text-[var(--text-main)]"
            aria-label="Обновить"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 11a8 8 0 1 0-2.3 5.7" />
              <path d="M20 5v6h-6" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ active, onChange }: { active: ClientTab; onChange: (tab: ClientTab) => void }) {
  const tabs: ClientTab[] = ["home", "schedule", "trainers", "profile"];

  return (
    <nav className="z-30 shrink-0 px-3 pb-[max(7px,env(safe-area-inset-bottom))] pt-1">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(12,15,21,0.94)] p-1 shadow-[0_14px_30px_rgba(0,0,0,0.34)] backdrop-blur">
        {tabs.map((tab) => {
          const activeTab = active === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onChange(tab)}
              className={`flex min-h-[36px] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md px-1 text-[10px] transition [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                activeTab
                  ? "bg-[rgba(94,244,216,0.12)] text-[var(--text-main)]"
                  : "text-[var(--text-muted)] active:bg-[rgba(255,255,255,0.04)]"
              }`}
            >
              {tabIcon(tab, activeTab)}
              <span className="block w-[150%] max-w-none origin-center scale-[0.6] truncate text-center leading-none">{tabLabels[tab]}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ClientCard({ data }: { data: ClientMiniAppPayload | null }) {
  const name = clientName(data);
  const barcode = data?.client.barcode || "";

  return (
    <section className="relative overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(135deg,#11151d_0%,#121923_100%)] p-3 shadow-[0_14px_34px_rgba(0,0,0,0.24)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#5ef4d8,#f6d46b,#ff7a59)]" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[rgba(94,244,216,0.10)] blur-2xl" />
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.92)] text-base font-medium text-[var(--text-inverse)] shadow-[0_8px_20px_rgba(0,0,0,0.24)]">
          {name.trim().slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium leading-tight text-[var(--text-main)]">{name}</h2>
          <p className="mt-1 truncate font-[family:var(--font-mono)] text-[11px] text-[var(--text-muted)]">
            ЛК {cabinetNumber(data)}
          </p>
        </div>
      </div>
      <div className="relative mt-3">
        <BarcodeSvg value={barcode} />
      </div>
    </section>
  );
}

function SubscriptionSummary({ subscription }: { subscription: ClientMiniAppSubscription | null }) {
  return (
    <section className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Абонемент</p>
      <p className="mt-1 truncate text-xs font-medium text-[var(--text-main)]">{subscriptionTitle(subscription)}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{subscriptionMeta(subscription)}</p>
    </section>
  );
}

function Stat({ label, value, onClick }: { label: string; value: string | number; onClick?: () => void }) {
  const className = "rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2 text-center";
  const content = (
    <>
      <p className="text-base font-medium leading-none text-[var(--text-main)]">{value}</p>
      <p className="mt-1 text-[10px] leading-none text-[var(--text-muted)]">{label}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} transition active:bg-[rgba(255,255,255,0.06)]`}>
        {content}
      </button>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}

function TrainerAvatar({ name, photoUrl, size = "md" }: { name: string; photoUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const sizeClass = {
    sm: "h-8 w-8 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-20 w-20 text-lg",
  }[size];
  const initial = name.trim().slice(0, 1).toUpperCase() || "Т";

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-1 ring-white/10`}
      />
    );
  }

  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.92)] font-medium text-[var(--text-inverse)]`}>
      {initial}
    </div>
  );
}

function trainerName(trainer: ClientMiniAppTrainer) {
  return [trainer.first_name, trainer.last_name].filter(Boolean).join(" ");
}

function AvailableSlotItem({
  slot,
  busy,
  onBook,
  onCancel,
  onOpen,
}: {
  slot: ClientMiniAppAvailableSlot;
  busy: boolean;
  onBook: () => void;
  onCancel: () => void;
  onOpen: () => void;
}) {
  const disabled = busy || (!slot.is_booked && slot.free_places <= 0);
  const tags = [
    slot.training_type_location,
    slot.training_type_audience,
    slot.training_type_booking_note,
    ...(slot.training_type_tags || []),
  ].filter(Boolean) as string[];

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="relative overflow-hidden rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-3 text-left"
    >
      <div
        className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full"
        style={{ backgroundColor: slot.training_type_color || "var(--accent)" }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pl-2">
          <h3 className="truncate text-sm font-medium text-[var(--text-main)]">
            {slot.training_type_name || "Занятие"}
          </h3>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {formatTime(slot.start_time)} · {formatDate(slot.date)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-1 text-[10px] text-[var(--text-main)]">
          Еще {slot.free_places} мест
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 pl-2">
        <TrainerAvatar name={slot.trainer_name || "Т"} photoUrl={slot.trainer_photo_url} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[var(--text-main)]">{slot.trainer_name || "Тренер не назначен"}</p>
          {slot.trainer_rating ? (
            <p className="text-[10px] text-[var(--text-muted)]">★ {slot.trainer_rating} · {slot.trainer_reviews_count || 0} отзывов</p>
          ) : null}
        </div>
      </div>
      {tags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5 pl-2">
          {tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-[rgba(255,116,116,0.10)] px-2 py-1 text-[10px] text-[#ffb3b3]">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          slot.is_booked ? onCancel() : onBook();
        }}
        disabled={disabled}
        className={`mt-3 h-9 w-full rounded-md text-xs font-medium disabled:bg-[rgba(255,255,255,0.08)] disabled:text-[var(--text-muted)] ${
          slot.is_booked
            ? "border border-[rgba(255,116,57,0.28)] bg-[rgba(255,116,57,0.08)] text-[#ffb599]"
            : "bg-[var(--accent)] text-[var(--text-inverse)]"
        }`}
      >
        {busy ? (slot.is_booked ? "Отменяем..." : "Записываем...") : slot.is_booked ? "Отменить запись" : slot.free_places <= 0 ? "Мест нет" : "Записаться"}
      </button>
    </article>
  );
}

function SlotDetailScreen({
  slot,
  busy,
  onBack,
  onBook,
  onCancel,
  onOpenTrainer,
}: {
  slot: ClientMiniAppAvailableSlot;
  busy: boolean;
  onBack: () => void;
  onBook: () => void;
  onCancel: () => void;
  onOpenTrainer: (trainerId: string) => void;
}) {
  const title = slot.training_type_name || "Занятие";
  const location = slot.training_type_location || "HardZone";
  const description = slot.training_type_description || "Описание тренировки пока не заполнено в CRM.";
  const actionDisabled = busy || (!slot.is_booked && slot.free_places <= 0);

  return (
    <div className="pb-3">
      <header className="sticky top-0 z-10 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(8,11,16,0.96)] px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl text-[var(--text-main)] active:bg-[rgba(255,255,255,0.06)]"
            aria-label="Назад"
          >
            ‹
          </button>
          <h2 className="truncate text-lg font-medium text-[var(--text-main)]">{formatLongDate(slot.date)}</h2>
        </div>
      </header>

      <section className="px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-main)]">
              {slot.slot_type === "group" ? "Групповое занятие" : "Занятие"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-[1.08] text-[var(--text-main)]">{title}</h1>
            <p className="mt-3 text-base font-medium text-[var(--text-main)]">{formatLongDate(slot.date)}</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{slot.training_type_booking_note || "Предварительная запись"}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-4xl font-semibold leading-none text-[var(--text-main)]">{formatTime(slot.start_time)}</p>
            <p className="mt-2 text-base text-[var(--text-muted)]">{slot.duration_minutes} мин</p>
          </div>
        </div>

        <div className="mt-5 border-t border-[rgba(255,255,255,0.08)] pt-5">
          <p className="text-sm text-[var(--text-muted)]">Место проведения</p>
          <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{location}</p>
          <p className="mt-5 text-sm text-[var(--text-muted)]">Продолжительность</p>
          <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{slot.duration_minutes} мин</p>
        </div>
      </section>

      <section className="border-y border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.035)] px-4 py-5">
        <h3 className="text-lg font-semibold text-[var(--text-main)]">Тренер</h3>
        <button
          type="button"
          onClick={() => slot.trainer_id && onOpenTrainer(String(slot.trainer_id))}
          disabled={!slot.trainer_id}
          className="mt-4 flex w-full items-center gap-3 rounded-lg bg-[rgba(5,7,11,0.42)] p-3 text-left disabled:opacity-70"
        >
          <TrainerAvatar name={slot.trainer_name || "Т"} photoUrl={slot.trainer_photo_url} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-[var(--text-main)]">{slot.trainer_name || "Тренер не назначен"}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {slot.trainer_reviews_count > 0 ? `★ ${slot.trainer_rating} · ${slot.trainer_reviews_count} отзывов` : "Информация о тренере"}
            </p>
          </div>
          {slot.trainer_id ? <span className="text-3xl text-[var(--text-main)]">›</span> : null}
        </button>
      </section>

      <section className="px-4 py-5">
        <h3 className="text-lg font-semibold text-[var(--text-main)]">{title}</h3>
        <p className="mt-3 whitespace-pre-line text-base leading-6 text-[var(--text-main)]">{description}</p>
      </section>

      <section className="sticky bottom-0 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(8,11,16,0.96)] px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={slot.is_booked ? onCancel : onBook}
          disabled={actionDisabled}
          className={`h-12 w-full rounded-lg text-base font-medium disabled:bg-[rgba(255,255,255,0.08)] disabled:text-[var(--text-muted)] ${
            slot.is_booked
              ? "border border-[rgba(255,116,57,0.28)] bg-[rgba(255,116,57,0.08)] text-[#ffb599]"
              : "bg-[var(--accent)] text-[var(--text-inverse)]"
          }`}
        >
          {busy ? (slot.is_booked ? "Отменяем..." : "Записываем...") : slot.is_booked ? "Отменить запись" : slot.free_places <= 0 ? "Нет свободных мест" : "Записаться на тренировку"}
        </button>
        {!slot.is_booked && slot.free_places <= 0 ? (
          <p className="mt-3 text-center text-sm text-[var(--text-main)]">Нет свободных мест</p>
        ) : null}
      </section>
    </div>
  );
}

function visitDateTime(visit: ClientMiniAppVisit) {
  const visitedAt = new Date(visit.visited_at);
  const date = visit.date || (Number.isNaN(visitedAt.getTime()) ? visit.visited_at : visitedAt.toISOString().slice(0, 10));
  const time = visit.start_time || (Number.isNaN(visitedAt.getTime()) ? "" : visitedAt.toISOString().slice(11, 16));
  return [formatDate(date), time ? formatTime(time) : ""].filter(Boolean).join(" · ");
}

function VisitItem({ visit }: { visit: ClientMiniAppVisit }) {
  return (
    <article className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-2.5">
      <p className="text-xs font-medium text-[var(--text-main)]">{visit.training_type_name || (visit.visit_type === "open_gym" ? "Open Gym" : "Занятие")}</p>
      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{visitDateTime(visit)}</p>
    </article>
  );
}

function HomeScreen({ data }: { data: ClientMiniAppPayload | null }) {
  const activeSubscription = data?.subscriptions.find((item) => item.status === "active") || data?.subscriptions[0] || null;
  const bookings = sortByDateTime(data?.bookings || []);

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      <ClientCard data={data} />
      <SubscriptionSummary subscription={activeSubscription} />
      <section className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-3">
        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Мои записи</p>
        {bookings.length ? (
          <div className="mt-2 space-y-2">
            {bookings.map((booking) => (
              <div key={booking.id} className="border-t border-[rgba(255,255,255,0.06)] pt-2 first:border-t-0 first:pt-0">
                <p className="truncate text-xs font-medium text-[var(--text-main)]">
                  {booking.training_type_name || "Занятие"}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {formatDate(booking.date)} · {formatTime(booking.start_time)} · {booking.trainer_name || "Тренер не назначен"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-muted)]">Активных записей пока нет</p>
        )}
      </section>
    </div>
  );
}

function ScheduleScreen({
  availableSlots,
  busyId,
  error,
  onBook,
  onCancel,
  onOpenTrainer,
}: {
  availableSlots: ClientMiniAppAvailableSlot[];
  busyId: string | null;
  error: string;
  onBook: (slot: ClientMiniAppAvailableSlot) => void;
  onCancel: (slot: ClientMiniAppAvailableSlot) => void;
  onOpenTrainer: (trainerId: string) => void;
}) {
  const days = [...new Set(sortByDateTime(availableSlots).map((slot) => dateKey(slot.date)).filter(Boolean))];
  const [selectedDay, setSelectedDay] = useState(days[0] || "");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const activeDay = days.includes(selectedDay) ? selectedDay : days[0] || "";
  const visibleSlots = sortByDateTime(availableSlots).filter((slot) => dateKey(slot.date) === activeDay);
  const selectedSlot = selectedSlotId ? availableSlots.find((slot) => String(slot.id) === selectedSlotId) || null : null;

  if (selectedSlot) {
    return (
      <SlotDetailScreen
        slot={selectedSlot}
        busy={busyId === `book-${selectedSlot.id}` || busyId === `cancel-${selectedSlot.id}`}
        onBack={() => setSelectedSlotId(null)}
        onBook={() => onBook(selectedSlot)}
        onCancel={() => onCancel(selectedSlot)}
        onOpenTrainer={onOpenTrainer}
      />
    );
  }

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      {error ? (
        <div className="rounded-md border border-[rgba(255,116,57,0.28)] bg-[rgba(255,116,57,0.08)] p-2.5 text-xs text-[#ffb599]">
          {error}
        </div>
      ) : null}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-xs font-medium text-[var(--text-main)]">Расписание</h2>
          {activeDay ? <p className="truncate text-[11px] text-[var(--accent)]">{formatDate(activeDay)}</p> : null}
        </div>
        {days.length ? (
          <div className="-mx-3 mb-3 overflow-x-auto px-3">
            <div className="flex gap-2">
              {days.map((day) => {
                const date = new Date(`${day}T00:00:00`);
                const weekday = Number.isNaN(date.getTime())
                  ? ""
                  : new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", "");
                const active = day === activeDay;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg border text-center transition ${
                      active
                        ? "border-[var(--accent)] bg-[rgba(94,244,216,0.14)] text-[var(--text-main)]"
                        : "border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)]"
                    }`}
                  >
                    <span className="text-[10px] uppercase">{weekday}</span>
                    <span className="mt-1 text-base font-medium leading-none">{day.slice(8, 10)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          {visibleSlots.length === 0 ? (
            <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-3 text-xs text-[var(--text-muted)]">
              На ближайшие дни свободных занятий нет
            </div>
          ) : (
            visibleSlots.map((slot) => (
              <AvailableSlotItem
                key={slot.id}
                slot={slot}
                busy={busyId === `book-${slot.id}` || busyId === `cancel-${slot.id}`}
                onBook={() => onBook(slot)}
                onCancel={() => onCancel(slot)}
                onOpen={() => setSelectedSlotId(String(slot.id))}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function TrainersScreen({
  trainers,
  initData,
  onPayloadUpdate,
  initialSelectedId,
}: {
  trainers: ClientMiniAppTrainer[];
  initData: string;
  onPayloadUpdate: (payload: ClientMiniAppPayload) => void;
  initialSelectedId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const visibleTrainers = trainers.filter((trainer) => {
    const haystack = [
      trainerName(trainer),
      trainer.position,
      trainer.bio,
      ...trainer.specialties,
      ...trainer.training_types.map((type) => type.name),
    ].filter(Boolean).join(" ").toLowerCase();
    return !normalizedSearch || haystack.includes(normalizedSearch);
  });
  const selectedTrainer = selectedId ? trainers.find((trainer) => trainer.id === selectedId) || null : null;

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId]);

  useEffect(() => {
    if (!selectedTrainer) return;
    setReviewRating(selectedTrainer.my_review?.rating || 5);
    setReviewComment(selectedTrainer.my_review?.comment || "");
    setReviewError("");
  }, [selectedTrainer]);

  async function saveReview() {
    if (!selectedTrainer) return;

    setReviewSaving(true);
    setReviewError("");

    try {
      onPayloadUpdate(await reviewClientMiniAppTrainer(initData, selectedTrainer.id, reviewRating, reviewComment));
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Не удалось сохранить отзыв");
    } finally {
      setReviewSaving(false);
    }
  }

  if (selectedTrainer) {
    const name = trainerName(selectedTrainer);
    const specialties = selectedTrainer.specialties.length
      ? selectedTrainer.specialties
      : selectedTrainer.training_types.map((type) => type.name).filter(Boolean);

    return (
      <div className="space-y-3 px-3 pb-3 pt-2">
        <section className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)]">
          <div className="relative h-40 bg-[linear-gradient(135deg,#11151d,#18232d)]">
            {selectedTrainer.photo_url ? (
              <img src={selectedTrainer.photo_url} alt={name} className="h-full w-full object-cover opacity-80" />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,11,0.16),rgba(5,7,11,0.86))]" />
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-lg text-white"
              aria-label="Назад"
            >
              ‹
            </button>
            <div className="absolute bottom-3 left-3 right-3">
              <h2 className="text-base font-medium text-white">{name}</h2>
              <p className="mt-1 text-xs text-white/75">{selectedTrainer.position || "Тренер"}</p>
            </div>
          </div>
          <div className="space-y-3 p-3">
            <section className="rounded-lg bg-[rgba(255,255,255,0.03)] p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-[var(--text-main)]">Отзывы</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {selectedTrainer.reviews_count > 0
                    ? `★ ${selectedTrainer.rating} · ${selectedTrainer.reviews_count}`
                    : "Пока нет отзывов"}
                </p>
              </div>
              <div className="mt-3 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setReviewRating(value)}
                    className={`h-8 w-8 rounded-md text-sm ${
                      value <= reviewRating
                        ? "bg-[rgba(94,244,216,0.16)] text-[var(--accent)]"
                        : "bg-[rgba(255,255,255,0.05)] text-[var(--text-muted)]"
                    }`}
                    aria-label={`Оценка ${value}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Ваш отзыв"
                className="mt-3 w-full resize-none rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
              />
              {reviewError ? <p className="mt-2 text-xs text-[#ffb599]">{reviewError}</p> : null}
              <button
                type="button"
                onClick={() => void saveReview()}
                disabled={reviewSaving}
                className="mt-3 h-9 w-full rounded-md bg-[var(--accent)] text-xs font-medium text-[var(--text-inverse)] disabled:opacity-60"
              >
                {reviewSaving ? "Сохраняем..." : selectedTrainer.my_review ? "Обновить отзыв" : "Оставить отзыв"}
              </button>
            </section>
            <div className="hidden grid-cols-2 gap-2">
              <button type="button" onClick={() => setSelectedId(null)} className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-left text-xs font-medium text-[var(--text-main)]">
                Расписание
              </button>
              <button type="button" className="rounded-md border border-[rgba(94,244,216,0.24)] bg-[rgba(94,244,216,0.10)] px-3 py-2 text-left text-xs font-medium text-[var(--text-main)]">
                Персональная
              </button>
            </div>
            <section className="rounded-lg bg-[rgba(255,255,255,0.03)] p-3">
              <h3 className="text-sm font-medium text-[var(--text-main)]">О тренере</h3>
              <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[var(--text-main)]">
                {selectedTrainer.bio || "Описание тренера пока не заполнено в CRM."}
              </p>
              {specialties.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {specialties.map((specialty) => (
                    <span key={specialty} className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
                      {specialty}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск"
        className="h-10 w-full rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
      />
      <section className="grid grid-cols-2 gap-3">
        {visibleTrainers.length === 0 ? (
          <div className="col-span-2 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-3 text-xs text-[var(--text-muted)]">
            Тренеры пока не заполнены
          </div>
        ) : (
          visibleTrainers.map((trainer) => {
            const name = trainerName(trainer);
            return (
              <button key={trainer.id} type="button" onClick={() => setSelectedId(trainer.id)} className="text-left">
                <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)]">
                  {trainer.photo_url ? (
                    <img src={trainer.photo_url} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#10141c,#18222d)] text-2xl font-medium text-[var(--text-muted)]">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className={`absolute left-2 top-2 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-[#0b1017] ${trainer.reviews_count > 0 ? "" : "hidden"}`}>
                    ★ {trainer.rating}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-medium text-[var(--text-main)]">{name}</p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">{trainer.position || "Тренер"}</p>
              </button>
            );
          })
        )}
      </section>
    </div>
  );
}

function VisitsScreen({ visits }: { visits: ClientMiniAppVisit[] }) {
  const sortedVisits = [...visits].sort((left, right) => String(right.visited_at).localeCompare(String(left.visited_at)));

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      <section>
        <h2 className="mb-2 text-xs font-medium text-[var(--text-main)]">Посещенные занятия</h2>
        <div className="space-y-2">
          {sortedVisits.length === 0 ? (
            <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-3 text-xs text-[var(--text-muted)]">
              Посещений пока нет
            </div>
          ) : (
            sortedVisits.map((visit) => <VisitItem key={visit.id} visit={visit} />)
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileScreen({ data, onOpenVisits }: { data: ClientMiniAppPayload | null; onOpenVisits: () => void }) {
  const client = data?.client;

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      <ClientCard data={data} />
      <section className="grid grid-cols-1 gap-2">
        <Stat label="посещений" value={data?.visits.length ?? "..."} onClick={onOpenVisits} />
      </section>
      <section className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-3">
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--text-muted)]">Телефон</span>
            <span className="text-right text-[var(--text-main)]">{client?.phone || "Не указан"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--text-muted)]">Email</span>
            <span className="text-right text-[var(--text-main)]">{client?.email || "Не указан"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--text-muted)]">Штрихкод</span>
            <span className="text-right font-[family:var(--font-mono)] text-[var(--text-main)]">{client?.barcode || "Не указан"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ClientAuthScreen({
  mode,
  phone,
  error,
  loading,
  viewportHeight,
  onPhoneChange,
  onSubmit,
}: {
  mode: AuthMode;
  phone: string;
  error: string;
  loading: boolean;
  viewportHeight: number | null;
  onPhoneChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canEnterPhone = mode === "phone";

  return (
    <main
      className="flex h-[100dvh] items-center overflow-hidden bg-[var(--bg-app)] px-4 py-8 text-[var(--text-main)]"
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
      <section className="mx-auto w-full max-w-md rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
        <p className="font-[family:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          HardZone
        </p>
        <h1 className="mt-2 text-xl font-medium leading-tight text-[var(--text-main)]">Вход клиента</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          {canEnterPhone
            ? "Введите телефон из вашей карточки клиента."
            : "Откройте это приложение из Telegram, чтобы мы получили защищённые данные запуска."}
        </p>

        {canEnterPhone ? (
          <form
            className="mt-5 space-y-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <input
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+7 999 000-00-00"
              className="h-12 w-full rounded-lg border border-[var(--line-soft)] bg-[rgba(255,255,255,0.04)] px-3 text-base text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-lg bg-[var(--accent)] text-sm font-medium text-[var(--text-inverse)] disabled:opacity-60"
            >
              {loading ? "Проверяем..." : "Продолжить"}
            </button>
          </form>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-[rgba(255,116,57,0.32)] bg-[rgba(255,116,57,0.10)] p-3 text-sm text-[#ffb599]">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function ClientMiniApp() {
  const viewportHeight = useTelegramStableViewportHeight();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<ClientTab>("home");
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [initData, setInitData] = useState("");
  const [phone, setPhone] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [data, setData] = useState<ClientMiniAppPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);

  useLockedMiniAppBody();
  usePreventMiniAppRubberBand(scrollRef);

  async function authenticate() {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();

    const telegramInitData = webApp?.initData || "";
    setInitData(telegramInitData);

    if (!telegramInitData) {
      setAuthMode("telegram");
      setAuthError("Telegram не передал данные запуска. Откройте Mini App из кнопки в боте HardZone.");
      return;
    }

    try {
      const payload = await loginClientMiniApp(telegramInitData);
      setData(payload);
      setAuthMode("linked");
      setAuthError("");
    } catch (error) {
      if (error instanceof Error && error.message.includes("не привязан")) {
        setAuthMode("phone");
        setAuthError("");
        return;
      }

      setAuthMode("telegram");
      setAuthError(error instanceof Error ? error.message : "Не удалось войти через Telegram");
    }
  }

  async function linkPhone() {
    setAuthLoading(true);
    setAuthError("");

    try {
      const payload = await linkClientMiniAppPhone(initData, phone);
      setData(payload);
      setPhone("");
      setAuthMode("linked");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Не удалось привязать Telegram по телефону");
    } finally {
      setAuthLoading(false);
    }
  }

  async function bookSlot(slot: ClientMiniAppAvailableSlot) {
    setBusyId(`book-${slot.id}`);
    setActionError("");

    try {
      setData(await bookClientMiniAppSlot(initData, slot.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось записаться");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelSlot(slot: ClientMiniAppAvailableSlot) {
    if (!slot.client_booking_id) {
      setActionError("Не удалось найти запись для отмены");
      return;
    }

    setBusyId(`cancel-${slot.id}`);
    setActionError("");

    try {
      setData(await cancelClientMiniAppBooking(initData, slot.client_booking_id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось отменить запись");
    } finally {
      setBusyId(null);
    }
  }

  function openTrainerFromSchedule(trainerId: string) {
    setSelectedTrainerId(trainerId);
    setActiveTab("trainers");
  }

  useEffect(() => {
    void authenticate();
  }, []);

  if (authMode === "phone" || authMode === "telegram") {
    return (
      <ClientAuthScreen
        mode={authMode}
        phone={phone}
        error={authError}
        loading={authLoading}
        viewportHeight={viewportHeight}
        onPhoneChange={setPhone}
        onSubmit={() => void linkPhone()}
      />
    );
  }

  return (
    <main
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)]"
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
      <AppHeader title={tabLabels[activeTab]} onRefresh={() => void authenticate()} />

      <div ref={scrollRef} className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto">
        {activeTab === "home" ? <HomeScreen data={data} /> : null}
        {activeTab === "schedule" ? (
          <ScheduleScreen
            availableSlots={data?.available_slots || []}
            busyId={busyId}
            error={actionError}
            onBook={(slot) => void bookSlot(slot)}
            onCancel={(slot) => void cancelSlot(slot)}
            onOpenTrainer={openTrainerFromSchedule}
          />
        ) : null}
        {activeTab === "trainers" ? (
          <TrainersScreen
            trainers={data?.trainers || []}
            initData={initData}
            onPayloadUpdate={(payload) => setData(payload)}
            initialSelectedId={selectedTrainerId}
          />
        ) : null}
        {activeTab === "profile" ? <ProfileScreen data={data} onOpenVisits={() => setActiveTab("visits")} /> : null}
        {activeTab === "visits" ? <VisitsScreen visits={data?.visits || []} /> : null}
      </div>

      <BottomNav
        active={activeTab}
        onChange={(tab) => {
          setSelectedTrainerId(null);
          setActiveTab(tab);
        }}
      />
    </main>
  );
}
