"use client";

import { useState } from "react";

import { useImport } from "@/hooks/useImport";
import { ImportItem } from "@/lib/api/imports";

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
      ? "border-[rgba(63,185,80,0.25)] bg-[rgba(63,185,80,0.08)] text-[var(--success)]"
      : tone === "blue"
        ? "border-[rgba(0,191,165,0.28)] bg-[rgba(0,191,165,0.08)] text-[var(--accent)]"
        : "border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--text-main)]";

  return (
    <div className={`rounded-2xl border p-4 text-center ${toneClass}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
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
        className="mt-1 h-4 w-4 rounded border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--accent)]"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-[var(--text-main)]">{item.name}</p>
          {item.matched ? (
            <span className="shrink-0 rounded-full bg-[rgba(63,185,80,0.12)] px-2 py-0.5 text-xs text-[var(--success)]">
              в базе
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-[rgba(0,191,165,0.12)] px-2 py-0.5 text-xs text-[var(--accent)]">
              новый
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
          {item.category && <span>Категория: {item.category}</span>}
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
            <p className="mb-1 text-xs text-[var(--text-muted)]">Кол-во</p>
            <input
              type="number"
              min="1"
              value={item.quantity ?? ""}
              onChange={(event) =>
                onChange({ quantity: Number.parseInt(event.target.value, 10) || null })
              }
              className="w-20 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-center text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        )}
        <div>
          <p className="mb-1 text-xs text-[var(--text-muted)]">Цена продажи</p>
          <input
            type="number"
            min="0"
            value={item.sale_price ?? ""}
            onChange={(event) =>
              onChange({ sale_price: Number.parseFloat(event.target.value) || null })
            }
            className="w-24 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-center text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
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
      <div className="max-w-xl rounded-2xl border border-[rgba(63,185,80,0.28)] bg-[rgba(63,185,80,0.08)] p-6">
        <p className="text-lg font-semibold text-[var(--success)]">Импорт завершён</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Загружено позиций: {importState.imported}
        </p>
        <button
          onClick={() => {
            importState.reset();
            onClose();
          }}
          className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062b26] transition-colors hover:brightness-110"
        >
          Готово
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-[var(--text-main)]">Импорт из Excel</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Подходит для выгрузок aQsi и ручных Excel-таблиц.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-[var(--line-soft)] px-3 py-1 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-main)]"
        >
          Закрыть
        </button>
      </div>

      <div className="rounded-2xl border border-[rgba(0,191,165,0.28)] bg-[rgba(0,191,165,0.08)] p-5">
        <p className="font-medium text-[var(--text-main)]">Требования к файлу</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Формат: <strong>Excel (.xlsx, .xls)</strong>. Обязательно наличие колонки
          <strong> Наименование</strong>. Остальные поля подхватываются автоматически.
        </p>
      </div>

      {!importState.parseResult && (
        <div className="space-y-5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
          <div>
            <label className={labelCls}>Файл</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-[var(--text-muted)] file:mr-4 file:rounded-xl file:border file:border-[var(--line-soft)] file:bg-[var(--bg-card)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--accent)] hover:file:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className={labelCls}>Режим импорта</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setMode("receipt")}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  mode === "receipt"
                    ? "bg-[var(--accent)] text-[#062b26]"
                    : "border border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-white/5"
                }`}
              >
                Приёмка — добавить остатки
              </button>
              <button
                onClick={() => setMode("stock")}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  mode === "stock"
                    ? "bg-[var(--accent)] text-[#062b26]"
                    : "border border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-white/5"
                }`}
              >
                Только каталог
              </button>
            </div>
          </div>

          {importState.error && (
            <div className="rounded-xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
              {importState.error}
            </div>
          )}

          <button
            onClick={() => {
              void handleParse();
            }}
            disabled={!file || importState.parsing}
            className="w-full rounded-xl bg-[var(--accent)] py-3 font-medium text-[#062b26] transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {importState.parsing ? "Разбираем файл..." : "Загрузить и проверить"}
          </button>
        </div>
      )}

      {importState.parseResult && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Всего позиций" value={importState.parseResult.total} />
            <StatCard label="Найдено в базе" value={importState.parseResult.matched} tone="green" />
            <StatCard label="Новых товаров" value={importState.parseResult.new} tone="blue" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card-soft)]">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] bg-[var(--bg-card)] px-5 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Позиции для импорта
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Сними галочку, чтобы пропустить позицию
              </p>
            </div>
            <div className="divide-y divide-[var(--line-soft)]">
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
            <div className="rounded-xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
              {importState.error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={importState.reset}
              className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-3 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--text-main)]"
            >
              Назад
            </button>
            <button
              onClick={() => {
                void handleConfirm();
              }}
              disabled={importState.confirming || importState.activeCount === 0}
              className="flex-1 rounded-xl bg-[var(--accent)] py-3 font-medium text-[#062b26] transition-colors hover:brightness-110 disabled:opacity-50"
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
