"use client";

import { useState } from "react";

import { ImportItem } from "@/lib/api/imports";
import { useImport } from "@/hooks/useImport";

import { inputCls, labelCls } from "./shared";

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "green" | "blue";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : tone === "blue"
        ? "border-blue-100 bg-blue-50 text-blue-700"
        : "border-slate-100 bg-white text-slate-900";

  return (
    <div className={`rounded-2xl border p-4 text-center ${toneClass}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

function ImportRow({
  item,
  mode,
  onChange,
}: {
  item: ImportItem;
  mode: "receipt" | "stock";
  onChange: (patch: Partial<ImportItem>) => void;
}) {
  return (
    <div className={`flex items-start gap-4 px-5 py-4 ${item.skip ? "opacity-40" : ""}`}>
      <input
        type="checkbox"
        checked={!item.skip}
        onChange={(event) => onChange({ skip: !event.target.checked })}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-slate-900">{item.name}</p>
          {item.matched ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
              в базе
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              новый
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          {item.barcode && <span>Штрихкод: {item.barcode}</span>}
          {item.sku && <span>SKU: {item.sku}</span>}
          {item.matched && item.existing_product && (
            <span>Остаток сейчас: {item.existing_product.stock} шт.</span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex gap-3">
        {mode === "receipt" && (
          <div>
            <p className="mb-1 text-xs text-slate-400">Кол-во</p>
            <input
              type="number"
              min="1"
              value={item.quantity ?? ""}
              onChange={(event) =>
                onChange({ quantity: Number.parseInt(event.target.value, 10) || null })
              }
              className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-sm outline-none focus:border-orange-400"
            />
          </div>
        )}
        <div>
          <p className="mb-1 text-xs text-slate-400">Цена продажи</p>
          <input
            type="number"
            min="0"
            value={item.sale_price ?? ""}
            onChange={(event) =>
              onChange({ sale_price: Number.parseFloat(event.target.value) || null })
            }
            className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-sm outline-none focus:border-orange-400"
          />
        </div>
      </div>
    </div>
  );
}

export function ImportPanel({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"stock" | "receipt">("receipt");
  const importState = useImport();

  async function handleParse() {
    if (!file) {
      return;
    }

    await importState.parse(file);
  }

  async function handleConfirm() {
    await importState.confirm(mode);
    onDone();
  }

  if (importState.imported !== null) {
    return (
      <div className="max-w-xl rounded-2xl border border-emerald-100 bg-emerald-50 p-6">
        <p className="text-lg font-semibold text-emerald-700">Импорт завершён</p>
        <p className="mt-1 text-sm text-emerald-600">
          Загружено позиций: {importState.imported}
        </p>
        <button
          onClick={() => {
            importState.reset();
            onClose();
          }}
          className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Готово
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-900">Импорт из Excel</p>
          <p className="mt-1 text-sm text-slate-500">
            Подходит для выгрузок aQsi и ручных Excel-таблиц.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:bg-slate-50"
        >
          Закрыть
        </button>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <p className="font-medium text-blue-800">Требования к файлу</p>
        <p className="mt-2 text-sm leading-6 text-blue-700">
          Формат: <strong>Excel (.xlsx, .xls)</strong>. Обязательно наличие колонки
          <strong> Наименование</strong>. Остальные поля подхватываются автоматически.
        </p>
      </div>

      {!importState.parseResult && (
        <div className="space-y-5 rounded-2xl border border-slate-100 bg-slate-50 p-5">
          <div>
            <label className={labelCls}>Файл</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-orange-600 hover:file:bg-orange-100"
            />
          </div>

          <div>
            <label className={labelCls}>Режим импорта</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setMode("receipt")}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  mode === "receipt"
                    ? "bg-orange-500 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Приёмка — добавить остатки
              </button>
              <button
                onClick={() => setMode("stock")}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  mode === "stock"
                    ? "bg-orange-500 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Только каталог
              </button>
            </div>
          </div>

          {importState.error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {importState.error}
            </div>
          )}

          <button
            onClick={() => {
              void handleParse();
            }}
            disabled={!file || importState.parsing}
            className="w-full rounded-xl bg-orange-500 py-3 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {importState.parsing ? "Разбираем файл..." : "Загрузить и проверить"}
          </button>
        </div>
      )}

      {importState.parseResult && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Всего позиций" value={importState.parseResult.total} />
            <StatCard
              label="Найдено в базе"
              value={importState.parseResult.matched}
              tone="green"
            />
            <StatCard
              label="Новых товаров"
              value={importState.parseResult.new}
              tone="blue"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Позиции для импорта
              </p>
              <p className="text-xs text-slate-400">Сними галочку, чтобы пропустить позицию</p>
            </div>
            <div className="divide-y divide-slate-50">
              {importState.items.map((item, index) => (
                <ImportRow
                  key={`${item.row}-${item.name}`}
                  item={item}
                  mode={mode}
                  onChange={(patch) => importState.updateItem(index, patch)}
                />
              ))}
            </div>
          </div>

          {importState.error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {importState.error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={importState.reset}
              className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Назад
            </button>
            <button
              onClick={() => {
                void handleConfirm();
              }}
              disabled={importState.confirming || importState.activeCount === 0}
              className="flex-1 rounded-xl bg-orange-500 py-3 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {importState.confirming
                ? "Импортируем..."
                : `Подтвердить импорт · ${importState.activeCount} позиций`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
