import {apiFetch} from './client';
import type {CompetitionPublicConfig} from './competitions';
import type {ScheduleBlock} from './competition-schedule';

export type ResultKind='time'|'reps'|'weight'|'time_or_reps';
export type ResultValue=number|{kind:'time'|'reps';value:number};
export type ResultComponent={name:string;kind:ResultKind};
export type WorkoutResults={components:ResultComponent[];is_final:boolean;entries:Record<string,(ResultValue|null)[]>;status:'draft'|'confirmed'};
export type ResultScore={complex_id:string;complex_name:string;component:string;kind:ResultKind;value:ResultValue;place:number;points:number};
export type LeaderRow={id:string;name:string;total:number;place:number|null;scores:ResultScore[]};
export type ResultsData={competition:CompetitionPublicConfig;revision:number;schedule_revision:number;source_hash:string;has_grid:boolean;grid_stale:boolean;hidden:boolean;closes_at:string|null;state:{workouts:Record<string,WorkoutResults>};blocks:(ScheduleBlock & {teams:{id:string;name:string;heat:number;lane:number}[];rankings:{id:string;place:number;points:number}[][]})[];standings:Record<string,LeaderRow[]>};
export function resultText(value:ResultValue|null|undefined,kind:ResultKind):string {
  if (value===null || value===undefined) return '';
  if (typeof value==='object') return `${resultText(value.value,value.kind)}${value.kind==='reps'?' повт.':''}`;
  return kind==='time' ? `${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}` : String(value);
}
export async function fetchCompetitionResults(eventKey:string):Promise<ResultsData> {
  return (await apiFetch<{data:ResultsData}>(`/competitions/events/${encodeURIComponent(eventKey)}/results`,{cache:'no-store'})).data;
}
export async function saveCompetitionResults(eventKey:string,data:ResultsData,input:Record<string,unknown>):Promise<ResultsData> {
  return (await apiFetch<{data:ResultsData}>(`/competitions/events/${encodeURIComponent(eventKey)}/results`,{method:'PUT',body:JSON.stringify({...input,revision:data.revision,schedule_revision:data.schedule_revision,source_hash:data.source_hash})})).data;
}
