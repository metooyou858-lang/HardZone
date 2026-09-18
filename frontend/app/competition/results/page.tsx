"use client";

import {useEffect,useState} from 'react';
import {resultText,type ResultScore} from '@/lib/api/competition-results';

type PublicResults={name:string;hidden:boolean;closes_at:string|null;categories?:{key:string;name:string;rows:{name:string;place:number;total:number;scores:ResultScore[]}[]}[]};
export default function PublicCompetitionResults() {
  const [data,setData]=useState<PublicResults|null>(null);
  const [error,setError]=useState('');
  const [category,setCategory]=useState('');
  useEffect(()=>{
    let disposed=false;
    let cutoff:ReturnType<typeof setTimeout>|undefined;
    let sequence=0;
    let permanentlyHidden=false;
    const hide=()=>{permanentlyHidden=true;setData(current=>current?{name:current.name,hidden:true,closes_at:current.closes_at}:null);};
    const load=async()=>{
      const request=++sequence;
      try {
        const event=new URLSearchParams(window.location.search).get('event');
        const response=await fetch(`/api/public/competition/results${event?`?event=${encodeURIComponent(event)}`:''}`,{cache:'no-store'});
        const body=await response.json();
        if (!response.ok || !body.data) throw new Error(body.error || 'Не удалось загрузить результаты');
        if(disposed || request!==sequence) return;
        const value=body.data as PublicResults;
        if(value.hidden || (value.closes_at && Date.now()>=Date.parse(value.closes_at))) permanentlyHidden=true;
        setData(permanentlyHidden?{name:value.name,hidden:true,closes_at:value.closes_at}:value);setError('');
        if(cutoff) clearTimeout(cutoff);
        if(!permanentlyHidden && value.closes_at) {
          const delay=Date.parse(value.closes_at)-Date.now();
          if(delay<=2147483647) cutoff=setTimeout(hide,Math.max(0,delay));
        }
      }catch(e){if(!disposed && request===sequence){setData(current=>current?.hidden?current:null);setError(e instanceof Error?e.message:'Не удалось загрузить результаты');}}
    };
    void load();const timer=setInterval(()=>void load(),10000);
    const visibility=()=>{if(document.visibilityState==='visible') void load();};
    document.addEventListener('visibilitychange',visibility);
    return()=>{disposed=true;clearInterval(timer);if(cutoff)clearTimeout(cutoff);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  const selected=data?.categories?.find(item=>item.key===category) || data?.categories?.[0];
  return <main className="min-h-dvh bg-[#f0ede4] px-5 py-10 text-[#121412] sm:px-10"><div className="mx-auto max-w-4xl space-y-6"><p className="text-sm font-semibold tracking-wider">HARDZONE</p><h1 className="break-words text-3xl font-bold">{data?.name || 'Результаты соревнования'}</h1>{error && <p role="alert">{error}</p>}{!data && !error && <p>Загружаем результаты…</p>}{data?.hidden?<div className="border-y border-[#121412]/20 py-12"><h2 className="text-2xl font-semibold">Финал начался</h2><p className="mt-3">Результаты и общий рейтинг скрыты. Сохраним интригу до награждения.</p></div>:data && <><nav className="flex flex-wrap gap-3">{data.categories?.map(item=><button key={item.key} aria-pressed={selected?.key===item.key} onClick={()=>setCategory(item.key)} className={`min-h-11 rounded-lg border border-[#121412]/30 px-4 ${selected?.key===item.key?'bg-[#c4c33a]':''}`}>{item.name}</button>)}</nav><p className="text-sm text-[#686960]">Подтверждённые результаты. Обновляются автоматически.</p>{selected?.rows.map((row,index)=><details key={index} className="border-b border-[#121412]/20 py-4"><summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"><span className="grid w-full grid-cols-[24px_minmax(0,1fr)_48px] gap-2"><strong>{row.place}</strong><span className="break-words">{row.name}</span><strong className="text-right">{row.total}</strong></span></summary><div className="mt-4 space-y-3 text-sm">{row.scores.map((score,i)=><div key={i} className="flex flex-wrap justify-between gap-2"><span>{score.complex_name} · {score.component}: {resultText(score.value,score.kind)}</span><span>{score.place}-е место · {score.points} баллов</span></div>)}</div></details>)}{!selected?.rows.length && <p className="py-8">Подтверждённых результатов пока нет.</p>}</>}</div></main>;
}
