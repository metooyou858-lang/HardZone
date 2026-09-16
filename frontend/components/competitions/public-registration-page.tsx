"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import styles from "@/app/competition/competition.module.css";
import type { CompetitionCategory, CompetitionPublicConfig } from "@/lib/api/competitions";

type FormState = {
  team_name: string;
  team_email: string;
  category: CompetitionCategory;
  male_name: string;
  male_phone: string;
  female_name: string;
  female_phone: string;
  terms_accepted: boolean;
  personal_data_accepted: boolean;
  website: string;
};

type SubmittedTeam = {
  name: string;
  category: CompetitionCategory;
  publicToken: string;
  paymentRequired: boolean;
  paymentError?: string;
};

const initialForm: FormState = {
  team_name: "",
  team_email: "",
  category: "amateur",
  male_name: "",
  male_phone: "",
  female_name: "",
  female_phone: "",
  terms_accepted: false,
  personal_data_accepted: false,
  website: "",
};

function formatCompetitionDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export default function CompetitionRegistrationPage() {
  const router = useRouter();
  const [config, setConfig] = useState<CompetitionPublicConfig | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submittedTeam, setSubmittedTeam] = useState<SubmittedTeam | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const eventKey = new URLSearchParams(window.location.search).get("event");
        const response = await fetch(`/api/public/competition${eventKey ? `?event=${encodeURIComponent(eventKey)}` : ""}`, { cache: "no-store" });
        const data = (await response.json()) as { data?: CompetitionPublicConfig; error?: string };
        if (!response.ok || !data.data) throw new Error(data.error || "Не удалось загрузить регистрацию");
        if (!cancelled) {
          setConfig(data.data);
          setForm(current => ({ ...current, category: data.data!.categories[0]?.key || "" }));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить регистрацию");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePhone(key: "male_phone" | "female_phone", event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    let digits = input.value.replace(/\D/g, "");
    let before = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length;
    const operation = (event.nativeEvent as InputEvent).inputType;
    // Deleting a separator must delete a digit instead of trapping the cursor.
    if (digits === form[key].replace(/\D/g, "") && operation?.startsWith("delete")) {
      const index = operation === "deleteContentBackward" ? before - 1 : before;
      if (index >= 0) digits = digits.slice(0, index) + digits.slice(index + 1);
      if (operation === "deleteContentBackward") before = Math.max(0, before - 1);
    }
    if (digits && !/^[78]/.test(digits)) { digits = `7${digits}`; before++; }
    digits = digits.replace(/^8/, "7").slice(0, 11);
    const national = digits.slice(1);
    const value = digits ? "+7" + (national ? ` ${national.slice(0, 3)}` : "") + (national.length > 3 ? ` ${national.slice(3, 6)}` : "") + (national.length > 6 ? `-${national.slice(6, 8)}` : "") + (national.length > 8 ? `-${national.slice(8, 10)}` : "") : "";
    update(key, value);
    let caret = 0, seen = 0;
    while (caret < value.length && seen < before) { if (/\d/.test(value[caret])) seen++; caret++; }
    requestAnimationFrame(() => input.setSelectionRange(caret, caret));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config?.registration_enabled || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/public/competition/registrations?event=${encodeURIComponent(config.event_key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        data?: {
          registration: { public_token: string };
          payment_url: string | null;
          payment_error?: string;
          already_paid?: boolean;
        };
        error?: string;
      };
      if (!response.ok || !data.data) throw new Error(data.error || "Не удалось отправить заявку");
      if (data.data.already_paid) {
        router.push(`/competition/payment?registration=${encodeURIComponent(data.data.registration.public_token)}`);
        return;
      }
      if (data.data.payment_url) {
        window.location.assign(data.data.payment_url);
        return;
      }
      setSubmittedTeam({
        name: form.team_name.trim(),
        category: form.category,
        publicToken: data.data.registration.public_token,
        paymentRequired: Boolean(config.payment_enabled),
        paymentError: data.data.payment_error,
      });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  }

  async function retryPayment() {
    if (!submittedTeam || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/public/competition/registrations/${encodeURIComponent(submittedTeam.publicToken)}/payment`, {
        method: "POST",
      });
      const data = (await response.json()) as { data?: { payment_url: string | null; already_paid?: boolean }; error?: string };
      if (!response.ok || !data.data) throw new Error(data.error || "Не удалось открыть оплату");
      if (data.data.already_paid) {
        router.push(`/competition/payment?registration=${encodeURIComponent(submittedTeam.publicToken)}`);
        return;
      }
      if (!data.data.payment_url) throw new Error("Т-Банк не вернул ссылку на оплату");
      window.location.assign(data.data.payment_url);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Не удалось открыть оплату");
    } finally {
      setSubmitting(false);
    }
  }

  const date = formatCompetitionDate(config?.date ?? "2026-10-10");
  const fee = new Intl.NumberFormat("ru-RU").format(config?.fee_rubles ?? 3500);
  const formDisabled = loading || !config?.registration_enabled;
  const chatUrl = submittedTeam ? config?.chat_urls[submittedTeam.category] : null;
  const organizer = config?.organizer;
  const categoryLabels = Object.fromEntries((config?.categories || []).map(item => [item.key, item.name]));
  const privacyPath = config?.legacy ? "/competition/privacy" : `/competition/privacy?event=${encodeURIComponent(config?.event_key || "")}`;

  if (loading || !config) return <main className={styles.documentPage}><div className={styles.documentShell} role={error ? "alert" : "status"}>{error || "Загружаем мероприятие…"}</div></main>;

  return (
    <main className={styles.page}>
      {config.legacy ? <section className={styles.poster} aria-labelledby="competition-title">
        <div className={styles.posterShade} aria-hidden="true" />
        <div className={styles.posterContent}>
          <div className={styles.posterTitle}>
            <span className={styles.date}>{date}</span>
            <h1 id="competition-title">Командные<br />соревнования</h1>
            <p>Команды М + Ж</p>
          </div>

          <div className={styles.posterFacts}>
            <div>
              <strong>{fee} ₽</strong>
              <span>взнос с команды</span>
            </div>
            <div>
              <strong>2 категории</strong>
              <span>Любители / Продвинутые</span>
            </div>
          </div>

          <div className={styles.posterFooter}>
            <address>{config?.location || "Клуб HardZone, г. Хабаровск, ул. Тихоокеанская, 47Г"}</address>
            <a href="#competition-terms">Условия участия ↓</a>
          </div>
        </div>
      </section> : <header className={styles.eventHeader}>
        <span className={styles.date}>HARDZONE · {date}</span><h1 id="competition-title">{config.name}</h1>
        <p>{config.location}</p><p>Команды М + Ж · {fee} ₽ с команды</p>
        <a href="#registration-title">Перейти к регистрации ↓</a>
      </header>}

      <section className={styles.registration} aria-labelledby="registration-title">
        {submittedTeam ? (
          <div className={styles.success} role="status">
            <span className={styles.successMark} aria-hidden="true">{submittedTeam.paymentRequired ? "→" : "✓"}</span>
            <h2>{submittedTeam.paymentRequired ? "Заявка сохранена" : "Команда зарегистрирована"}</h2>
            <p>{submittedTeam.paymentRequired
              ? submittedTeam.paymentError || "Для завершения регистрации нужно оплатить организационный взнос."
              : "Заявка принята. Организатор увидит её во внутреннем разделе соревнований."}</p>
            <strong>{submittedTeam.name}</strong>
            {submittedTeam.paymentRequired && (
              <button className={styles.submit} type="button" disabled={submitting} onClick={() => void retryPayment()}>
                {submitting ? "Открываем оплату…" : `Оплатить ${fee} ₽`}
              </button>
            )}
            {!submittedTeam.paymentRequired && chatUrl && (
              <a className={styles.chatLink} href={chatUrl} target="_blank" rel="noreferrer">
                Вступить в чат категории «{categoryLabels[submittedTeam.category]}» ↗
              </a>
            )}
          </div>
        ) : (
          <div className={styles.formWrap}>
            {!loading && !config?.registration_enabled && (
              <div className={styles.closedNotice}>
                <strong>Приём заявок временно закрыт</strong>
                <span>Дата открытия появится на этой странице.</span>
              </div>
            )}
            <section className={styles.terms} id="competition-terms" aria-labelledby="competition-terms-title">
              <div className={styles.termsHeading}>
                <span>До подачи заявки</span>
                <h3 id="competition-terms-title">Условия проведения</h3>
                {config.legacy && <p>Комплексы объявим отдельно. Ниже — базовые ограничения по весам и сложности упражнений.</p>}
              </div>

              {config.legacy ? <>
              <details className={styles.categoryTerms}>
                <summary><strong>Любители</strong><span>Посмотреть упражнения</span></summary>
                <div className={styles.categoryBody}>
                  <div>
                    <h4>Мужчины</h4>
                    <ul>
                      <li>Штанга: выпады — до 40 кг; становая тяга и приседания — до 70 кг.</li>
                      <li>Гири и гантели — не более 16 кг: махи, рывки, толчки, приседания и выпады.</li>
                      <li>Гимнастика: отжимания от пола, подтягивания любым способом, подъёмы на пресс.</li>
                      <li>Моноциклические упражнения: прыжки на скакалке одинарные, крестом и назад; бег, гребля, велобайк.</li>
                    </ul>
                  </div>
                  <div>
                    <h4>Женщины</h4>
                    <ul>
                      <li>Штанга: выпады — до 15 кг; становая тяга и приседания — до 30 кг.</li>
                      <li>Гири и гантели — не более 12 кг: махи, рывки, толчки, приседания и выпады.</li>
                      <li>Моноциклические упражнения: прыжки на скакалке одинарные, крестом и назад; бег, гребля, велобайк.</li>
                    </ul>
                  </div>
                </div>
              </details>

              <details className={styles.categoryTerms}>
                <summary><strong>Продвинутые</strong><span>Посмотреть упражнения</span></summary>
                <div className={styles.categoryBody}>
                  <div>
                    <h4>Мужчины</h4>
                    <ul>
                      <li>Штанга: становая тяга и приседания — до 90 кг; подъём на грудь и выпады — до 60 кг; рывок — до 40 кг.</li>
                      <li>Гиря — до 24 кг, гантели — до 22,5 кг: махи, рывки, толчки, приседания и выпады с отягощением над головой.</li>
                      <li>Гимнастика и плиометрика: отжимания, строгие подтягивания, подъём по канату, носки к перекладине, подъёмы на пресс, прыжки через тумбу.</li>
                      <li>Моноциклические упражнения: все вариации прыжков на скакалке, бег, гребля, велобайк.</li>
                    </ul>
                  </div>
                  <div>
                    <h4>Женщины</h4>
                    <ul>
                      <li>Штанга: становая тяга и приседания — до 50 кг; подъём на грудь и выпады — до 30 кг; рывок — до 20 кг.</li>
                      <li>Гиря — 16 кг, гантели — до 15 кг: махи, рывки, толчки, приседания и выпады с отягощением над головой.</li>
                      <li>Гимнастика и плиометрика: подтягивания любым способом, подъём по канату, носки к перекладине, подъёмы на пресс, прыжки через тумбу.</li>
                      <li>Моноциклические упражнения: все вариации прыжков на скакалке, бег, гребля, велобайк.</li>
                    </ul>
                  </div>
                </div>
              </details>

              <p className={styles.finalTerms}>На оплату заявки отводится 60 минут. Если оплата не подтверждена, заявка отменяется после контрольной проверки банка. При незавершённой проверке отмена откладывается.</p>
              <p className={styles.finalTerms}>В финальных комплексах допускается увеличение диапазона весов и сложности упражнений относительно базовых ограничений категорий.</p>
              </> : <>
                <p className={styles.finalTerms} style={{whiteSpace:"pre-wrap"}}>{config.terms_text}</p>
                <p className={styles.finalTerms}>На оплату заявки — 60 минут. Участие подтверждается автоматически после оплаты. Неоплаченная заявка отменяется после контрольной проверки банка.</p>
              </>}

              <div className={styles.refundTerms}>
                <h4>Изменение или отмена участия</h4>
                <p>Если команда не сможет принять участие в мероприятии, сообщите об этом организатору по адресу <a href="mailto:fast.alena1994@yandex.ru">fast.alena1994@yandex.ru</a> или телефону <a href="tel:+79842639783">+7 984 263-97-83</a>, указав название команды и контакт плательщика. Обращения рассматриваются индивидуально с учётом фактически понесённых организатором расходов и требований законодательства РФ.</p>
              </div>
            </section>

            <form className={styles.form} onSubmit={submit}>
              <div className={styles.formHeading}>
                <span>Регистрация</span>
                <h2 id="registration-title">Заявка команды</h2>
              </div>

              <label className={styles.honeypot} aria-hidden="true">
                Сайт
                <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} />
              </label>

              <div className={styles.formGroup}>
                <h3>Команда</h3>
                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>Название команды</span>
                    <input className={styles.input} disabled={formDisabled} required maxLength={120} value={form.team_name} onChange={(event) => update("team_name", event.target.value)} placeholder="Например, Стальные нервы" />
                  </label>
                  <label className={styles.field}>
                    <span>Категория</span>
                    <select className={styles.select} disabled={formDisabled} value={form.category} onChange={(event) => update("category", event.target.value as CompetitionCategory)}>
                      {config.categories.map(category => <option key={category.key} value={category.key}>{category.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.field}>
                  <span>Email команды</span>
                  <input className={styles.input} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={formDisabled} value={form.team_email} onChange={(event) => { event.target.setCustomValidity(""); update("team_email", event.target.value.replace(/\s/g, "")); }} onInvalid={(event) => event.currentTarget.setCustomValidity("Укажите email в формате name@example.ru")} onBlur={(event) => event.currentTarget.setCustomValidity(event.currentTarget.value && !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(event.currentTarget.value) ? "Укажите email в формате name@example.ru" : "")} placeholder="team@example.ru" />
                  <small>Пришлём ссылку на оплату и подтверждение участия. На оплату — 60 минут.</small>
                </label>
              </div>

              <div className={styles.formGroup}>
                <h3>Участники</h3>
                <div className={styles.participants}>
                  <div className={styles.participant}>
                    <h4>Мужчина</h4>
                    <label className={styles.field}>
                      <span>Имя и фамилия</span>
                      <input className={styles.input} disabled={formDisabled} required maxLength={160} autoComplete="name" value={form.male_name} onChange={(event) => update("male_name", event.target.value)} placeholder="Алексей Смирнов" />
                    </label>
                    <label className={styles.field}>
                      <span>Телефон</span>
                      <input className={styles.input} disabled={formDisabled} required type="tel" inputMode="tel" autoComplete="section-male tel" pattern={"\\+7 [0-9]{3} [0-9]{3}-[0-9]{2}-[0-9]{2}"} title="Введите номер полностью: +7 900 000-00-00" value={form.male_phone} onChange={(event) => updatePhone("male_phone", event)} placeholder="+7 900 000-00-00" />
                    </label>
                  </div>

                  <div className={styles.participant}>
                    <h4>Женщина</h4>
                    <label className={styles.field}>
                      <span>Имя и фамилия</span>
                      <input className={styles.input} disabled={formDisabled} required maxLength={160} autoComplete="name" value={form.female_name} onChange={(event) => update("female_name", event.target.value)} placeholder="Анна Смирнова" />
                    </label>
                    <label className={styles.field}>
                      <span>Телефон</span>
                      <input className={styles.input} disabled={formDisabled} required type="tel" inputMode="tel" autoComplete="section-female tel" pattern={"\\+7 [0-9]{3} [0-9]{3}-[0-9]{2}-[0-9]{2}"} title="Введите номер полностью: +7 900 000-00-00" value={form.female_phone} onChange={(event) => updatePhone("female_phone", event)} placeholder="+7 900 000-00-00" />
                    </label>
                  </div>
                </div>
              </div>

              <div className={styles.formGroup}>
                <h3>Согласия</h3>
                <div className={styles.consents}>
                  <label className={styles.consent}>
                    <input className={styles.checkbox} type="checkbox" disabled={formDisabled} required checked={form.terms_accepted} onChange={(event) => update("terms_accepted", event.target.checked)} />
                    <span>Я согласен с <a href="#competition-terms">условиями проведения мероприятия</a>.</span>
                  </label>
                  <label className={styles.consent}>
                    <input className={styles.checkbox} type="checkbox" disabled={formDisabled} required checked={form.personal_data_accepted} onChange={(event) => update("personal_data_accepted", event.target.checked)} />
                    <span>Я даю <Link href={privacyPath} target="_blank">согласие на обработку персональных данных</Link> для регистрации команды и служебных email-уведомлений о заявке и оплате и подтверждаю согласие второго участника на передачу его данных.</span>
                  </label>
                </div>
              </div>

              {error && <div className={styles.error} id="competition-registration-error" role="alert">{error}</div>}

              <div className={styles.actions}>
                <div>
                  <strong>{fee} ₽</strong>
                  <span>взнос с команды</span>
                </div>
                <button className={styles.submit} type="submit" disabled={formDisabled || submitting || !form.terms_accepted || !form.personal_data_accepted}>
                  {submitting ? "Создаём оплату…" : config?.payment_enabled ? "Перейти к оплате" : "Отправить заявку"}
                </button>
              </div>
            </form>
          </div>
        )}

        <footer className={styles.organizer}>
          <h2>Организатор</h2>
          <p><strong>{organizer?.name || "ИП Фаст А. С."}</strong></p>
          <p>ИНН {organizer?.inn || "271702687700"} · ОГРНИП {organizer?.ogrnip || "325270000031829"}</p>
          <p>{organizer?.registration_address || "Хабаровский край, г. Хабаровск, пер. Трубный, д. 17, кв. 193"}</p>
          <p><a href={`tel:+${(organizer?.phone || "+7 984 263-97-83").replace(/\D/g, "")}`}>{organizer?.phone || "+7 984 263-97-83"}</a> · <a href={`mailto:${organizer?.email || "fast.alena1994@yandex.ru"}`}>{organizer?.email || "fast.alena1994@yandex.ru"}</a></p>
          <Link href={privacyPath}>Обработка персональных данных</Link>
        </footer>
      </section>
    </main>
  );
}
