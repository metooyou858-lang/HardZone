"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import styles from "@/app/competition/competition.module.css";
import type { CompetitionCategory, CompetitionPaymentStatus } from "@/lib/api/competitions";

type PaymentSummary = {
  team_name: string;
  category: CompetitionCategory;
  registration_status: "registered" | "cancelled";
  payment_status: CompetitionPaymentStatus;
  paid_at: string | null;
  payment_url: string | null;
  chat_url: string | null;
  payment_deadline: string | null;
  expired_at: string | null;
  server_now: string;
  messenger_urls: { whatsapp: string; telegram: string } | null;
};

const categoryLabels: Record<CompetitionCategory, string> = {
  amateur: "Любители",
  advanced: "Продвинутые",
};

export default function CompetitionPaymentResult() {
  const [publicToken, setPublicToken] = useState("");
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const clockOffset = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + clockOffset.current), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("registration") || "";
    setPublicToken(token);
    if (!token) {
      setError("Не удалось определить заявку");
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;


    const load = async (sync: boolean) => {
      try {
        const response = await fetch(
          `/api/public/competition/registrations/${encodeURIComponent(token)}/payment${sync ? "?sync=1" : ""}`,
          { cache: "no-store" }
        );
        const data = (await response.json()) as { data?: PaymentSummary; error?: string };
        if (!response.ok || !data.data) throw new Error(data.error || "Не удалось проверить оплату");
        if (cancelled) return;
        clockOffset.current = Date.parse(data.data.server_now) - Date.now();
        setNow(Date.parse(data.data.server_now));
        setSummary(data.data);
        setError("");
        setLoading(false);

        if (!["paid", "refunded"].includes(data.data.payment_status) && data.data.registration_status === "registered") {
          timer = setTimeout(() => void load(false), 5000);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Не удалось проверить оплату");
        setLoading(false);
      }
    };

    void load(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function retryPayment() {
    if (!publicToken || retrying) return;
    setRetrying(true);
    setError("");
    try {
      const response = await fetch(`/api/public/competition/registrations/${encodeURIComponent(publicToken)}/payment`, {
        method: "POST",
      });
      const data = (await response.json()) as { data?: { payment_url: string | null; already_paid?: boolean }; error?: string };
      if (!response.ok || !data.data) throw new Error(data.error || "Не удалось открыть оплату");
      if (data.data.already_paid) {
        window.location.reload();
        return;
      }
      if (!data.data.payment_url) throw new Error("Т-Банк не вернул ссылку на оплату");
      window.location.assign(data.data.payment_url);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Не удалось открыть оплату");
    } finally {
      setRetrying(false);
    }
  }

  const paid = summary?.payment_status === "paid";
  const cancelled = summary?.registration_status === "cancelled";
  const refunded = summary?.payment_status === "refunded";
  const remaining = summary?.payment_deadline ? Math.max(0, Date.parse(summary.payment_deadline) - now) : null;
  const checking = remaining === 0 && !paid && !cancelled;
  const countdown = remaining === null ? null : `${Math.floor(remaining / 60000).toString().padStart(2, "0")}:${Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0")}`;

  return (
    <main className={`${styles.page} ${styles.paymentPage}`}>
      <section className={styles.registration}>
        <div className={styles.success} role="status">
          <span className={styles.successMark} aria-hidden="true">{paid ? "✓" : cancelled ? "!" : "…"}</span>
          <h1>{paid ? "Оплата прошла" : cancelled ? "Заявка отменена" : checking ? "Проверяем итог оплаты" : refunded ? "Платёж возвращён" : "Заявка принята"}</h1>
          {loading && <p>Получаем подтверждение от Т‑Банка…</p>}
          {!loading && paid && <p>Регистрация команды подтверждена. Увидимся 10 октября в HardZone.</p>}
          {!loading && cancelled && <p>{summary?.expired_at ? "Срок оплаты истёк. Вы можете подать новую заявку." : "Регистрация команды отменена."}</p>}
          {!loading && checking && <p>Срок оплаты истёк. Проверяем статус в банке; страница обновится автоматически. Если платёж ещё обрабатывается, дождёмся результата.</p>}
          {!loading && !paid && !cancelled && !checking && !refunded && <p>Для подтверждения участия оплатите взнос до окончания срока.</p>}
          {!paid && !cancelled && !refunded && remaining !== null && remaining > 0 && <p>Осталось на оплату: <strong style={{fontVariantNumeric:"tabular-nums"}}>{countdown}</strong><br /><small>До {new Intl.DateTimeFormat("ru-RU", {timeZone:"Asia/Vladivostok", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit"}).format(new Date(summary!.payment_deadline!))} по Хабаровску</small></p>}
          {summary && (
            <strong>{summary.team_name} · {categoryLabels[summary.category]}</strong>
          )}
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.paymentActions}>
            {paid && summary?.messenger_urls && (
              <>
                <a className={styles.chatLink} href={summary.messenger_urls.whatsapp} target="_blank" rel="noreferrer">Чат в WhatsApp ↗</a>
                <a className={styles.chatLink} href={summary.messenger_urls.telegram} target="_blank" rel="noreferrer">Чат в Telegram ↗</a>
              </>
            )}
            {!paid && !cancelled && !checking && !refunded && !loading && summary && publicToken && (
              <button className={styles.submit} type="button" disabled={retrying} onClick={() => void retryPayment()}>
                {retrying ? "Открываем оплату…" : "Перейти к оплате"}
              </button>
            )}
            <Link className={styles.secondaryLink} href="/competition">Вернуться к соревнованиям</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
