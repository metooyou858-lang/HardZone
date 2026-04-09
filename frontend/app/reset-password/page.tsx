"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";

type ResetUser = {
  id: number;
  name: string;
  username: string;
  email: string | null;
};

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/auth-api/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Не удалось отправить новый пароль");
      }

      setSuccess(
        "Если сотрудник с таким email существует, на эту почту отправлен новый временный пароль. После входа его лучше сразу сменить."
      );
      setEmail("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось отправить новый пароль");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-8">
        <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
          HardZone CRM
        </p>
        <h1 className="mt-3 font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)]">
          Восстановление доступа
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
          Введите email сотрудника. Система сгенерирует новый временный пароль и отправит его на эту почту.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Email сотрудника</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
            placeholder="you@hardzone.ru"
          />
        </label>

        {error ? (
          <div className="rounded-2xl border border-[rgba(255,107,107,0.28)] bg-[rgba(255,107,107,0.08)] px-4 py-3 text-sm text-[#ffb4b4]">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.08)] px-4 py-3 text-sm text-[var(--text-main)]">
            {success}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#04120f] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Готовим пароль..." : "Отправить новый пароль"}
          </button>
          <Link
            href="/login"
            className="inline-flex items-center rounded-2xl border border-[var(--line-soft)] px-4 py-3 text-sm font-medium text-[var(--text-main)] transition hover:border-[rgba(0,191,165,0.24)] hover:text-[var(--accent)]"
          >
            К входу
          </Link>
        </div>
      </form>
    </>
  );
}

function TokenResetForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [user, setUser] = useState<ResetUser | null>(null);
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");

  const canSubmit = useMemo(
    () => Boolean(user && password.trim() && passwordRepeat.trim() && !submitting),
    [password, passwordRepeat, submitting, user]
  );

  useEffect(() => {
    let cancelled = false;

    fetch(`/auth-api/password-reset?token=${encodeURIComponent(token)}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          error?: string;
          data?: { user?: ResetUser };
        };

        if (!response.ok || !data.data?.user) {
          throw new Error(data.error || "Ссылка восстановления недействительна");
        }

        if (!cancelled) {
          setUser(data.data.user);
          setError("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Ссылка восстановления недействительна");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      if (password.trim().length < 8) {
        throw new Error("Пароль должен быть не короче 8 символов");
      }

      if (password !== passwordRepeat) {
        throw new Error("Пароли не совпадают");
      }

      const response = await fetch("/auth-api/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Не удалось изменить пароль");
      }

      setSuccess("Пароль обновлён. Теперь можно войти в CRM под своей учётной записью.");
      setPassword("");
      setPasswordRepeat("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось изменить пароль");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-4 text-sm text-[var(--text-muted)]">
        Проверяем ссылку восстановления...
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
          HardZone CRM
        </p>
        <h1 className="mt-3 font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)]">
          Смена пароля сотрудника
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
          Одноразовая ссылка позволяет сотруднику самостоятельно задать новый пароль.
        </p>
      </div>

      {user ? (
        <div className="mb-5 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-4 py-4 text-sm text-[var(--text-main)]">
          <p className="font-medium">{user.name}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{user.email || user.username}</p>
        </div>
      ) : null}

      {error && !user ? (
        <div className="rounded-2xl border border-[rgba(255,107,107,0.28)] bg-[rgba(255,107,107,0.08)] px-4 py-4 text-sm text-[#ffb4b4]">
          {error}
        </div>
      ) : null}

      {user ? (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Новый пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Повторите пароль</span>
            <input
              type="password"
              value={passwordRepeat}
              onChange={(event) => setPasswordRepeat(event.target.value)}
              autoComplete="new-password"
              className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-[rgba(255,107,107,0.28)] bg-[rgba(255,107,107,0.08)] px-4 py-3 text-sm text-[#ffb4b4]">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.08)] px-4 py-3 text-sm text-[var(--text-main)]">
              {success}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#04120f] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Обновляем пароль..." : "Сохранить пароль"}
            </button>
            <Link
              href="/login"
              className="inline-flex items-center rounded-2xl border border-[var(--line-soft)] px-4 py-3 text-sm font-medium text-[var(--text-main)] transition hover:border-[rgba(0,191,165,0.24)] hover:text-[var(--accent)]"
            >
              К входу
            </Link>
          </div>
        </form>
      ) : null}
    </>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";

  return token ? <TokenResetForm token={token} /> : <ForgotPasswordForm />;
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(0,229,200,0.14),_transparent_28%),linear-gradient(180deg,#0D1117_0%,#111827_100%)] px-6 py-10">
      <div className="w-full max-w-lg rounded-[28px] border border-[var(--line-soft)] bg-[rgba(18,24,37,0.92)] p-8 shadow-[0_28px_90px_rgba(0,0,0,0.45)] backdrop-blur">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-4 text-sm text-[var(--text-muted)]">
              Готовим форму восстановления...
            </div>
          }
        >
          <ResetPasswordContent />
        </Suspense>
      </div>
    </div>
  );
}
