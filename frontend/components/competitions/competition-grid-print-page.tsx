"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {fetchCompetitionResults,type ResultsData} from "@/lib/api/competition-results";

type PrintableHeat={id:string;number:number;start_time:string;end_time:string;combined:boolean;slots:{lane:number;registration_id:string|null;team_name:string|null;category_name:string}[]};

export default function CompetitionGridPrintPage({eventKey,complexId}:{eventKey:string;complexId:string}) {
  const [data,setData]=useState<ResultsData|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;void fetchCompetitionResults(eventKey).then(value=>{if(active)setData(value);}).catch(value=>{if(active)setError(value instanceof Error?value.message:"Не удалось загрузить сетку");});return()=>{active=false;};},[eventKey]);
  const block=data?.blocks.find(item=>item.id===complexId);
  const printBlocks=useMemo(()=>block&&data?data.blocks.filter(item=>item.complex_number===block.complex_number):[],[data,block]);
  const heats=useMemo<PrintableHeat[]>(()=>{
    if(!data||!block)return[];
    const blockIds=new Set(printBlocks.map(item=>item.id));
    const regular=printBlocks.flatMap(item=>item.heats.filter(heat=>!heat.combined_heat_id).map(heat=>({id:`${item.id}-${heat.number}`,number:heat.number,start_time:heat.start_time,end_time:heat.end_time,combined:false,slots:heat.slots.map(slot=>({...slot,category_name:item.category_name}))})));
    const shared=data.combined_heats.filter(heat=>heat.block_ids.some(id=>blockIds.has(id))).map(heat=>({id:heat.id,number:heat.number,start_time:heat.start_time,end_time:heat.end_time,combined:true,slots:heat.slots.map(slot=>({lane:slot.lane,registration_id:slot.registration_id,team_name:slot.team_name,category_name:slot.category_name}))}));
    return [...regular,...shared].sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.number-b.number);
  },[data,block,printBlocks]);
  const ready=!!block&&printBlocks.length>0&&heats.length>0&&heats.every(heat=>heat.slots.length>0&&heat.slots.every(slot=>slot.registration_id&&slot.team_name));
  const categoryNames=printBlocks.map(item=>item.category_name);
  const showCategory=categoryNames.length>1||heats.some(heat=>heat.combined);
  const firstStart=printBlocks.map(item=>item.start_time).sort()[0];
  const previousEnd=data?.blocks.filter(item=>block&&item.complex_number<block.complex_number).map(item=>item.end_time).sort().at(-1);
  const briefings=data?.briefings.filter(item=>(!previousEnd||item.start_time>=previousEnd)&&(!firstStart||item.end_time<=firstStart))||[];
  const back=`/competitions?event=${encodeURIComponent(eventKey)}&section=results`;

  return <div className="competition-print-root min-h-full bg-[#eef1f3] px-4 py-6 text-[#182026] sm:px-6 print:bg-white print:p-0">
    <div className="print-controls mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
      <Link className="inline-flex min-h-11 items-center rounded-lg border border-[#cbd3d9] bg-white px-4 py-2 text-sm font-medium" href={back}>Назад к результатам</Link>
      <button className="min-h-11 rounded-lg bg-[#29d3b2] px-5 py-2 text-sm font-semibold text-[#07352e] disabled:opacity-40" disabled={!ready} onClick={()=>window.print()}>Печать</button>
    </div>
    {error&&<p role="alert" className="mx-auto max-w-[210mm] bg-white p-5 text-sm text-red-700">{error}</p>}
    {!data&&!error&&<p className="mx-auto max-w-[210mm] bg-white p-5 text-sm text-slate-600">Загружаем сетку…</p>}
    {data&&!block&&<p className="mx-auto max-w-[210mm] bg-white p-5 text-sm text-red-700">Комплекс не найден в актуальной сетке.</p>}
    {data&&block&&<main className="print-sheet mx-auto max-w-[210mm] bg-white px-8 py-9 shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <header className="mb-6 border-b-2 border-[#29a98f] pb-4">
        <p className="text-sm font-medium text-[#52616b]">{data.competition.name}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#142129]">{block.name}</h1>
        <p className="mt-1 text-sm text-[#52616b]">{categoryNames.join(" · ")}</p>
      </header>
      {!!briefings.length&&<div className="mb-4 border border-[#cbd3d9] bg-[#f8fafb] px-3 py-2.5 text-sm">{briefings.map(item=><p className="flex justify-between gap-4" key={item.id}><strong>{item.name}</strong><span className="shrink-0 tabular-nums">{item.start_time}–{item.end_time}</span></p>)}</div>}
      {!ready?<div className="border border-[#d8dee3] bg-[#f8fafb] p-5 text-sm text-[#52616b]">Ожидаются результаты предыдущего комплекса. Печать станет доступна после распределения всех команд обеих категорий.</div>:<table className="w-full border-collapse text-sm">
        <thead><tr className="bg-[#edf1f3] text-left text-[#27343c]"><th className="w-[14%] border border-[#cbd3d9] px-3 py-2.5 font-semibold">Заход</th><th className="w-[17%] border border-[#cbd3d9] px-3 py-2.5 font-semibold">Время</th><th className="w-[11%] border border-[#cbd3d9] px-3 py-2.5 text-center font-semibold">Дорожка</th><th className="border border-[#cbd3d9] px-3 py-2.5 font-semibold">Команда</th>{showCategory&&<th className="w-[20%] border border-[#cbd3d9] px-3 py-2.5 font-semibold">Категория</th>}</tr></thead>
        {heats.map(heat=><tbody className="break-inside-avoid" key={heat.id}>{heat.slots.map((slot,slotIndex)=><tr key={`${heat.id}-${slot.lane}`}>
          {slotIndex===0&&<><th scope="rowgroup" rowSpan={heat.slots.length} className="border border-[#cbd3d9] px-3 py-3 text-left align-top font-semibold">{heat.combined?`Общий № ${heat.number}`:`№ ${heat.number}`}</th><td rowSpan={heat.slots.length} className="border border-[#cbd3d9] px-3 py-3 align-top tabular-nums">{heat.start_time}–{heat.end_time}</td></>}
          <td className="border border-[#cbd3d9] px-3 py-3 text-center font-semibold tabular-nums">{slot.lane}</td><td className="border border-[#cbd3d9] px-3 py-3 font-medium">{slot.team_name}</td>{showCategory&&<td className="border border-[#cbd3d9] px-3 py-3 text-[#52616b]">{slot.category_name}</td>}
        </tr>)}</tbody>)}
      </table>}
    </main>}
    <style jsx global>{`
      @page { size: A4 portrait; margin: 12mm; }
      @media print {
        html, body { background: white !important; color: #182026 !important; }
        body * { visibility: hidden; }
        .competition-print-root, .competition-print-root * { visibility: visible; }
        .competition-print-root { position: absolute; inset: 0; width: 100%; min-height: auto; }
        .print-controls, aside { display: none !important; }
        .app-grid { display: block !important; background: white !important; }
        .crm-workspace-background { height: auto !important; min-height: auto !important; background: white !important; }
        .crm-workspace-watermark { display: none !important; }
        .crm-page { overflow: visible !important; }
      }
    `}</style>
  </div>;
}
