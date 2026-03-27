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
    <div className="max-w-xl space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-900">Категории товаров</p>
          <p className="mt-1 text-sm text-slate-500">
            Создавайте, переименовывайте и удаляйте категории прямо из склада.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:bg-slate-50"
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
          className="shrink-0 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          Добавить
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-slate-400">Загрузка...</div>
      ) : categories.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">Категорий пока нет</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          {categories.map((category, index) => (
            <div
              key={category.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                index < categories.length - 1 ? "border-b border-slate-50" : ""
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
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-orange-400"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      void handleUpdate();
                    }}
                    disabled={submitting || !editName.trim()}
                    className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={() => {
                      setEditId(null);
                      setEditName("");
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{category.name}</p>
                    <p className="text-xs text-slate-400">{category.product_count} товаров</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditId(category.id);
                      setEditName(category.name);
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Изменить
                  </button>
                  <button
                    onClick={() => {
                      void handleRemove(category.id);
                    }}
                    disabled={submitting || category.product_count > 0}
                    className="rounded-lg border border-red-100 px-3 py-2 text-xs text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Удалить
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
