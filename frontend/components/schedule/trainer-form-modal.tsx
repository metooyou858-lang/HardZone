"use client";

import { useEffect, useState } from "react";

import { CloseIcon } from "@/components/schedule/schedule-shared";
import { inputCls, labelCls } from "@/components/warehouse/shared";
import { createTrainer, type Trainer, updateTrainer } from "@/lib/api/trainers";
import type { TrainingType } from "@/lib/api/training-types";
export function TrainerFormModal({
  trainer,
  trainingTypes,
  onClose,
  onSaved,
}: {
  trainer: Trainer | null;
  trainingTypes: TrainingType[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [firstName, setFirstName] = useState(trainer?.first_name ?? "");
  const [lastName, setLastName] = useState(trainer?.last_name ?? "");
  const [phone, setPhone] = useState(trainer?.phone ?? "");
  const [email, setEmail] = useState(trainer?.email ?? "");
  const [bio, setBio] = useState(trainer?.bio ?? "");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(trainer?.training_types.map((item) => item.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(trainer?.first_name ?? "");
    setLastName(trainer?.last_name ?? "");
    setPhone(trainer?.phone ?? "");
    setEmail(trainer?.email ?? "");
    setBio(trainer?.bio ?? "");
    setSelectedTypes(trainer?.training_types.map((item) => item.id) ?? []);
    setError(null);
  }, [trainer]);

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Укажите имя и фамилию тренера");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        bio: bio.trim() || null,
        training_type_ids: selectedTypes.map((value) => Number.parseInt(value, 10)),
      };

      if (trainer) {
        await updateTrainer(trainer.id, payload);
        onSaved("Тренер обновлён");
      } else {
        await createTrainer(payload);
        onSaved("Тренер создан");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить тренера");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.78)] px-4 py-8">
      <div className="w-full max-w-3xl rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="font-[family:var(--font-heading)] text-[1.9rem] font-semibold leading-none text-[var(--text-main)]">
              {trainer ? "Редактирование тренера" : "Новый тренер"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Контакты, био и виды тренировок</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--bg-card-soft)] text-[var(--text-muted)] shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-all hover:border-[rgba(255,255,255,0.14)] hover:text-[var(--text-main)]"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="max-w-2xl">
            <label className={labelCls}>Имя</label>
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={`mt-2 ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>Фамилия</label>
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} className={`mt-2 ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>Телефон</label>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} className={`mt-2 ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} className={`mt-2 ${inputCls}`} />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelCls}>Bio</label>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={4}
            className={`mt-2 ${inputCls} resize-none`}
          />
        </div>

        <div className="mt-4 rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
          <p className={labelCls}>Виды тренировок</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {trainingTypes.map((type) => {
              const selected = selectedTypes.includes(type.id);

              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() =>
                    setSelectedTypes((current) =>
                      selected ? current.filter((value) => value !== type.id) : [...current, type.id]
                    )
                  }
                  className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--line-soft)] text-[var(--text-main)] hover:border-[var(--accent)]"
                  }`}
                >
                  {type.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Сохраняем..." : trainer ? "Сохранить" : "Создать"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[18px] border border-[var(--line-soft)] px-5 py-3 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

