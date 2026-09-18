import { apiFetch } from "./client";
import type { CompetitionPublicConfig } from "./competitions";

export type CompetitionComplex = {
  id: string; name: string; start_time: string; briefing_time: string | null; venue: string;
  lanes: number; duration_minutes: number; gap_minutes: number; break_after_minutes: number;
};
export type CategorySchedule = { category_key: string; planned_count: number | null; complexes: CompetitionComplex[] };
export type ScheduleActivity = {id:string; kind:"break"|"awards"; name:string; venue:string; start_time:string; duration_minutes:number};
export type ScheduleConfig = { categories: CategorySchedule[]; activities?:ScheduleActivity[] };
export type ActivityPreview = {config:ScheduleConfig; shifts:{id:string;name:string;before:string;after:string;briefing_before:string|null;briefing_after:string|null;minutes:number}[]; errors:string[]; end_before:string|null;end_after:string|null;source_hash:string};
export type Heat = { number: number; start_time: string; end_time: string; slots: { lane: number; registration_id: string | null; team_name: string | null }[] };
export type ScheduleBlock = CompetitionComplex & {
  kind?: "break"|"awards";
  category_key: string; category_name: string; complex_number: number; planned_count: number; confirmed_count: number;
  assignment: "registration" | "results" | "rating"; end_time: string; available_after: string; heats: Heat[];
};
export type ScheduleGrid = { event_name: string; event_date: string | null; blocks: ScheduleBlock[]; errors: string[]; start_time: string | null; end_time: string | null; generated_at?: string };
export type CompetitionSchedule = {
  competition: CompetitionPublicConfig; config: ScheduleConfig; revision: number; confirmed_counts: Record<string, number>;
  preview: ScheduleGrid; source_hash: string; grid: ScheduleGrid | null; grid_stale: boolean;
};

export async function fetchCompetitionSchedule(eventKey: string): Promise<CompetitionSchedule> {
  return (await apiFetch<{data:CompetitionSchedule}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule`)).data;
}
export async function saveCompetitionSchedule(eventKey: string, config: ScheduleConfig, revision: number, source_hash?:string): Promise<CompetitionSchedule> {
  return (await apiFetch<{data:CompetitionSchedule}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule`, {method:"PUT",body:JSON.stringify({config,revision,source_hash})})).data;
}
export async function previewScheduleActivity(eventKey:string, activity:ScheduleActivity, revision:number):Promise<ActivityPreview> {
  return (await apiFetch<{data:ActivityPreview}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule/preview-activity`, {method:"POST",body:JSON.stringify({activity,revision})})).data;
}
export async function generateCompetitionSchedule(eventKey: string, revision: number, source_hash: string): Promise<CompetitionSchedule> {
  return (await apiFetch<{data:CompetitionSchedule}>(`/competitions/events/${encodeURIComponent(eventKey)}/schedule/generate`, {method:"POST",body:JSON.stringify({revision,source_hash})})).data;
}
