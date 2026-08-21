"use client";

import { useEffect, useMemo, useState } from "react";

import { clientInputCls, clientLabelCls } from "@/components/clients/shared";
import {
  createMarketingCampaign,
  createMarketingReferral,
  fetchMarketingCampaign,
  fetchMarketingCampaigns,
  searchMarketingClients,
  updateMarketingCampaign,
  updateMarketingReferralStatus,
  updateMarketingReward,
  uploadMarketingBanner,
  type MarketingCampaign,
  type MarketingCampaignListItem,
  type MarketingCampaignStatus,
  type MarketingClientOption,
  type MarketingRewardRule,
  type ReferralStatus,
} from "@/lib/api/marketing";

const emptyRule: MarketingRewardRule = { recipient: "referrer", reward_type: "free_visit", value: 1 };
const statusLabels: Record<MarketingCampaignStatus, string> = {
  draft: "Черновик",
  active: "Активна",
  archived: "Архив",
};

function clientName(client: MarketingClientOption) {
  return [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(" ");
}

function dateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function rewardText(rule: MarketingRewardRule) {
  const recipient = rule.recipient === "referrer" ? "Пригласившему" : "Новому клиенту";
  return rule.reward_type === "discount_percent"
    ? `${recipient}: скидка ${rule.value}%`
    : `${recipient}: ${rule.value} бесплатн. посещ.`;
}

function ClientPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MarketingClientOption | null;
  onChange: (value: MarketingClientOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<MarketingClientOption[]>([]);

  useEffect(() => {
    if (value || query.trim().length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchMarketingClients(query.trim());
        if (!cancelled) setOptions(result);
      } catch {
        if (!cancelled) setOptions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, value]);

  return (
    <div className="relative">
      <label className={clientLabelCls}>{label}</label>
      {value ? (
        <div className="mt-2 flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-2.5">
          <span className="min-w-0 truncate text-sm text-[var(--text-main)]">{clientName(value)}</span>
          <button type="button" onClick={() => { onChange(null); setQuery(""); }} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]">
            Сменить
          </button>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Начните вводить имя или телефон"
            className={`mt-2 ${clientInputCls}`}
          />
          {query.trim().length >= 2 && (
            <div className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-[18px] border border-[var(--line-soft)] bg-[#101a1d] p-1 shadow-2xl">
              {options.length ? options.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { onChange(item); setQuery(""); }}
                  className="block w-full rounded-[14px] px-3 py-2.5 text-left hover:bg-white/[.06]"
                >
                  <span className="block text-sm text-[var(--text-main)]">{clientName(item)}</span>
                  {item.phone && <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{item.phone}</span>}
                </button>
              )) : <p className="px-3 py-3 text-sm text-[var(--text-muted)]">Ничего не найдено</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState<MarketingCampaignListItem[]>([]);
  const [selected, setSelected] = useState<MarketingCampaign | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<MarketingCampaignStatus>("draft");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [publicRules, setPublicRules] = useState("");
  const [rewardRules, setRewardRules] = useState<MarketingRewardRule[]>([{ ...emptyRule }]);
  const [referrer, setReferrer] = useState<MarketingClientOption | null>(null);
  const [referred, setReferred] = useState<MarketingClientOption | null>(null);
  const [referralNote, setReferralNote] = useState("");

  async function loadList(preferredId?: string | null) {
    const list = await fetchMarketingCampaigns();
    setCampaigns(list);
    const nextId = preferredId ?? selectedId ?? (list[0]?.id ? String(list[0].id) : null);
    if (nextId) {
      setSelectedId(nextId);
      const detail = await fetchMarketingCampaign(nextId);
      setSelected(detail);
    } else {
      setSelected(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchMarketingCampaigns();
        if (cancelled) return;
        setCampaigns(list);
        if (list[0]) {
          const id = String(list[0].id);
          setSelectedId(id);
          const detail = await fetchMarketingCampaign(id);
          if (!cancelled) setSelected(detail);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить кампании");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setStatus(selected.status);
    setStartsAt(dateInput(selected.starts_at));
    setEndsAt(dateInput(selected.ends_at));
    setPublicRules(selected.public_rules ?? "");
    setRewardRules(selected.reward_rules.length ? selected.reward_rules : [{ ...emptyRule }]);
  }, [selected]);

  const rewardSummary = useMemo(() => rewardRules.map(rewardText), [rewardRules]);

  function beginCreate() {
    setCreating(true);
    setSelectedId(null);
    setSelected(null);
    setName("");
    setStatus("draft");
    setStartsAt("");
    setEndsAt("");
    setPublicRules("");
    setRewardRules([{ ...emptyRule }]);
    setError(null);
    setNotice(null);
  }

  async function selectCampaign(id: string) {
    setLoading(true);
    setError(null);
    setCreating(false);
    try {
      const detail = await fetchMarketingCampaign(id);
      setSelectedId(id);
      setSelected(detail);
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "Не удалось открыть кампанию");
    } finally {
      setLoading(false);
    }
  }

  async function saveCampaign() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name: name.trim(),
        campaign_type: "referral",
        status,
        public_rules: publicRules.trim(),
        reward_rules: rewardRules.map((rule) => ({ ...rule, value: Number(rule.value) })),
        starts_at: startsAt || null,
        ends_at: endsAt || null,
      };
      const saved = creating || !selectedId
        ? await createMarketingCampaign(payload)
        : await updateMarketingCampaign(selectedId, payload);
      const id = String(saved.id);
      setCreating(false);
      await loadList(id);
      setNotice(creating ? "Кампания создана" : "Изменения сохранены");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить кампанию");
    } finally {
      setSaving(false);
    }
  }

  async function uploadBanner(file: File) {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await uploadMarketingBanner(selectedId, file);
      await loadList(selectedId);
      setNotice("Баннер обновлён");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить баннер");
    } finally {
      setSaving(false);
    }
  }

  async function addReferral() {
    if (!selectedId || !referrer || !referred) {
      setError("Выберите в CRM того, кто пригласил, и нового клиента");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const detail = await createMarketingReferral(selectedId, {
        referrer_client_id: String(referrer.id),
        referred_client_id: String(referred.id),
        note: referralNote.trim() || null,
      });
      setSelected(detail);
      setReferrer(null);
      setReferred(null);
      setReferralNote("");
      await loadList(selectedId);
      setNotice("Участие зафиксировано, награды созданы по правилам кампании");
    } catch (referralError) {
      setError(referralError instanceof Error ? referralError.message : "Не удалось добавить участников");
    } finally {
      setSaving(false);
    }
  }

  async function setReferralStatus(id: string, nextStatus: ReferralStatus) {
    setSaving(true);
    setError(null);
    try {
      setSelected(await updateMarketingReferralStatus(id, nextStatus));
      await loadList(selectedId);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Не удалось изменить участие");
    } finally {
      setSaving(false);
    }
  }

  async function toggleReward(id: string, issued: boolean) {
    setSaving(true);
    setError(null);
    try {
      setSelected(await updateMarketingReward(id, issued ? "pending" : "issued"));
      await loadList(selectedId);
    } catch (rewardError) {
      setError(rewardError instanceof Error ? rewardError.message : "Не удалось изменить награду");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)]">Маркетинг</p>
          <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">Акции</h1>
        </div>
        <button type="button" onClick={beginCreate} className="rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] hover:brightness-110">
          Новая кампания
        </button>
      </div>

      {(error || notice) && (
        <div className={`rounded-[18px] border px-4 py-3 text-sm ${error ? "border-[rgba(248,81,73,.28)] bg-[rgba(248,81,73,.1)] text-[var(--danger)]" : "border-[rgba(0,191,165,.24)] bg-[rgba(0,191,165,.08)] text-[var(--accent)]"}`}>
          {error ?? notice}
        </div>
      )}

      <div className="grid min-h-[680px] gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
          <div className="flex items-center justify-between px-2 pb-3 pt-1">
            <p className="text-sm font-medium text-[var(--text-main)]">Кампании</p>
            <span className="text-xs text-[var(--text-muted)]">{campaigns.length}</span>
          </div>
          <div className="space-y-2">
            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => void selectCampaign(String(campaign.id))}
                className={`w-full rounded-[20px] border p-4 text-left transition ${String(campaign.id) === selectedId ? "border-[rgba(0,191,165,.38)] bg-[rgba(0,191,165,.1)]" : "border-transparent bg-[var(--bg-card-soft)] hover:border-[var(--line-soft)]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-[var(--text-main)]">{campaign.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">{statusLabels[campaign.status]}</span>
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">{campaign.participants_count} участн. · {campaign.pending_rewards_count} наград ожидают</p>
              </button>
            ))}
            {!loading && campaigns.length === 0 && <p className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">Создайте первую акцию</p>}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {(creating || selected) ? (
            <>
              <section className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">{creating ? "Новая кампания" : "Настройки кампании"}</h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">Название, период, баннер и правила акции</p>
                  </div>
                  <button type="button" disabled={saving} onClick={() => void saveCampaign()} className="rounded-[18px] bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#062b26] disabled:opacity-50">
                    {saving ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <label className={clientLabelCls}>Название *</label>
                    <input value={name} onChange={(event) => setName(event.target.value)} className={`mt-2 ${clientInputCls}`} placeholder="Например, Приведи друга" />
                  </div>
                  <div>
                    <label className={clientLabelCls}>Статус</label>
                    <select value={status} onChange={(event) => setStatus(event.target.value as MarketingCampaignStatus)} className={`mt-2 ${clientInputCls}`}>
                      <option value="draft">Черновик</option><option value="active">Активна</option><option value="archived">Архив</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={clientLabelCls}>Начало</label><input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={`mt-2 ${clientInputCls}`} /></div>
                    <div><label className={clientLabelCls}>Окончание</label><input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={`mt-2 ${clientInputCls}`} /></div>
                  </div>
                  <div className="lg:col-span-2">
                    <label className={clientLabelCls}>Правила для клиентов</label>
                    <textarea rows={5} value={publicRules} onChange={(event) => setPublicRules(event.target.value)} className={`mt-2 ${clientInputCls} resize-y`} placeholder="Опишите условия участия понятным языком" />
                  </div>
                </div>

                {!creating && selectedId && (
                  <div className="mt-5 rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="h-24 w-full shrink-0 overflow-hidden rounded-[16px] bg-black/20 bg-cover bg-center sm:w-44" style={selected?.banner_url ? { backgroundImage: `url(${selected.banner_url})` } : undefined}>
                        {!selected?.banner_url && <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">Баннер не загружен</div>}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-main)]">Баннер акции</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">JPG, PNG или WebP до 5 МБ</p>
                        <label className="mt-3 inline-flex cursor-pointer rounded-[14px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] hover:bg-white/[.04]">
                          Загрузить<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBanner(file); event.target.value = ""; }} />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div><h2 className="text-lg font-semibold text-[var(--text-main)]">Награды</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Можно наградить одного или обоих участников</p></div>
                  <button type="button" onClick={() => setRewardRules((rules) => [...rules, { ...emptyRule }])} className="rounded-[14px] border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--text-main)]">Добавить</button>
                </div>
                <div className="mt-5 space-y-3">
                  {rewardRules.map((rule, index) => (
                    <div key={index} className="grid gap-3 rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4 md:grid-cols-[1fr_1fr_140px_auto] md:items-end">
                      <div><label className={clientLabelCls}>Кому</label><select value={rule.recipient} onChange={(event) => setRewardRules((rules) => rules.map((item, i) => i === index ? { ...item, recipient: event.target.value as MarketingRewardRule["recipient"] } : item))} className={`mt-2 ${clientInputCls}`}><option value="referrer">Кто пригласил</option><option value="referred">Кого пригласили</option></select></div>
                      <div><label className={clientLabelCls}>Что получает</label><select value={rule.reward_type} onChange={(event) => setRewardRules((rules) => rules.map((item, i) => i === index ? { ...item, reward_type: event.target.value as MarketingRewardRule["reward_type"] } : item))} className={`mt-2 ${clientInputCls}`}><option value="free_visit">Бесплатное посещение</option><option value="discount_percent">Скидка</option></select></div>
                      <div><label className={clientLabelCls}>{rule.reward_type === "discount_percent" ? "Процент" : "Количество"}</label><input type="number" min="1" max={rule.reward_type === "discount_percent" ? 100 : undefined} value={rule.value} onChange={(event) => setRewardRules((rules) => rules.map((item, i) => i === index ? { ...item, value: Number(event.target.value) } : item))} className={`mt-2 ${clientInputCls}`} /></div>
                      <button type="button" disabled={rewardRules.length === 1} onClick={() => setRewardRules((rules) => rules.filter((_, i) => i !== index))} className="h-12 rounded-[16px] border border-[var(--line-soft)] px-3 text-sm text-[var(--text-muted)] disabled:opacity-30">Убрать</button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">{rewardSummary.map((item, index) => <span key={`${item}-${index}`} className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs text-[var(--accent)]">{item}</span>)}</div>
              </section>

              {!creating && selectedId && selected && (
                <section className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 sm:p-6">
                  <h2 className="text-lg font-semibold text-[var(--text-main)]">Участники</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">Оба клиента обязательно выбираются из CRM</p>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2"><ClientPicker label="Кто пригласил" value={referrer} onChange={setReferrer} /><ClientPicker label="Кого пригласили" value={referred} onChange={setReferred} /></div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end"><div><label className={clientLabelCls}>Комментарий</label><input value={referralNote} onChange={(event) => setReferralNote(event.target.value)} className={`mt-2 ${clientInputCls}`} placeholder="Необязательно" /></div><button type="button" disabled={saving} onClick={() => void addReferral()} className="h-12 rounded-[18px] bg-[var(--accent)] px-5 text-sm font-semibold text-[#062b26] disabled:opacity-50">Зафиксировать участие</button></div>

                  <div className="mt-6 space-y-3">
                    {selected.referrals.map((item) => (
                      <div key={item.id} className="rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0"><p className="font-medium text-[var(--text-main)]">{item.referrer_name} <span className="px-2 text-[var(--text-muted)]">→</span> {item.referred_name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{new Date(item.created_at).toLocaleDateString("ru-RU")}{item.note ? ` · ${item.note}` : ""}</p></div>
                          <select value={item.status} disabled={saving} onChange={(event) => void setReferralStatus(item.id, event.target.value as ReferralStatus)} className="rounded-[14px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none"><option value="registered">Зарегистрировано</option><option value="completed">Условие выполнено</option><option value="cancelled">Отменено</option></select>
                        </div>
                        {item.rewards.length > 0 && <div className="mt-4 grid gap-2 md:grid-cols-2">{item.rewards.map((reward) => { const issued = reward.status === "issued"; return <div key={reward.id} className="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--line-soft)] px-3 py-3"><div><p className="text-sm text-[var(--text-main)]">{rewardText(reward.reward_snapshot)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{issued ? "Выдано" : reward.status === "cancelled" ? "Отменено" : "Ожидает выдачи"}</p></div>{reward.status !== "cancelled" && <button type="button" disabled={saving} onClick={() => void toggleReward(reward.id, issued)} className={`shrink-0 rounded-[13px] px-3 py-2 text-xs ${issued ? "border border-[var(--line-soft)] text-[var(--text-muted)]" : "bg-[var(--accent)] font-semibold text-[#062b26]"}`}>{issued ? "Вернуть" : "Выдать"}</button>}</div>; })}</div>}
                      </div>
                    ))}
                    {selected.referrals.length === 0 && <div className="rounded-[20px] border border-dashed border-[var(--line-soft)] px-5 py-10 text-center text-sm text-[var(--text-muted)]">Участников пока нет</div>}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="flex min-h-[480px] items-center justify-center rounded-[28px] border border-dashed border-[var(--line-soft)] bg-[var(--bg-card)] px-6 text-center"><div><p className="text-lg font-medium text-[var(--text-main)]">Кампаний пока нет</p><p className="mt-2 text-sm text-[var(--text-muted)]">Создайте первую акцию и настройте правила один раз</p></div></div>
          )}
        </main>
      </div>
    </div>
  );
}
