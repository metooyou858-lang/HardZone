"use client";

import { useState } from "react";

import { useProductTypes } from "@/hooks/useProductTypes";
import { ProductType } from "@/lib/api/product-types";

const inputCls =
  "w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const labelCls = "text-xs font-medium uppercase tracking-wider text-slate-400";

const FIELDS: { key: keyof ProductType; label: string }[] = [
  { key: "has_barcode", label: "Штрихкод" },
  { key: "has_sku", label: "SKU / Артикул" },
  { key: "has_cost_price", label: "Цена закупки" },
  { key: "has_sale_price", label: "Цена продажи" },
  { key: "has_stock", label: "Остаток" },
  { key: "has_min_stock", label: "Минимальный остаток" },
  { key: "has_marking", label: "Честный знак" },
];

function FieldToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2">
      <div
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-teal-500" : "bg-slate-600"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  );
}

type FieldConfig = {
  has_barcode: boolean;
  has_sku: boolean;
  has_cost_price: boolean;
  has_sale_price: boolean;
  has_stock: boolean;
  has_min_stock: boolean;
  has_marking: boolean;
};

function defaultFields(): FieldConfig {
  return {
    has_barcode: true,
    has_sku: true,
    has_cost_price: true,
    has_sale_price: true,
    has_stock: true,
    has_min_stock: true,
    has_marking: false,
  };
}

function TypeForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: ProductType;
  onSave: (name: string, fields: FieldConfig) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [fields, setFields] = useState<FieldConfig>(
    initial
      ? {
          has_barcode: initial.has_barcode,
          has_sku: initial.has_sku,
          has_cost_price: initial.has_cost_price,
          has_sale_price: initial.has_sale_price,
          has_stock: initial.has_stock,
          has_min_stock: initial.has_min_stock,
          has_marking: initial.has_marking,
        }
      : defaultFields()
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/50 p-5">
      <div>
        <label className={labelCls}>Название типа *</label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Например: Хозтовары"
          className={`mt-1 ${inputCls}`}
          autoFocus
        />
      </div>

      <div>
        <label className={labelCls}>Поля</label>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <FieldToggle
              key={field.key}
              label={field.label}
              checked={fields[field.key as keyof FieldConfig]}
              onChange={(value) =>
                setFields((previous) => ({
                  ...previous,
                  [field.key]: value,
                }))
              }
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(name, fields)}
          disabled={saving || !name.trim()}
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

export function ProductTypesManager({ onClose }: { onClose: () => void }) {
  const { types, loading, create, update, remove } = useProductTypes();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(name: string, fields: FieldConfig) {
    setSaving(true);
    setError(null);

    try {
      await create({ name, ...fields });
      setShowCreate(false);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, name: string, fields: FieldConfig) {
    setSaving(true);
    setError(null);

    try {
      await update(id, { name, ...fields });
      setEditId(null);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);

    try {
      await remove(id);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка");
    }
  }

  return (
    <div className="max-w-2xl space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-100">Типы позиций</p>
          <p className="mt-0.5 text-xs text-slate-400">Настройте, какие поля нужны для каждого типа</p>
        </div>
        <button onClick={onClose} className="text-lg text-slate-500 hover:text-slate-300">
          ✕
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500">Загрузка...</div>
      ) : (
        <div className="space-y-2">
          {types.map((type) => (
            <div key={type.id}>
              {editId === type.id ? (
                <TypeForm
                  initial={type}
                  onSave={(name, fields) => handleUpdate(type.id, name, fields)}
                  onCancel={() => setEditId(null)}
                  saving={saving}
                />
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{type.name}</p>
                      {type.is_system && (
                        <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                          системный
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-1">
                      {FIELDS.filter((field) => type[field.key as keyof ProductType]).map((field) => (
                        <span
                          key={field.key}
                          className="rounded-full bg-teal-900/40 px-2 py-0.5 text-xs text-teal-400"
                        >
                          {field.label}
                        </span>
                      ))}
                    </div>

                    <p className="mt-1 text-xs text-slate-500">{type.product_count} товаров</p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setEditId(type.id)}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-700"
                    >
                      Изменить
                    </button>
                    {!type.is_system && (
                      <button
                        onClick={() => {
                          void handleDelete(type.id);
                        }}
                        disabled={parseInt(type.product_count.toString(), 10) > 0}
                        title={
                          parseInt(type.product_count.toString(), 10) > 0
                            ? `Нельзя удалить — ${type.product_count} товаров`
                            : "Удалить тип"
                        }
                        className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-500 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <TypeForm onSave={handleCreate} onCancel={() => setShowCreate(false)} saving={saving} />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full rounded-xl border border-dashed border-slate-600 py-3 text-sm text-slate-400 transition-colors hover:border-teal-500 hover:text-teal-400"
        >
          + Добавить тип
        </button>
      )}
    </div>
  );
}
