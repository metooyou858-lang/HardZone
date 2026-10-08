import { apiFetch } from "./client";
import type { CompetitionPublicConfig } from "./competitions";
import type { ResultComponent } from "./competition-results";

export type CompetitionComplex = {
  id: string; name: string; start_time: string; briefing_time: string | null; venue: string;
  lanes: number; duration_minutes: number; gap_minutes: number; break_after_minutes: number;
  depends_on_complex_id: string | null; start_after_minutes: number; briefing_before_minutes: number | null;
  redistribute_by_overall: boolean; qualification_limit: number | null;
  scoring?: {components:ResultComponent[];is_final:boolean}; scoring_locked?:boolean;
};
export type CategorySchedule = { category_key: string; planned_count: number | null; complexes: CompetitionComplex[] };
export type ScheduleActivity = {id:string; kind:"briefing"|"break"|"awards"; name:string; venue:string; start_time:string; duration_minutes:number; depends_on_complex_id:string|null; start_after_minutes:number};
export type ScheduleConfig = { categories: CategorySchedule[]; activities?:ScheduleActivity[] };
export type ActivityPreview = {config:ScheduleConfig; shifts:{id:string;name:string;before:string;after:string;briefing_before:string|null;briefing_after:string|null;minutes:number}[]; errors:string[]; end_before:string|null;end_after:string|null;source_hash:string};
export type Heat = { number: number; start_time: string; end_time: string; combined_heat_id?:string; slots: { lane: number; registration_id: string | null; team_name: string | null }[] };
export type CombinedHeat = {id:string;group_id:string;number:number;start_time:string;end_time:string;venue:string;lanes:number;block_ids:string[];slots:{lane:number;registration_id:string|null;team_name:string|null;complex_id:string;complex_name:string;category_key:string;category_name:string}[]};
export type ScheduleBlock = CompetitionComplex & {
  kind?: "briefing"|"break"|"awards";
  category_key: string; category_name: string; complex_number: number; planned_count: number; confirmed_count: number;
  assignment: "registration" | "results" | "rating"; qualification_error?:string; end_time: string; available_after: string; heats: Heat[];
};
export type ScheduleGrid = { event_name: string; event_date: string | null; blocks: ScheduleBlock[]; errors: string[]; start_time: string | null; end_time: string | null; generated_at?: string; operational_updated_at?:string; combined_heats?:CombinedHeat[]; merge_summary?:{block_ids:string[];original_heat_count:number;combined_heat_count:number;saved_minutes:number} };
export type GridShiftPreview = {grid:ScheduleGrid;shifts:{id:string;name:string;before:string;after:string;minutes:number}[];errors:string[]};
export type GridMergePreview = {grid:ScheduleGrid;errors:string[];saved_minutes:number;original_heat_count:number;combined_heat_count:number};
export type CompetitionSchedule = {
  results_revision: number;
  competition: CompetitionPublicConfig; config: ScheduleConfig; revision: number; confirmed_counts: Record<string, number>;
  preview: ScheduleGrid; source_hash: string; grid: ScheduleGrid | null; grid_stale: boolean;
};

export async function fetchCompetitionSchedule(eventKey: string): Promise<CompetitionSchedule> {
  return (await apiFetch<{data:CompetitionSchedule}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule`)).data;
}
export async function saveCompetitionSchedule(eventKey: string, config: ScheduleConfig, revision: number, source_hash?:string, results_revision?:number): Promise<CompetitionSchedule> {
  return (await apiFetch<{data:CompetitionSchedule}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule`, {method:"PUT",body:JSON.stringify({config,revision,source_hash,results_revision})})).data;
}
export async function previewScheduleActivity(eventKey:string, activity:ScheduleActivity, revision:number):Promise<ActivityPreview> {
  return (await apiFetch<{data:ActivityPreview}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule/preview-activity`, {method:"POST",body:JSON.stringify({activity,revision})})).data;
}
export async function generateCompetitionSchedule(eventKey: string, revision: number, source_hash: string): Promise<CompetitionSchedule> {
  return (await apiFetch<{data:CompetitionSchedule}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule/generate`, {method:"POST",body:JSON.stringify({revision,source_hash})})).data;
}
function operationBody(data:CompetitionSchedule,input:Record<string,unknown>) {
  return JSON.stringify({...input,revision:data.revision,source_hash:data.source_hash});
}
export async function previewCompetitionScheduleShift(eventKey:string,data:CompetitionSchedule,blockId:string,startTime:string):Promise<GridShiftPreview> {
  return (await apiFetch<{data:GridShiftPreview}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule/preview-shift`,{method:"POST",body:operationBody(data,{block_id:blockId,start_time:startTime})})).data;
}
export async function applyCompetitionScheduleShift(eventKey:string,data:CompetitionSchedule,blockId:string,startTime:string):Promise<CompetitionSchedule> {
  return (await apiFetch<{data:CompetitionSchedule}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule/shift`,{method:"POST",body:operationBody(data,{block_id:blockId,start_time:startTime})})).data;
}
export async function previewCompetitionHeatMerge(eventKey:string,data:CompetitionSchedule,blockIds:string[]):Promise<GridMergePreview> {
  return (await apiFetch<{data:GridMergePreview}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule/preview-merge`,{method:"POST",body:operationBody(data,{block_ids:blockIds})})).data;
}
export async function applyCompetitionHeatMerge(eventKey:string,data:CompetitionSchedule,blockIds:string[]):Promise<CompetitionSchedule> {
  return (await apiFetch<{data:CompetitionSchedule}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule/merge`,{method:"POST",body:operationBody(data,{block_ids:blockIds})})).data;
}
