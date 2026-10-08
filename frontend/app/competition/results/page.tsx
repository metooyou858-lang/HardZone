"use client";

import {useEffect,useState} from "react";
import {resultText,type ResultKind,type ResultScore} from "@/lib/api/competition-results";

type PublicHeat={number:number;start_time:string;end_time:string;combined:boolean;slots:{lane:number;team_name:string|null;category_name:string}[]};
type PublicBlock={id:string;kind:"briefing"|"break"|"awards"|null;name:string;venue:string;start_time:string;end_time:string;category_name?:string;complex_number?:number;heats?:PublicHeat[]};
type PublicColumn={key:string;complex_id:string;complex_name:string;component_index:number;component:string;kind:ResultKind};
type PublicCategory={key:string;name:string;columns:PublicColumn[];rows:{name:string;place:number|null;total:number|null;scores:ResultScore[]}[]};
type PublicResults={name:string;date:string|null;location:string;final_published:boolean;final_hidden:boolean;schedule:{event_date:string|null;start_time:string|null;end_time:string|null;blocks:PublicBlock[]}|null;categories:PublicCategory[]};

const tab="min-h-11 border-b-2 px-1 text-sm font-semibold";
const eventDate=(value:string|null)=>value?new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"}):"Дата не указана";

export default function PublicCompetitionResults() {
  const [data,setData]=useState<PublicResults|null>(null);
  const [error,setError]=useState("");
  const [view,setView]=useState<"schedule"|"results">("schedule");
  const [category,setCategory]=useState("");
  useEffect(()=>{
    let disposed=false;
    const load=async()=>{try{const event=new URLSearchParams(window.location.search).get("event");const response=await fetch(`/api/public/competition/results${event?`?event=${encodeURIComponent(event)}`:""}`,{cache:"no-store"});const body=await response.json();if(!response.ok||!body.data)throw new Error(body.error||"Не удалось загрузить данные");if(!disposed){setData(body.data);setError("");}}catch(e){if(!disposed)setError(e instanceof Error?e.message:"Не удалось загрузить данные");}};
    void load();const timer=setInterval(()=>void load(),10000);const visibility=()=>{if(document.visibilityState==="visible")void load();};document.addEventListener("visibilitychange",visibility);return()=>{disposed=true;clearInterval(timer);document.removeEventListener("visibilitychange",visibility);};
  },[]);
  const selected=data?.categories.find(item=>item.key===category)||data?.categories[0];
  return <main className="min-h-dvh bg-[#f0ede4] px-4 py-8 text-[#121412] sm:px-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="border-b-2 border-[#9d9c2f] pb-5"><p className="text-sm font-bold tracking-[0.14em]">HARDZONE</p><h1 className="mt-2 break-words text-3xl font-bold">{data?.name||"Соревнование"}</h1>{data&&<p className="mt-2 text-sm text-[#686960]">{eventDate(data.date)} · {data.location}</p>}</header>
    <nav aria-label="Разделы страницы" className="flex gap-6 border-b border-[#121412]/20"><button className={`${tab} ${view==="schedule"?"border-[#9d9c2f]":"border-transparent text-[#686960]"}`} onClick={()=>setView("schedule")}>Расписание</button><button className={`${tab} ${view==="results"?"border-[#9d9c2f]":"border-transparent text-[#686960]"}`} onClick={()=>setView("results")}>Результаты</button></nav>
    {error&&<p role="alert" className="border border-red-800/30 bg-red-50 p-4">{error}</p>}{!data&&!error&&<p>Загружаем данные…</p>}
    {data&&view==="schedule"&&<Schedule schedule={data.schedule}/>}
    {data&&view==="results"&&<section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Сравнение результатов</h2><p className="mt-1 text-sm text-[#686960]">Подтверждённые результаты обновляются автоматически.</p></div><div className="flex flex-wrap gap-2">{data.categories.map(item=><button key={item.key} aria-pressed={selected?.key===item.key} onClick={()=>setCategory(item.key)} className={`min-h-11 rounded-lg border border-[#121412]/30 px-4 text-sm ${selected?.key===item.key?"bg-[#c4c33a] font-semibold":"bg-transparent"}`}>{item.name}</button>)}</div></div>{data.final_hidden&&<p className="border-y border-[#121412]/20 py-3 text-sm font-medium">Финальные заходы видны в расписании. Результаты финала и итоговые места будут опубликованы после награждения.</p>}<ResultsTable category={selected}/></section>}
  </div></main>;
}

function Schedule({schedule}:{schedule:PublicResults["schedule"]}) {
  if(!schedule)return <p className="py-10 text-[#686960]">Финальная сетка ещё не опубликована.</p>;
  const names={briefing:"Брифинг",break:"Перерыв",awards:"Награждение"};
  return <section className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Полное расписание</h2><p className="mt-1 text-sm text-[#686960]">Заходы, дорожки и команды из опубликованной сетки.</p></div><strong className="tabular-nums">{schedule.start_time}–{schedule.end_time}</strong></div>{schedule.blocks.map(block=>block.kind?<article key={block.id} className="grid gap-2 border-y border-[#121412]/20 px-3 py-4 sm:grid-cols-[120px_minmax(0,1fr)_150px]"><strong className="tabular-nums">{block.start_time}–{block.end_time}</strong><span><strong>{block.name}</strong><span className="mt-1 block text-xs text-[#686960]">{names[block.kind]}</span></span><span className="text-sm text-[#686960] sm:text-right">{block.venue}</span></article>:<article key={block.id} className="border border-[#121412]/20 bg-white/35"><header className="flex flex-wrap justify-between gap-3 p-4"><div><h3 className="font-bold">{block.category_name} · {block.name}</h3><p className="mt-1 text-xs text-[#686960]">{block.venue}</p></div><strong className="tabular-nums">{block.start_time}–{block.end_time}</strong></header><div className="border-t border-[#121412]/20">{block.heats?.map(heat=><div className="grid border-b border-[#121412]/15 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)]" key={`${block.id}-${heat.number}-${heat.start_time}`}><div className="p-3 text-sm"><strong>{heat.start_time}–{heat.end_time}</strong><span className="mt-1 block text-xs text-[#686960]">{heat.combined?"Общий заход":"Заход"} {heat.number}</span></div><ol className="grid sm:grid-cols-2 lg:grid-cols-4">{heat.slots.map(slot=><li className="relative min-h-16 border-l border-t border-[#121412]/15 px-8 py-4 text-sm" key={slot.lane}><span className="absolute left-2 top-2 text-xs text-[#686960]">{slot.lane}</span><strong className="break-words">{slot.team_name||"Ожидается"}</strong>{heat.combined&&<span className="mt-1 block text-xs text-[#686960]">{slot.category_name}</span>}</li>)}</ol></div>)}</div></article>)}</section>;
}

function ResultsTable({category}:{category:PublicCategory|undefined}) {
  if(!category)return <p className="py-8 text-[#686960]">Категории не настроены.</p>;
  return <div className="overflow-x-auto border border-[#121412]/20 bg-white/35"><table className="w-full min-w-[760px] border-collapse text-sm"><thead><tr className="bg-[#dedbd0]"><th className="sticky left-0 z-20 w-16 border-b border-r border-[#121412]/20 bg-[#dedbd0] px-3 py-3 text-left">Место</th><th className="sticky left-16 z-20 min-w-48 border-b border-r border-[#121412]/20 bg-[#dedbd0] px-3 py-3 text-left">Команда</th>{category.columns.map(column=><th className="min-w-40 border-b border-r border-[#121412]/20 px-3 py-3 text-left" key={column.key}>{column.complex_name}<span className="mt-1 block text-xs font-normal text-[#686960]">{column.component}</span></th>)}<th className="min-w-24 border-b border-[#121412]/20 px-3 py-3 text-right">Всего</th></tr></thead><tbody>{category.rows.map(row=><tr key={row.name}><td className="sticky left-0 z-10 border-b border-r border-[#121412]/15 bg-[#f0ede4] px-3 py-3 font-bold">{row.place??"—"}</td><th scope="row" className="sticky left-16 z-10 border-b border-r border-[#121412]/15 bg-[#f0ede4] px-3 py-3 text-left font-semibold">{row.name}</th>{category.columns.map(column=>{const score=row.scores.filter(item=>item.complex_id===column.complex_id)[column.component_index];return <td className="border-b border-r border-[#121412]/15 px-3 py-3" key={column.key}>{score?<><strong className="tabular-nums">{resultText(score.value,score.kind)}</strong><span className="mt-1 block text-xs text-[#686960]">{score.place}-е место · {score.points} баллов</span></>:<span className="text-[#77786f]">—</span>}</td>})}<td className="border-b border-[#121412]/15 px-3 py-3 text-right font-bold tabular-nums">{row.total??"—"}</td></tr>)}</tbody></table>{!category.rows.length&&<p className="p-5 text-sm text-[#686960]">Команды появятся после публикации финальной сетки.</p>}</div>;
}
