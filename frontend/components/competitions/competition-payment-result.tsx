"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
    let attempt = 0;

    const load = async (sync: boolean) => {
      try {
        const response = await fetch(
          `/api/public/competition/registrations/${encodeURIComponent(token)}/payment${sync ? "?sync=1" : ""}`,
          { cache: "no-store" }
        );
        const data = (await response.json()) as { data?: PaymentSummary; error?: string };
        if (!response.ok || !data.data) throw new Error(data.error || "Не удалось проверить оплату");
        if (cancelled) return;
        setSummary(data.data);
        setError("");
        setLoading(false);

        if (["pending", "processing"].includes(data.data.payment_status) && attempt < 8) {
          attempt += 1;
          timer = setTimeout(() => void load(false), 2000);
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
  const failed = summary?.payment_status === "failed" || summary?.payment_status === "refunded";

  return (
    <main className={`${styles.page} ${styles.paymentPage}`}>
      <section className={styles.registration}>
        <div className={styles.success} role="status">
          <span className={styles.successMark} aria-hidden="true">{paid ? "✓" : failed ? "!" : "…"}</span>
          <h1>{paid ? "Оплата прошла" : failed ? "Оплата не завершена" : "Проверяем оплату"}</h1>
          {loading && <p>Получаем подтверждение от Т‑Банка…</p>}
          {!loading && paid && <p>Регистрация команды подтверждена. Увидимся 10 октября в HardZone.</p>}
          {!loading && failed && <p>Деньги не списаны или платёж был возвращён. Можно открыть оплату ещё раз.</p>}
          {!loading && !paid && !failed && <p>Банку может понадобиться несколько секунд. Эта страница обновится автоматически.</p>}
          {summary && (
            <strong>{summary.team_name} · {categoryLabels[summary.category]}</strong>
          )}
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.paymentActions}>
            {paid && summary?.chat_url && (
              <a className={styles.chatLink} href={summary.chat_url} target="_blank" rel="noreferrer">
                Вступить в чат категории ↗
              </a>
            )}
            {!paid && !loading && publicToken && (
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
