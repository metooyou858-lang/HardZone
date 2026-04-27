import { SearchIcon } from "@/components/schedule/schedule-shared";

export { SearchIcon };

export function DoorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M7.5 3.75h5A1.25 1.25 0 0 1 13.75 5v10a1.25 1.25 0 0 1-1.25 1.25h-5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.75 10H5.417m0 0 2.083-2.083M5.417 10l2.083 2.083" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="10" cy="10" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.667v3.75l2.5 1.666" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function formatTimeValue(value: string | null) {
  if (!value) {
    return "-";
  }

  return value.slice(0, 5);
}

export function formatVisitedAt(value: string) {
  return new Intl.DateTimeFormat("ru", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
