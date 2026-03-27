"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ActionIconButton({
  label,
  active = false,
  disabled = false,
  tone = "default",
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  tone?: "default" | "edit" | "receipt" | "writeoff";
  onClick: () => void;
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, side: "top" as "top" | "bottom" });

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !tooltipRef.current) {
      return;
    }

    const gutter = 8;

    const updatePosition = () => {
      if (!buttonRef.current || !tooltipRef.current) {
        return;
      }

      const buttonRect = buttonRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const showBelow = buttonRect.top - tooltipRect.height - gutter < gutter;
      const top = showBelow
        ? Math.min(window.innerHeight - tooltipRect.height - gutter, buttonRect.bottom + gutter)
        : Math.max(gutter, buttonRect.top - tooltipRect.height - gutter);
      const left = Math.min(
        Math.max(gutter, buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2),
        window.innerWidth - tooltipRect.width - gutter
      );

      setPosition({
        top,
        left,
        side: showBelow ? "bottom" : "top",
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const idleClass =
    tone === "edit"
      ? "border border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800"
      : tone === "receipt"
        ? "border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600"
        : tone === "writeoff"
          ? "border border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:text-red-600"
          : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800";

  const activeClass =
    tone === "edit"
      ? "bg-slate-800 text-white border-slate-800"
      : tone === "receipt"
        ? "bg-orange-500 text-white border-orange-500"
        : tone === "writeoff"
          ? "bg-red-500 text-white border-red-500"
          : "bg-slate-900 text-white border-slate-900";

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => {
        if (!disabled) {
          setOpen(true);
        }
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        if (!disabled) {
          setOpen(true);
        }
      }}
      onBlur={() => setOpen(false)}
      className={`group relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
        active ? activeClass : idleClass
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className="pointer-events-none">{children}</span>
      <span className="sr-only">{label}</span>
      {mounted &&
        open &&
        createPortal(
          <span
            ref={tooltipRef}
            className="pointer-events-none fixed z-[100] whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-medium text-white shadow-lg"
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            {label}
            <span
              className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-950 ${
                position.side === "top" ? "top-full -mt-1" : "bottom-full -mb-1"
              }`}
            />
          </span>,
          document.body
        )}
    </button>
  );
}
