"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/auth-api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Не удалось выполнить вход");
      }

      const nextPath =
        (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null) || "/";
      router.replace(nextPath);
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Не удалось выполнить вход");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D1117] px-6 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--line-soft)] bg-[rgba(18,24,37,0.96)] p-8 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">HardZone CRM</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-main)]">Вход сотрудника</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
            Для входа используйте электронную почту сотрудника и его текущий пароль.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Email</span>
            <input
              type="text"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="you@hardzone.ru"
              className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Для сотрудников логином является email. Для старой главной учётки временно ещё работает логин `admin`.
            </p>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-[rgba(255,107,107,0.28)] bg-[rgba(255,107,107,0.08)] px-4 py-3 text-sm text-[#ffb4b4]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#04120f] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Проверяем доступ..." : "Войти"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/reset-password" className="text-sm font-medium text-[var(--accent)] hover:brightness-110">
            Забыли пароль?
          </Link>
        </div>
      </div>
    </div>
  );
}
