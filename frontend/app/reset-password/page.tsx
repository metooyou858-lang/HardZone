"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import styles from "../auth.module.css";

type ResetUser = { id: number; name: string; username: string; email: string | null };

function EyeButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button className={styles.eyeButton} type="button" onClick={onToggle} aria-label={visible ? "Скрыть пароль" : "Показать пароль"} aria-pressed={visible}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12S6.8 6.7 12 6.7 20.5 12 20.5 12 17.2 17.3 12 17.3 3.5 12 3.5 12z" /><circle cx="12" cy="12" r="2.4" />{visible ? <path d="M4 4l16 16" /> : null}</svg>
    </button>
  );
}

function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/auth-api/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось отправить ссылку");
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось отправить ссылку");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return <div className={styles.successPanel} role="status"><span className={styles.successMark}>✓</span><strong>Проверьте почту</strong><p>Если сотрудник с таким email существует, ссылка для создания нового пароля уже отправлена.</p><Link className={styles.reset} href="/login">Вернуться ко входу</Link></div>;
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <label><span>Email сотрудника</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@hardzone.space" required /></label>
      {error ? <div className={styles.errorPanel} role="alert">{error}</div> : null}
      <button className={styles.submit} type="submit" disabled={submitting}><span className={styles.buttonLabel}>{submitting ? "Отправляем…" : "Получить ссылку"}</span><span className={styles.mailIcon} aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></svg></span></button>
    </form>
  );
}

function SetPasswordForm({ token }: { token: string }) {
  const [user, setUser] = useState<ResetUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/auth-api/password-reset?token=${encodeURIComponent(token)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => { const data = (await response.json()) as { error?: string; data?: { user?: ResetUser } }; if (!response.ok || !data.data?.user) throw new Error(data.error || "Ссылка недействительна или истекла"); if (!cancelled) setUser(data.data.user); })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Ссылка недействительна или истекла"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) return setError("Пароль должен быть не короче 8 символов");
    if (password !== repeat) return setError("Пароли не совпадают");
    setSubmitting(true);
    try {
      const response = await fetch("/auth-api/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить пароль");
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить пароль");
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className={styles.statusPanel}>Проверяем ссылку восстановления…</div>;
  if (done) return <div className={styles.successPanel} role="status"><span className={styles.successMark}>✓</span><strong>Пароль обновлён</strong><p>Теперь можно войти в CRM с новым паролем.</p><Link className={styles.reset} href="/login">Перейти ко входу</Link></div>;
  if (!user) return <div className={styles.errorPanel} role="alert">{error}</div>;

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.userPanel}><strong>{user.name}</strong><span>{user.email || user.username}</span></div>
      <label><span>Новый пароль</span><div className={styles.passwordField}><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Не менее 8 символов" required /><EyeButton visible={showPassword} onToggle={() => setShowPassword((value) => !value)} /></div></label>
      <label><span>Повторите пароль</span><div className={styles.passwordField}><input type={showRepeat ? "text" : "password"} value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" placeholder="Повторите новый пароль" required /><EyeButton visible={showRepeat} onToggle={() => setShowRepeat((value) => !value)} /></div></label>
      {error ? <div className={styles.errorPanel} role="alert">{error}</div> : null}
      <button className={styles.submit} type="submit" disabled={submitting}><span className={styles.buttonLabel}>{submitting ? "Сохраняем…" : "Сохранить пароль"}</span><span className={styles.mailIcon} aria-hidden="true">✓</span></button>
    </form>
  );
}

function ResetContent() {
  const token = useSearchParams().get("token")?.trim() || "";
  return <><div className={styles.eyebrow}><span /> HARDZONE CRM</div><h1>{token ? "Новый пароль" : "Восстановление доступа"}</h1><p className={`${styles.lead} ${styles.resetLead}`}>{token ? "Задайте новый пароль для своей учётной записи." : "Укажите рабочий email — мы отправим одноразовую ссылку для создания нового пароля."}</p>{token ? <SetPasswordForm token={token} /> : <RequestResetForm />}</>;
}

export default function ResetPasswordPage() {
  return <main className={styles.page}><div className={styles.grid} aria-hidden="true" /><div className={styles.glowOne} aria-hidden="true" /><div className={styles.glowTwo} aria-hidden="true" /><section className={styles.shell} aria-label="Восстановление доступа HardZone CRM"><div className={styles.logoWrap}><div className={styles.logoHalo} aria-hidden="true" /><Image className={styles.logo} src="/hardzone-auth-logo.png" alt="HardZone" width={184} height={152} priority /></div><div className={`${styles.card} ${styles.resetCard}`}><Link className={styles.backLink} href="/login">← К экрану входа</Link><Suspense fallback={<div className={styles.statusPanel}>Готовим форму…</div>}><ResetContent /></Suspense></div></section></main>;
}
