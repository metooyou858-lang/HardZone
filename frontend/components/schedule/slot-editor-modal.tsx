"use client";

import { useEffect, useState } from "react";

import {
  CloseIcon,
  type EntryMode,
  formatTime,
  getDayOfWeek,
  getMonthBounds,
  normalizeDateValue,
  parseIsoDate,
  PlusIcon,
  slotTypeOptions,
  type SlotEditorState,
  toIsoDate,
  weekdayOptions,
} from "@/components/schedule/schedule-shared";
import { inputCls, labelCls } from "@/components/warehouse/shared";
import type { Product } from "@/lib/api/products";
import {
  createScheduleSlot,
  createScheduleTemplate,
  generateScheduleTemplates,
  type SlotType,
  updateScheduleSlot,
} from "@/lib/api/schedule";
import type { Trainer } from "@/lib/api/trainers";
import type { TrainingType } from "@/lib/api/training-types";

export function SlotEditorModal({
  state,
  trainingTypes,
  trainers,
  services,
  onClose,
  onSaved,
}: {
  state: SlotEditorState;
  trainingTypes: TrainingType[];
  trainers: Trainer[];
  services: Product[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [slotType, setSlotType] = useState<SlotType>("group");
  const [trainingTypeId, setTrainingTypeId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [productId, setProductId] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [capacity, setCapacity] = useState("20");
  const [isFree, setIsFree] = useState(false);
  const [blockIfEmptyHours, setBlockIfEmptyHours] = useState("");
  const [comment, setComment] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("single");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) {
      return;
    }

    const slot = state.slot;
    const defaultDay = slot ? parseIsoDate(slot.date) : state.defaultDate;
    const defaultTime = slot ? formatTime(slot.start_time) : state.defaultTime;

    setSlotType(slot?.slot_type === "personal" ? "personal" : "group");
    setTrainingTypeId(slot?.training_type_id ?? "");
    setTrainerId(slot?.trainer_id ?? "");
    setProductId(slot?.product_id ?? "");
    setDateValue(slot ? normalizeDateValue(slot.date) : toIsoDate(defaultDay));
    setStartTime(defaultTime);
    setDurationMinutes(String(slot?.duration_minutes ?? 60));
    setCapacity(String(slot?.capacity ?? 20));
    setIsFree(Boolean(slot?.is_free));
    setBlockIfEmptyHours(slot?.block_if_empty_hours ? String(slot.block_if_empty_hours) : "");
    setComment(slot?.comment ?? "");
    setEntryMode("single");
    setRepeatDays([getDayOfWeek(defaultDay)]);
    setError(null);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [state, onClose]);

  if (!state) {
    return null;
  }

  const editorState = state;
  const availableTrainingTypes = trainingTypes.filter(
    (item) => item.slot_type === slotType && (item.is_active || item.id === trainingTypeId)
  );

  async function handleSubmit() {
    if (!dateValue || !startTime) {
      setError("Укажите дату и время начала");
      return;
    }

    if (!trainingTypeId) {
      setError("Выберите вид тренировки");
      return;
    }

    if (!durationMinutes.trim()) {
      setError("Укажите длительность");
      return;
    }

    if (!capacity.trim()) {
      setError("Для выбранного вида тренировки не указана вместимость");
      return;
    }

    if (entryMode === "regular" && repeatDays.length === 0) {
      setError("Выберите хотя бы один день недели");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      slot_type: slotType,
      training_type_id: trainingTypeId ? Number.parseInt(trainingTypeId, 10) : null,
      trainer_id: trainerId ? Number.parseInt(trainerId, 10) : null,
      product_id: productId ? Number.parseInt(productId, 10) : null,
      date: dateValue,
      start_time: startTime,
      duration_minutes: Number.parseInt(durationMinutes, 10),
      capacity: Number.parseInt(capacity, 10),
      is_free: isFree,
      block_if_empty_hours: blockIfEmptyHours.trim() ? Number.parseInt(blockIfEmptyHours, 10) : null,
      comment: comment.trim() || null,
    };

    try {
      if (editorState.slot) {
        await updateScheduleSlot(editorState.slot.id, payload);
        onSaved("Занятие обновлено");
        return;
      }

      if (entryMode === "single") {
        await createScheduleSlot(payload);
        onSaved("Занятие создано");
        return;
      }

      const monthBounds = getMonthBounds(parseIsoDate(dateValue));

      const createdTemplateIds = [];

      for (const dayOfWeek of repeatDays) {
        const template = await createScheduleTemplate({
          slot_type: payload.slot_type,
          training_type_id: payload.training_type_id,
          trainer_id: payload.trainer_id,
          product_id: payload.product_id,
          day_of_week: dayOfWeek,
          start_time: payload.start_time,
          duration_minutes: payload.duration_minutes,
          capacity: payload.capacity,
          block_if_empty_hours: payload.block_if_empty_hours,
        });

        createdTemplateIds.push(template.id);
      }

      await generateScheduleTemplates({
        date_from: monthBounds.from,
        date_to: monthBounds.to,
        template_ids: createdTemplateIds,
      });

      onSaved("Регулярные занятия созданы на текущий месяц");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить занятие");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.78)] px-4 py-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2.5rem] p-6"
        style={{ background: "var(--bg-card)", boxShadow: "0 30px 90px rgba(0,0,0,0.5)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="font-[family:var(--font-heading)] text-[1.9rem] font-semibold leading-none text-[var(--text-main)]">
              {editorState.slot ? "Редактирование занятия" : "Новое занятие"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {editorState.slot ? "Измените параметры существующего слота" : "Создайте разовое или регулярное занятие"}
            </p>
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

        {!editorState.slot && (
          <div className="mt-6 rounded-[2rem] p-4" style={{ background: "var(--bg-card-soft)" }}>
            <p className={labelCls}>Вид занятия</p>
            <div className="mt-3 inline-flex rounded-full p-1" style={{ background: "var(--bg-app)" }}>
              {([
                { value: "single", label: "Разовое" },
                { value: "regular", label: "Регулярное" },
              ] as const).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setEntryMode(item.value)}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-all"
                  style={
                    entryMode === item.value
                      ? { background: "var(--accent-grad)", color: "var(--text-inverse)" }
                      : { color: "var(--text-muted)" }
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[2rem] p-4" style={{ background: "var(--bg-card-soft)" }}>
            <p className={labelCls}>Тип занятия</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {slotTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSlotType(option.value);
                    setTrainingTypeId("");
                    setCapacity("");
                  }}
                  className={`rounded-[18px] border px-3 py-3 text-sm transition-colors ${
                    slotType === option.value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--line-soft)] text-[var(--text-main)] hover:border-[var(--accent)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className={labelCls}>Вид тренировки</label>
              <select
                value={trainingTypeId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setTrainingTypeId(nextId);

                  const nextType = trainingTypes.find((item) => item.id === nextId);
                  if (nextType?.duration) {
                    setDurationMinutes(String(nextType.duration));
                  }

                  if (nextType?.capacity) {
                    setCapacity(String(nextType.capacity));
                  } else {
                    setCapacity("");
                  }
                }}
                className={`mt-2 ${inputCls}`}
              >
                <option value="">Не выбран</option>
                {availableTrainingTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className={labelCls}>Тренер</label>
              <select
                value={trainerId}
                onChange={(event) => setTrainerId(event.target.value)}
                className={`mt-2 ${inputCls}`}
              >
                <option value="">Не назначен</option>
                {trainers.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>
                    {trainer.last_name} {trainer.first_name}
                  </option>
                ))}
              </select>
            </div>

          </div>

          <div className="rounded-[2rem] p-4" style={{ background: "var(--bg-card-soft)" }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Дата</label>
                <input
                  type="date"
                  value={dateValue}
                  onChange={(event) => setDateValue(event.target.value)}
                  className={`mt-2 ${inputCls}`}
                />
              </div>
              <div>
                <label className={labelCls}>Время начала</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className={`mt-2 ${inputCls}`}
                />
              </div>
              <div>
                <label className={labelCls}>Длительность, мин</label>
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  className={`mt-2 ${inputCls}`}
                />
              </div>
              <div>
                <label className={labelCls}>Вместимость</label>
                <input
                  type="number"
                  min="1"
                  value={capacity}
                  readOnly
                  className={`mt-2 ${inputCls} cursor-not-allowed opacity-80`}
                />
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Вместимость берётся из выбранного вида тренировки.
                </p>
              </div>
              <div>
                <label className={labelCls}>Блокировка записи, часы</label>
                <input
                  type="number"
                  min="0"
                  value={blockIfEmptyHours}
                  onChange={(event) => setBlockIfEmptyHours(event.target.value)}
                  className={`mt-2 ${inputCls}`}
                  placeholder="Например 6"
                />
              </div>
              <label className="flex items-center gap-3 rounded-[18px] border border-[var(--line-soft)] px-4 py-3 text-sm text-[var(--text-main)]">
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(event) => setIsFree(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                Бесплатное занятие
              </label>
            </div>

            {!editorState.slot && entryMode === "regular" && (
              <div className="mt-4 rounded-[1.5rem] p-4" style={{ background: "var(--bg-app)" }}>
                <p className={labelCls}>Дни недели</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {weekdayOptions.map((day) => {
                    const active = repeatDays.includes(day.value);

                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() =>
                          setRepeatDays((current) =>
                            active
                              ? current.filter((value) => value !== day.value)
                              : [...current, day.value].sort((left, right) => left - right)
                          )
                        }
                        className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--line-soft)] text-[var(--text-main)] hover:border-[var(--accent)]"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  После сохранения шаблоны будут сгенерированы на месяц выбранной даты.
                </p>
              </div>
            )}

            <div className="mt-4">
              <label className={labelCls}>Комментарий</label>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={4}
                className={`mt-2 ${inputCls} resize-none`}
                placeholder="Например: первый вводный класс для новичков"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-[1.25rem] px-5 py-3 text-sm font-semibold transition-all hover:brightness-110 disabled:opacity-50"
            style={{ background: "var(--accent-grad)", color: "var(--text-inverse)", boxShadow: "0 4px 16px rgba(94,244,216,0.25)" }}
          >
            <PlusIcon />
            {saving ? "Сохраняем..." : editorState.slot ? "Сохранить" : "Создать"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[1.25rem] px-5 py-3 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)] hover:bg-[rgba(255,255,255,0.05)]"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
