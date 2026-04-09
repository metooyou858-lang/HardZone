"use client";

import { useState } from "react";

import { Category } from "@/lib/api/categories";

import { inputCls } from "./shared";

export function CategoriesManager({
  categories,
  loading,
  onCreate,
  onUpdate,
  onRemove,
  onClose,
}: {
  categories: Category[];
  loading: boolean;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: string, name: string) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onCreate(newName.trim());
      setNewName("");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка создания категории");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate() {
    if (!editId || !editName.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onUpdate(editId, editName.trim());
      setEditId(null);
      setEditName("");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка обновления категории");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setSubmitting(true);
    setError(null);

    try {
      await onRemove(id);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка удаления категории");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-[var(--text-main)]">Категории товаров</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Создавайте, переименовывайте и удаляйте категории прямо из склада.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-[var(--line-soft)] px-3 py-1 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-main)]"
        >
          Закрыть
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleCreate();
            }
          }}
          placeholder="Название категории..."
          className={inputCls}
        />
        <button
          onClick={() => {
            void handleCreate();
          }}
          disabled={submitting || !newName.trim()}
          className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#062b26] transition-colors hover:brightness-110 disabled:opacity-50"
        >
          Добавить
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-[var(--text-muted)]">Загрузка...</div>
      ) : categories.length === 0 ? (
        <div className="py-6 text-center text-sm text-[var(--text-muted)]">Категорий пока нет</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card-soft)]">
          {categories.map((category, index) => (
            <div
              key={category.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                index < categories.length - 1 ? "border-b border-[var(--line-soft)]" : ""
              }`}
            >
              {editId === category.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void handleUpdate();
                      }
                    }}
                    className="flex-1 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      void handleUpdate();
                    }}
                    disabled={submitting || !editName.trim()}
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[#062b26] hover:brightness-110 disabled:opacity-50"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={() => {
                      setEditId(null);
                      setEditName("");
                    }}
                    className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-white/5"
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-main)]">{category.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{category.product_count} товаров</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditId(category.id);
                      setEditName(category.name);
                    }}
                    className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-xs text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--text-main)]"
                  >
                    Изменить
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        void handleRemove(category.id);
                      }}
                      disabled={submitting || category.product_count > 0}
                      title={
                        category.product_count > 0
                          ? `Нельзя удалить — ${category.product_count} товаров в категории`
                          : "Удалить категорию"
                      }
                      className="rounded-lg border border-[rgba(248,81,73,0.35)] px-3 py-2 text-xs text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.08)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Удалить
                    </button>
                    {category.product_count > 0 && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {category.product_count} товаров
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
