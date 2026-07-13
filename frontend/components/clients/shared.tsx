import { Client, ClientListItem, ClientStatus, ClientSubscription, SubscriptionStatus, SubscriptionType, VisitType } from "@/lib/api/clients";

export const clientInputCls =
  "w-full rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(0,191,165,0.12)]";

export const clientLabelCls =
  "text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]";

export function formatClientName(client: Pick<Client, "last_name" | "first_name" | "middle_name">) {
  return [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(" ");
}

export function formatClientDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString("ru", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatClientDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("ru", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getClientStatusMeta(status: ClientStatus) {
  if (status === "active") {
    return {
      label: "Активен",
      className: "border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]",
    };
  }

  if (status === "away") {
    return {
      label: "Отсутствует",
      className: "border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] text-[var(--warning)]",
    };
  }

  if (status === "frozen") {
    return {
      label: "Заморожен",
      className: "border-[rgba(56,139,253,0.24)] bg-[rgba(56,139,253,0.12)] text-[#6cb6ff]",
    };
  }

  return {
    label: "Неактивен",
    className: "border-[rgba(139,148,158,0.24)] bg-[rgba(139,148,158,0.12)] text-[var(--text-muted)]",
  };
}

export function getSubscriptionStatusMeta(status: SubscriptionStatus) {
  if (status === "active") {
    return {
      label: "Активен",
      className: "border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]",
    };
  }

  if (status === "frozen") {
    return {
      label: "Заморожен",
      className: "border-[rgba(56,139,253,0.24)] bg-[rgba(56,139,253,0.12)] text-[#6cb6ff]",
    };
  }

  if (status === "expired") {
    return {
      label: "Истёк",
      className: "border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] text-[var(--warning)]",
    };
  }

  if (status === "cancelled") {
    return {
      label: "Отключён",
      className: "border-[rgba(248,81,73,0.24)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]",
    };
  }

  return {
    label: "Исчерпан",
    className: "border-[rgba(139,148,158,0.24)] bg-[rgba(139,148,158,0.12)] text-[var(--text-muted)]",
  };
}

export function getSubscriptionTypeLabel(type: SubscriptionType | null | undefined) {
  if (type === "single") return "Разовый";
  if (type === "visits") return "На занятия";
  if (type === "period") return "На период";
  if (type === "unlimited") return "Безлимит";
  return "—";
}

export function getVisitTypeLabel(type: VisitType) {
  return type === "open_gym" ? "Open Gym" : "Группа";
}

export function describeSubscription(
  subscription:
    | Pick<ClientSubscription, "type" | "visits_left" | "expires_at">
    | Pick<ClientListItem, "subscription_type" | "visits_left" | "expires_at">
    | null
    | undefined
) {
  if (!subscription) {
    return "Нет активного абонемента";
  }

  const type = "type" in subscription ? subscription.type : subscription.subscription_type;
  if (type === "single") {
    return "Разовый";
  }

  if (type === "visits") {
    return `${subscription.visits_left ?? 0} занятий осталось`;
  }

  if (type === "period" || type === "unlimited") {
    return `До ${formatClientDate(subscription.expires_at)}`;
  }

  return "Нет активного абонемента";
}

export function BarcodeVisual({ value }: { value: string }) {
  const digits = value.replace(/\D/g, "").split("");

  return (
    <div className="rounded-[20px] border border-[var(--line-soft)] bg-[#f0f6ff] p-4">
      <div className="flex h-16 items-stretch justify-center gap-px overflow-hidden rounded-lg bg-white px-3 py-2">
        {digits.flatMap((digit, index) => {
          const width = (Number(digit) % 3) + 1;
          const pattern = [true, false, true, Number(digit) % 2 === 0];

          return pattern.map((filled, patternIndex) => (
            <span
              key={`${index}-${patternIndex}`}
              className="h-full"
              style={{
                width: `${width}px`,
                backgroundColor: filled ? "#0D1117" : "transparent",
              }}
            />
          ));
        })}
      </div>
      <p className="mt-3 text-center font-[family:var(--font-mono)] text-xs tracking-[0.34em] text-[#0D1117]">
        {value}
      </p>
    </div>
  );
}
