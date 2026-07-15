"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import styles from "../auth.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/auth-api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось выполнить вход");

      const nextPath = new URLSearchParams(window.location.search).get("next") || "/";
      router.replace(nextPath);
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Не удалось выполнить вход");
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />
      <section className={styles.shell} aria-label="Вход в HardZone CRM">
        <div className={styles.logoWrap}>
          <div className={styles.logoHalo} aria-hidden="true" />
          <Image className={styles.logo} src="/hardzone-auth-logo.png" alt="HardZone" width={184} height={152} priority />
        </div>
        <div className={styles.card}>
          <div className={styles.eyebrow}><span /> HARDZONE CRM</div>
          <h1>Вход для команды</h1>
          <p className={styles.lead}>Всё для работы клуба — в одной зоне.</p>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label>
              <span>Email или логин</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="name@hardzone.space" required />
            </label>
            <label>
              <span>Пароль</span>
              <div className={styles.passwordField}>
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Введите пароль" required />
                <button className={styles.eyeButton} type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} aria-pressed={showPassword}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12S6.8 6.7 12 6.7 20.5 12 20.5 12 17.2 17.3 12 17.3 3.5 12 3.5 12z" /><circle cx="12" cy="12" r="2.4" />{showPassword ? <path d="M4 4l16 16" /> : null}</svg>
                </button>
              </div>
            </label>
            {error ? <div className={styles.errorPanel} role="alert">{error}</div> : null}
            <button className={`${styles.submit} ${submitting ? styles.opening : ""}`} type="submit" disabled={submitting}>
              <span className={styles.buttonLabel}>{submitting ? "Открываем CRM…" : "Войти в CRM"}</span>
              <span className={styles.gate} aria-hidden="true"><i className={styles.gateLeft} /><i className={styles.gateRight} /><b className={styles.person}><em /><i /></b><span className={styles.arrow}>→</span></span>
            </button>
          </form>
          <Link className={styles.reset} href="/reset-password">Забыли пароль?</Link>
        </div>
      </section>
    </main>
  );
}
