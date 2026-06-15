"use client";

import { useState } from "react";

import { useTrainingTypes } from "@/hooks/useTrainingTypes";
import { ApiError } from "@/lib/api/client";
import { TrainingType, TrainingTypeUsage } from "@/lib/api/training-types";

const inputCls =
  "w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const labelCls = "text-xs font-medium uppercase tracking-wider text-slate-400";

type TrainingTypeFormState = {
  name: string;
  slot_type: "group" | "personal";
  color: string;
  duration: string;
  capacity: string;
  description: string;
  audience: string;
  location: string;
  booking_note: string;
  tags: string;
  is_active: boolean;
};

function toFormState(item?: TrainingType): TrainingTypeFormState {
  return {
    name: item?.name ?? "",
    slot_type: item?.slot_type === "personal" ? "personal" : "group",
    color: item?.color ?? "#00BCD4",
    duration: item?.duration ? String(item.duration) : "",
    capacity: item?.capacity ? String(item.capacity) : "",
    description: item?.description ?? "",
    audience: item?.audience ?? "",
    location: item?.location ?? "",
    booking_note: item?.booking_note ?? "",
    tags: (item?.tags ?? []).join(", "),
    is_active: item?.is_active ?? true,
  };
}

function getTrainingTypeUsageParts(usage: TrainingTypeUsage) {
  return [
    usage.products ? `${usage.products} услуг/абонементов` : null,
    usage.trainers ? `${usage.trainers} тренеров` : null,
    usage.schedule_templates ? `${usage.schedule_templates} шаблонов расписания` : null,
    usage.schedule_slots ? `${usage.schedule_slots} занятий в расписании` : null,
  ].filter(Boolean);
}

function getTrainingTypeUsageFromError(error: unknown): TrainingTypeUsage | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }

  const data = error.data as { code?: string; data?: { usage?: TrainingTypeUsage } } | null;
  return data?.code === "training_type_in_use" ? data.data?.usage ?? null : null;
}

function TrainingTypeForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: TrainingType;
  saving: boolean;
  onSave: (data: TrainingTypeFormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TrainingTypeFormState>(toFormState(initial));

  return (
    <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/50 p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_140px]">
        <div>
          <label className={labelCls}>Название *</label>
          <input
            type="text"
            value={form.name}
            onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            placeholder="Например: CrossFit"
            className={`mt-1 ${inputCls}`}
            autoFocus
          />
        </div>

        <div>
          <label className={labelCls}>Цвет</label>
          <div className="mt-1 flex items-center gap-3 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2">
            <input
              type="color"
              value={form.color}
              onChange={(event) => setForm((previous) => ({ ...previous, color: event.target.value }))}
              className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="text-sm text-slate-300">{form.color}</span>
          </div>
        </div>
      </div>

      <div>
        <label className={labelCls}>Тип тренировки</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([
            { value: "group", label: "Групповая" },
            { value: "personal", label: "Персональная" },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setForm((previous) => ({ ...previous, slot_type: option.value }))}
              className={`rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                form.slot_type === option.value
                  ? "border-teal-500 bg-teal-500/15 text-teal-300"
                  : "border-slate-600 text-slate-300 hover:border-teal-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Длительность, минут</label>
          <input
            type="number"
            min="0"
            value={form.duration}
            onChange={(event) => setForm((previous) => ({ ...previous, duration: event.target.value }))}
            className={`mt-1 ${inputCls}`}
            placeholder="60"
          />
        </div>

        <div>
          <label className={labelCls}>Вместимость</label>
          <input
            type="number"
            min="0"
            value={form.capacity}
            onChange={(event) => setForm((previous) => ({ ...previous, capacity: event.target.value }))}
            className={`mt-1 ${inputCls}`}
            placeholder={form.slot_type === "personal" ? "1 или 2" : "20"}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Описание</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
          className={`mt-1 ${inputCls} resize-none`}
          placeholder="Короткое описание вида тренировки"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Для кого</label>
          <input
            type="text"
            value={form.audience}
            onChange={(event) => setForm((previous) => ({ ...previous, audience: event.target.value }))}
            className={`mt-1 ${inputCls}`}
            placeholder="Детская, 7-13 лет"
          />
        </div>
        <div>
          <label className={labelCls}>Зал / место</label>
          <input
            type="text"
            value={form.location}
            onChange={(event) => setForm((previous) => ({ ...previous, location: event.target.value }))}
            className={`mt-1 ${inputCls}`}
            placeholder="Большой зал"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Правило записи</label>
        <input
          type="text"
          value={form.booking_note}
          onChange={(event) => setForm((previous) => ({ ...previous, booking_note: event.target.value }))}
          className={`mt-1 ${inputCls}`}
          placeholder="По записи"
        />
      </div>

      <div>
        <label className={labelCls}>Теги</label>
        <input
          type="text"
          value={form.tags}
          onChange={(event) => setForm((previous) => ({ ...previous, tags: event.target.value }))}
          className={`mt-1 ${inputCls}`}
          placeholder="детская, функциональные, большой зал"
        />
      </div>

      <label className="flex items-center gap-3 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(event) => setForm((previous) => ({ ...previous, is_active: event.target.checked }))}
          className="h-4 w-4 rounded border-slate-600"
        />
        Активен
      </label>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          className="rounded-xl bg-teal-500 px-5 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
        >
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-xl border border-slate-600 px-5 py-2 text-sm text-slate-400 hover:bg-slate-700"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

export function TrainingTypesManager({ onClose }: { onClose: () => void }) {
  const { trainingTypes, loading, error, create, update, remove } = useTrainingTypes();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleCreate(form: TrainingTypeFormState) {
    setSaving(true);
    setActionError(null);

    try {
      await create({
        name: form.name.trim(),
        slot_type: form.slot_type,
        color: form.color,
        duration: form.duration ? Number.parseInt(form.duration, 10) : null,
        capacity: form.capacity ? Number.parseInt(form.capacity, 10) : null,
        description: form.description.trim() || null,
        audience: form.audience.trim() || null,
        location: form.location.trim() || null,
        booking_note: form.booking_note.trim() || null,
        tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
      });
      setShowCreate(false);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, form: TrainingTypeFormState) {
    setSaving(true);
    setActionError(null);

    try {
      await update(id, {
        name: form.name.trim(),
        slot_type: form.slot_type,
        color: form.color,
        duration: form.duration ? Number.parseInt(form.duration, 10) : null,
        capacity: form.capacity ? Number.parseInt(form.capacity, 10) : null,
        description: form.description.trim() || null,
        audience: form.audience.trim() || null,
        location: form.location.trim() || null,
        booking_note: form.booking_note.trim() || null,
        tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
        is_active: form.is_active,
      });
      setEditId(null);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: TrainingType) {
    setActionError(null);

    if (!window.confirm(`Удалить тип тренировки "${item.name}"?`)) {
      return;
    }

    try {
      await remove(item.id);
    } catch (error: unknown) {
      const usage = getTrainingTypeUsageFromError(error);

      if (usage) {
        const usageText = getTrainingTypeUsageParts(usage).join(", ");
        const confirmed = window.confirm(
          `Тип тренировки "${item.name}" используется: ${usageText}.\n\n` +
            "При удалении тип будет отвязан от услуг, тренеров, шаблонов и занятий. " +
            "Сами услуги, тренеры, занятия и записи клиентов останутся.\n\n" +
            "Удалить и отвязать связи?"
        );

        if (!confirmed) {
          return;
        }

        try {
          await remove(item.id, { force: true });
          return;
        } catch (forceError: unknown) {
          setActionError(forceError instanceof Error ? forceError.message : "Ошибка");
          return;
        }
      }

      setActionError(error instanceof Error ? error.message : "Ошибка");
    }
  }

  return (
    <div className="max-w-3xl space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-100">Виды тренировок</p>
          <p className="mt-0.5 text-xs text-slate-400">Управляйте списком тренировок для услуг и абонементов</p>
        </div>
        <button onClick={onClose} className="text-lg text-slate-500 hover:text-slate-300">
          ✕
        </button>
      </div>

      {(actionError || error) && (
        <div className="rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-400">
          {actionError ?? error}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500">Загрузка...</div>
      ) : (
        <div className="space-y-2">
          {trainingTypes.map((item) => (
            <div key={item.id}>
              {editId === item.id ? (
                <TrainingTypeForm
                  initial={item}
                  saving={saving}
                  onSave={(form) => handleUpdate(item.id, form)}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
                  <div
                    className="h-4 w-4 shrink-0 rounded-full border border-white/10"
                    style={{ backgroundColor: item.color ?? "#00BCD4" }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{item.name}</p>
                      {!item.is_active && (
                        <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                          неактивен
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-400">
                      {[
                        item.slot_type === "personal" ? "Персональная" : "Групповая",
                        item.duration ? `${item.duration} мин` : "Без длительности",
                        item.capacity ? `${item.capacity} мест` : "Без лимита мест",
                      ].map((label) => (
                        <span key={label} className="rounded-full bg-slate-900/50 px-2 py-0.5">
                          {label}
                        </span>
                      ))}
                    </div>

                    {item.description && <p className="mt-1 text-xs text-slate-500">{item.description}</p>}
                    {(item.audience || item.location || item.booking_note || Boolean(item.tags?.length)) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[item.audience, item.location, item.booking_note, ...(item.tags ?? [])].filter(Boolean).map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setEditId(item.id)}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-700"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => {
                        void handleDelete(item);
                      }}
                      className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-500 hover:bg-red-950"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <TrainingTypeForm saving={saving} onSave={handleCreate} onCancel={() => setShowCreate(false)} />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full rounded-xl border border-dashed border-slate-600 py-3 text-sm text-slate-400 transition-colors hover:border-teal-500 hover:text-teal-400"
        >
          + Добавить вид тренировки
        </button>
      )}
    </div>
  );
}
