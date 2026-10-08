"use client";

import { FormEvent, useState } from "react";
import {
  applyCompetitionHeatMerge,
  applyCompetitionScheduleShift,
  previewCompetitionHeatMerge,
  previewCompetitionScheduleShift,
  type CompetitionSchedule,
  type GridMergePreview,
  type GridShiftPreview,
} from "@/lib/api/competition-schedule";

const button = "min-h-11 rounded-xl border border-[var(--line-soft)] px-4 py-2 text-sm font-medium disabled:opacity-40";
const primary = `${button} bg-[var(--accent)] text-[#062b26]`;
const input = "mt-1 min-h-11 w-full rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] px-3 py-2 text-sm";

export default function CompetitionScheduleOperations({eventKey,data,onApplied}:{eventKey:string;data:CompetitionSchedule;onApplied:(value:CompetitionSchedule,message:string)=>void}) {
  const blocks = data.grid?.blocks.filter(block=>!block.kind) || [];
  const [shiftBlockId,setShiftBlockId]=useState(blocks[0]?.id || "");
  const selectedShiftBlock=blocks.find(block=>block.id===shiftBlockId) || blocks[0];
  const [shiftTime,setShiftTime]=useState(selectedShiftBlock?.start_time || "");
  const [shiftPreview,setShiftPreview]=useState<GridShiftPreview|null>(null);
  const [mergeIds,setMergeIds]=useState<string[]>([]);
  const [mergePreview,setMergePreview]=useState<GridMergePreview|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const eligible=blocks.filter(block=>block.heats.filter(heat=>heat.slots.length<block.lanes).length===1);

  async function previewShift(event:FormEvent) {
    event.preventDefault(); if(!selectedShiftBlock) return;
    setBusy(true);setError("");
    try{setShiftPreview(await previewCompetitionScheduleShift(eventKey,data,selectedShiftBlock.id,shiftTime));}
    catch(value){setError(value instanceof Error?value.message:"Не удалось рассчитать перенос");}
    finally{setBusy(false);}
  }
  async function applyShift() {
    if(!selectedShiftBlock)return;
    setBusy(true);setError("");
    try{onApplied(await applyCompetitionScheduleShift(eventKey,data,selectedShiftBlock.id,shiftTime),"Расписание перенесено. Все последующие блоки сдвинуты на ту же величину.");setShiftPreview(null);}
    catch(value){setError(value instanceof Error?value.message:"Не удалось перенести расписание");}
    finally{setBusy(false);}
  }
  async function previewMerge(event:FormEvent) {
    event.preventDefault();
    setBusy(true);setError("");
    try{setMergePreview(await previewCompetitionHeatMerge(eventKey,data,mergeIds));}
    catch(value){setError(value instanceof Error?value.message:"Не удалось рассчитать объединение");}
    finally{setBusy(false);}
  }
  async function applyMerge() {
    setBusy(true);setError("");
    try{onApplied(await applyCompetitionHeatMerge(eventKey,data,mergeIds),"Неполные заходы объединены. Полные заходы и категории результатов сохранены.");setMergePreview(null);setMergeIds([]);}
    catch(value){setError(value instanceof Error?value.message:"Не удалось объединить заходы");}
    finally{setBusy(false);}
  }

  return <details className="group rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
      <span><span className="block font-semibold">Корректировка опубликованной сетки</span><span className="mt-0.5 block text-xs text-[var(--text-muted)]">Перенос времени и объединение неполных заходов</span></span>
      <span aria-hidden="true" className="text-lg text-[var(--text-muted)] transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <div className="space-y-5 border-t border-[var(--line-soft)] p-4 sm:p-5">
      <p className="text-xs text-[var(--text-muted)]">Сначала проверьте предварительный вариант. Результаты команд и исходные настройки комплексов не меняются.</p>
    <form onSubmit={previewShift} className="space-y-3">
      <h3 className="text-sm font-medium">Перенести комплекс и всё расписание после него</h3>
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
        <label className="text-xs">Пункт расписания<select className={input} value={selectedShiftBlock?.id || ""} onChange={event=>{const block=blocks.find(item=>item.id===event.target.value);setShiftBlockId(event.target.value);setShiftTime(block?.start_time||"");setShiftPreview(null);}}>{blocks.map(block=><option className="bg-white text-black" key={block.id} value={block.id}>{block.category_name} · {block.name} · {block.start_time}</option>)}</select></label>
        <label className="text-xs">Новое начало<input className={input} required type="time" value={shiftTime} onChange={event=>{setShiftTime(event.target.value);setShiftPreview(null);}} /></label>
        <button className={button} disabled={busy||!selectedShiftBlock} type="submit">Показать перенос</button>
      </div>
      {shiftPreview&&<div className="space-y-2 rounded-lg border border-[var(--line-soft)] p-3 text-sm"><p>{shiftPreview.shifts.length?`Изменится ${shiftPreview.shifts.length} пунктов:`:"Время не изменилось."}</p>{shiftPreview.shifts.map(item=><div className="flex flex-wrap justify-between gap-2" key={item.id}><span>{item.name}</span><span>{item.before} → <strong>{item.after}</strong></span></div>)}{!!shiftPreview.errors.length&&<ul className="text-[var(--danger)]">{shiftPreview.errors.map(message=><li key={message}>{message}</li>)}</ul>}<button type="button" className={primary} disabled={busy||!!shiftPreview.errors.length||!shiftPreview.shifts.length} onClick={()=>void applyShift()}>Применить перенос</button></div>}
    </form>
    <form onSubmit={previewMerge} className="space-y-3 border-t border-[var(--line-soft)] pt-4">
      <div><h3 className="text-sm font-medium">Объединить неполные заходы категорий</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Полные заходы не участвуют. Совместимыми считаются комплексы с одной площадкой, количеством дорожек, длительностью и интервалом.</p></div>
      {data.grid?.combined_heats?.length?<p className="text-sm text-[var(--text-muted)]">В этой сетке объединение уже применено. Чтобы собрать другой вариант, пересформируйте сетку из настроек и примените объединение заново.</p>:eligible.length<2?<p className="text-sm text-[var(--text-muted)]">Сейчас нет двух совместимых неполных заходов для выбора.</p>:<>
        <div className="grid gap-2 sm:grid-cols-2">{eligible.map(block=><label className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--line-soft)] px-3 py-2 text-sm" key={block.id}><input type="checkbox" checked={mergeIds.includes(block.id)} onChange={event=>{setMergeIds(current=>event.target.checked?[...current,block.id]:current.filter(id=>id!==block.id));setMergePreview(null);}} /><span>{block.category_name} · {block.name}<span className="block text-xs text-[var(--text-muted)]">{block.heats.find(heat=>heat.slots.length<block.lanes)?.slots.length}/{block.lanes} мест · {block.start_time}</span></span></label>)}</div>
        <button className={button} disabled={busy||mergeIds.length<2} type="submit">Показать объединение</button>
      </>}
      {mergePreview&&<div className="space-y-2 rounded-lg border border-[var(--line-soft)] p-3 text-sm"><p>Неполных заходов: {mergePreview.original_heat_count} → <strong>{mergePreview.combined_heat_count}</strong>.</p><p>{mergePreview.saved_minutes?`Расписание станет короче на ${mergePreview.saved_minutes} мин.`:"Продолжительность расписания не изменится, но свободные дорожки будут заполнены."}</p>{!!mergePreview.errors.length&&<ul className="text-[var(--danger)]">{mergePreview.errors.map(message=><li key={message}>{message}</li>)}</ul>}<button type="button" className={primary} disabled={busy||!!mergePreview.errors.length} onClick={()=>void applyMerge()}>Применить объединение</button></div>}
    </form>
    {error&&<p role="alert" className="whitespace-pre-line text-sm text-[var(--danger)]">{error}</p>}
    </div>
  </details>;
}
