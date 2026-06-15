"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  ClientListItem,
  LegacySubscriptionImportPlan,
  LegacySubscriptionImportResult,
  createClient,
  fetchClients,
  importClientsCsv,
  importLegacySubscriptionsCsv,
  previewLegacySubscriptionsCsv,
} from "@/lib/api/clients";
import { hasModuleAccess, type AuthModulePermission } from "@/lib/access";
import {
  clientInputCls,
  clientLabelCls,
  describeSubscription,
  formatClientDate,
  formatClientName,
} from "@/components/clients/shared";

type ClientsTab = "clients" | "import";
const PAGE_SIZE = 50;

const emptyForm = {
  last_name: "",
  first_name: "",
  middle_name: "",
  phone: "",
  email: "",
  birth_date: "",
  discount: "",
  comment: "",
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M8.75 15a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM17.5 17.5l-4.375-4.375"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4.5 10h11M11 4.5 16.5 10 11 15.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ClientsPage() {
  const [tab, setTab] = useState<ClientsTab>("clients");
  const [currentModules, setCurrentModules] = useState<AuthModulePermission[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [legacyFile, setLegacyFile] = useState<File | null>(null);
  const [legacyPreviewing, setLegacyPreviewing] = useState(false);
  const [legacyImporting, setLegacyImporting] = useState(false);
  const [legacyPlan, setLegacyPlan] = useState<LegacySubscriptionImportPlan | null>(null);
  const [legacyResult, setLegacyResult] = useState<LegacySubscriptionImportResult | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);

  const canCreateClient = hasModuleAccess(currentModules, "clients_create");
  const canImportClients = hasModuleAccess(currentModules, "clients_import");
  const tabs: Array<{ id: ClientsTab; label: string }> = [
    { id: "clients", label: "Клиенты" },
    ...(canImportClients ? [{ id: "import" as const, label: "Импорт" }] : []),
  ];

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/auth-api/me");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { data?: { user?: { modules?: AuthModulePermission[] } } };
        if (!cancelled) {
          setCurrentModules(data.data?.user?.modules ?? []);
        }
      } catch {
        if (!cancelled) {
          setCurrentModules([]);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab === "import" && !canImportClients) {
      setTab("clients");
    }
  }, [canImportClients, tab]);

  useEffect(() => {
    if (tab !== "clients") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchClients({
          search: search.trim() || undefined,
          limit: PAGE_SIZE + 1,
          offset: page * PAGE_SIZE,
        });

        if (!cancelled) {
          setHasNextPage(data.length > PAGE_SIZE);
          setClients(data.slice(0, PAGE_SIZE));
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить клиентов");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, reloadToken, search, tab]);

  useEffect(() => {
    if (!expandedClientId) {
      return;
    }

    if (!clients.some((item) => item.id === expandedClientId)) {
      setExpandedClientId(null);
    }
  }, [clients, expandedClientId]);

  const titleCount = useMemo(() => clients.length, [clients.length]);

  async function handleCreate() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("Укажите имя и фамилию");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      await createClient({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        middle_name: form.middle_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        birth_date: form.birth_date || null,
        discount: form.discount ? Number.parseFloat(form.discount) : 0,
        comment: form.comment.trim() || null,
      });

      setForm(emptyForm);
      setShowCreate(false);
      setReloadToken((value) => value + 1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать клиента");
    } finally {
      setCreating(false);
    }
  }

  async function handleImport() {
    if (!file) {
      setImportError("Выберите CSV-файл");
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const result = await importClientsCsv(file);
      setImportResult(result);
      setReloadToken((value) => value + 1);
    } catch (uploadError) {
      setImportError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить файл");
    } finally {
      setImporting(false);
    }
  }

  async function handleLegacyPreview() {
    if (!legacyFile) {
      setLegacyError("Выберите CSV-файл со старыми абонементами");
      return;
    }

    setLegacyPreviewing(true);
    setLegacyError(null);
    setLegacyResult(null);

    try {
      const result = await previewLegacySubscriptionsCsv(legacyFile);
      setLegacyPlan(result);
    } catch (previewError) {
      setLegacyError(previewError instanceof Error ? previewError.message : "Не удалось проверить файл");
    } finally {
      setLegacyPreviewing(false);
    }
  }

  async function handleLegacyImport() {
    if (!legacyFile) {
      setLegacyError("Выберите CSV-файл со старыми абонементами");
      return;
    }

    setLegacyImporting(true);
    setLegacyError(null);

    try {
      const result = await importLegacySubscriptionsCsv(legacyFile);
      setLegacyResult(result);
      setLegacyPlan(result);
      setReloadToken((value) => value + 1);
    } catch (importError) {
      setLegacyError(importError instanceof Error ? importError.message : "Не удалось импортировать абонементы");
    } finally {
      setLegacyImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">
            Клиенты
          </h1>
        </div>

        <div className="inline-flex rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                tab === item.id
                  ? "bg-[var(--accent)] text-[#062b26]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "clients" ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3 lg:max-w-[760px]">
              <label className="relative block min-w-0 flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--text-muted)]">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Поиск по имени, телефону, email или штрихкоду..."
                  className={`${clientInputCls} pl-12`}
                />
              </label>
            </div>

            {canCreateClient ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setShowCreate(true);
                  }}
                  className="rounded-[18px] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110"
                >
                  Новый клиент
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4 text-sm text-[var(--text-muted)]">
              <p>
                Показано: <span className="text-[var(--text-main)]">{titleCount}</span>
              </p>
              <p>
                Страница: <span className="text-[var(--text-main)]">{page + 1}</span>
              </p>
            </div>

            {error && (
              <div className="border-b border-[var(--line-soft)] px-5 py-4 text-sm text-[var(--danger)]">{error}</div>
            )}

            {loading ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <SearchIcon />
                </div>
                <p className="mt-4 text-base font-medium text-[var(--text-main)]">Загружаем клиентов</p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">Подтягиваем список и активные абонементы</p>
              </div>
            ) : clients.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.08)] text-[var(--accent)]">
                  <SearchIcon />
                </div>
                <p className="mt-4 text-base font-medium text-[var(--text-main)]">Клиенты не найдены</p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">Измените запрос или создайте новую карточку вручную</p>
                {canCreateClient ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setShowCreate(true);
                    }}
                    className="mt-5 rounded-[18px] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110"
                  >
                    Создать клиента
                  </button>
                ) : null}
              </div>
            ) : (
              <div>
                <div className="hidden grid-cols-[minmax(0,1.4fr)_220px_minmax(220px,1fr)_auto] gap-4 border-b border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-4 text-[13px] font-medium uppercase tracking-[0.14em] text-slate-300 lg:grid">
                  <span>Клиент</span>
                  <span>Email</span>
                  <span>Абонемент</span>
                  <span className="text-right">Карточка</span>
                </div>
                <div className="divide-y divide-[var(--line-soft)]">
                {clients.map((client, index) => {
                  const hasSubscription = Boolean(client.subscription_id);
                  const isExpanded = expandedClientId === client.id;

                  return (
                    <div
                      key={client.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedClientId((value) => (value === client.id ? null : client.id))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setExpandedClientId((value) => (value === client.id ? null : client.id));
                        }
                      }}
                      className={`group cursor-pointer transition-colors ${
                        isExpanded
                          ? "bg-[rgba(255,255,255,0.05)]"
                          : index % 2 === 0
                            ? "bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)]"
                            : "bg-transparent hover:bg-[rgba(255,255,255,0.04)]"
                      }`}
                    >
                      <div className="px-5 py-5">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_220px_minmax(220px,1fr)_auto] lg:items-center">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-[var(--text-main)]">{formatClientName(client)}</p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">{client.phone || "Телефон не указан"}</p>
                        </div>

                        <div className={`min-w-0 text-sm ${client.email ? "text-[var(--text-main)]" : "text-[var(--text-muted)]"}`}>
                          {client.email || "—"}
                        </div>

                        <div className={`text-sm ${hasSubscription ? "text-[var(--text-main)]" : "text-[var(--text-muted)]"}`}>
                          {describeSubscription(client)}
                        </div>

                        <div className="flex items-center justify-end">
                          <Link
                            href={`/clients/${client.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card-soft)] text-[var(--text-main)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                            aria-label={`Открыть карточку клиента ${formatClientName(client)}`}
                          >
                            <ArrowRightIcon />
                          </Link>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] px-5 py-5">
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3.5">
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Дата рождения</p>
                              <p className="mt-2 text-sm text-[var(--text-main)]">{formatClientDate(client.birth_date)}</p>
                            </div>

                            <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3.5">
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Персональная скидка</p>
                              <p className="mt-2 text-sm text-[var(--text-main)]">
                                {Number(client.discount || 0) > 0 ? `${client.discount}%` : "Нет"}
                              </p>
                            </div>

                            <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3.5">
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Комментарий</p>
                              <p className="mt-2 text-sm text-[var(--text-main)]">{client.comment || "—"}</p>
                            </div>

                            <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3.5">
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Абонемент</p>
                              <p className={`mt-2 text-sm ${hasSubscription ? "text-[var(--text-main)]" : "text-[var(--text-muted)]"}`}>
                                {describeSubscription(client)}
                              </p>
                            </div>
                          </div>

                        </div>
                      )}
                      </div>
                    </div>
                  );
                })}
                </div>
                <div className="flex items-center justify-between border-t border-[var(--line-soft)] px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                    disabled={page === 0 || loading}
                    className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Назад
                  </button>
                  <span className="text-sm text-[var(--text-muted)]">
                    {page === 0 ? "Первая страница" : `Страница ${page + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((value) => value + 1)}
                    disabled={!hasNextPage || loading}
                    className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Дальше
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
          <div className="max-w-2xl space-y-5">
            <div>
              <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
                Импорт клиентов из CSV
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Формат: Фамилия, Имя, Email, Телефон, ДеньРождения, Теги, Скидка, Комментарий
              </p>
            </div>

            <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
              <label className={clientLabelCls}>CSV файл</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-3 block w-full text-sm text-[var(--text-main)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--accent)]"
              />

              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={importing}
                className="mt-5 rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
              >
                {importing ? "Загружаем..." : "Загрузить"}
              </button>
            </div>

            {importError && (
              <div className="rounded-[20px] border border-[rgba(248,81,73,0.28)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
                {importError}
              </div>
            )}

            {importResult && (
              <div className="rounded-[20px] border border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.1)] px-4 py-4 text-sm text-[var(--text-main)]">
                <p>
                  Создано: <span className="text-[var(--accent)]">{importResult.created}</span>
                </p>
                <p className="mt-1">
                  Пропущено: <span className="text-[var(--text-main)]">{importResult.skipped}</span>
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs text-[var(--warning)]">
                    {importResult.errors.slice(0, 10).map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-[var(--line-soft)] pt-5">
              <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
                Импорт старых абонементов
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                CSV переносит остатки напрямую в карточки клиентов: без заказа, оплаты, чека и AQSI. Сначала проверьте файл,
                затем импортируйте только готовые строки.
              </p>
            </div>

            <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
              <label className={clientLabelCls}>CSV старых абонементов</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setLegacyFile(event.target.files?.[0] ?? null);
                  setLegacyPlan(null);
                  setLegacyResult(null);
                  setLegacyError(null);
                }}
                className="mt-3 block w-full text-sm text-[var(--text-main)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--accent)]"
              />

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleLegacyPreview()}
                  disabled={legacyPreviewing || legacyImporting}
                  className="rounded-[18px] border border-[var(--line-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)] transition-all hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-50"
                >
                  {legacyPreviewing ? "Проверяем..." : "Проверить файл"}
                </button>

                <button
                  type="button"
                  onClick={() => void handleLegacyImport()}
                  disabled={!legacyPlan || legacyPlan.ready === 0 || legacyPreviewing || legacyImporting}
                  className="rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {legacyImporting ? "Импортируем..." : "Импортировать готовые"}
                </button>
              </div>
            </div>

            {legacyError && (
              <div className="rounded-[20px] border border-[rgba(248,81,73,0.28)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
                {legacyError}
              </div>
            )}

            {legacyPlan && (
              <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4 text-sm text-[var(--text-main)]">
                <div className="flex flex-wrap gap-4">
                  <span>Всего строк: {legacyPlan.total}</span>
                  <span className="text-[var(--accent)]">Готово: {legacyPlan.ready}</span>
                  <span className="text-[var(--warning)]">Конфликты: {legacyPlan.conflicts}</span>
                  {legacyResult && <span>Batch: {legacyResult.batch_id}</span>}
                </div>

                <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-2">
                  {legacyPlan.rows.slice(0, 30).map((row) => (
                    <div
                      key={`${row.row_number}-${row.phone}-${row.email}-${row.product_name}`}
                      className={`rounded-[16px] border px-3 py-3 ${
                        row.ready
                          ? "border-[rgba(0,191,165,0.22)] bg-[rgba(0,191,165,0.08)]"
                          : "border-[rgba(248,81,73,0.24)] bg-[rgba(248,81,73,0.1)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          Строка {row.row_number}:{" "}
                          {row.client
                            ? [row.client.last_name, row.client.first_name].filter(Boolean).join(" ")
                            : [row.last_name, row.first_name].filter(Boolean).join(" ") || row.phone || row.email || "клиент не указан"}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {row.type || "тип ?"} · осталось {row.visits_left ?? "без лимита"} · до {row.expires_at || "без даты"}
                        </p>
                      </div>
                      {row.product?.name && <p className="mt-1 text-xs text-[var(--text-muted)]">Услуга: {row.product.name}</p>}
                      {row.errors.length > 0 && <p className="mt-2 text-xs text-[var(--danger)]">{row.errors.join("; ")}</p>}
                      {row.warnings.length > 0 && <p className="mt-2 text-xs text-[var(--warning)]">{row.warnings.join("; ")}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {showCreate && canCreateClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-10">
          <div className="w-full max-w-2xl rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
                  Новый клиент
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Создайте карточку клиента вручную</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-lg text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={clientLabelCls}>Фамилия *</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                  className={`mt-2 ${clientInputCls}`}
                />
              </div>
              <div>
                <label className={clientLabelCls}>Имя *</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                  className={`mt-2 ${clientInputCls}`}
                />
              </div>
              <div>
                <label className={clientLabelCls}>Отчество</label>
                <input
                  type="text"
                  value={form.middle_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, middle_name: event.target.value }))}
                  className={`mt-2 ${clientInputCls}`}
                />
              </div>
              <div>
                <label className={clientLabelCls}>Телефон</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className={`mt-2 ${clientInputCls}`}
                />
              </div>
              <div>
                <label className={clientLabelCls}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  className={`mt-2 ${clientInputCls}`}
                />
              </div>
              <div>
                <label className={clientLabelCls}>Дата рождения</label>
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, birth_date: event.target.value }))}
                  className={`mt-2 ${clientInputCls}`}
                />
              </div>
              <div>
                <label className={clientLabelCls}>Персональная скидка</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discount}
                  onChange={(event) => setForm((prev) => ({ ...prev, discount: event.target.value }))}
                  className={`mt-2 ${clientInputCls}`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={clientLabelCls}>Комментарий</label>
                <textarea
                  value={form.comment}
                  onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
                  rows={4}
                  className={`mt-2 ${clientInputCls} resize-none`}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
              >
                {creating ? "Сохраняем..." : "Создать"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-[18px] border border-[var(--line-soft)] px-5 py-3 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
